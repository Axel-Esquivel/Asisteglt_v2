import { Injectable } from '@nestjs/common';
import {
  EvidenceResponse,
  InventoryErrorCode,
  InventoryEvent,
  ProjectPermission,
  RealtimeEvent,
} from '@asisteglt/shared-contracts';
import { RealtimeEventPublisher, UsersAudience } from '../../chat/domain/ports';
import { Clock, EntityId, NotFoundError, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project, ProjectMember } from '../../projects/domain/project';
import { User } from '../../iam/domain/user';
import { UserDirectory } from '../../iam/application/user-directory';
import { FileStorage } from '../../reports/domain/ports';
import { InventoryCount, RoundSnapshot } from '../domain/inventory-count';
import { EvidenceSnapshot } from '../domain/inventory-records';
import { EvidenceRepository, InventoryCountRepository } from '../domain/ports';

/** Imagen recibida: contenido y tipo detectado por sus primeros bytes (no por la extensión). */
export class EvidenceImage {
  private constructor(
    public readonly bytes: Uint8Array,
    public readonly contentType: string,
  ) {}

  public static detect(bytes: Uint8Array): Nullable<EvidenceImage> {
    const starts = (...signature: number[]): boolean =>
      signature.every((b: number, i: number): boolean => bytes[i] === b);
    const ascii = (from: number, text: string): boolean =>
      [...text].every((c: string, i: number): boolean => bytes[from + i] === c.charCodeAt(0));
    if (starts(0xff, 0xd8, 0xff)) {
      return new EvidenceImage(bytes, 'image/jpeg');
    }
    if (starts(0x89, 0x50, 0x4e, 0x47)) {
      return new EvidenceImage(bytes, 'image/png');
    }
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
      return new EvidenceImage(bytes, 'image/webp');
    }
    return null;
  }
}

/** Contenido de una foto para devolver al navegador. */
export class EvidenceFile {
  public constructor(
    public readonly bytes: Uint8Array,
    public readonly contentType: string,
  ) {}
}

/** Fotos de evidencia de los ítems de una toma (RF-INV): las suben quienes cuentan o supervisan. */
@Injectable()
export class EvidenceService {
  public static readonly MAX_BYTES: number = 5 * 1024 * 1024;
  public static readonly MAX_PER_ITEM: number = 5;

  public constructor(
    private readonly counts: InventoryCountRepository,
    private readonly evidence: EvidenceRepository,
    private readonly storage: FileStorage,
    private readonly access: ProjectAccess,
    private readonly directory: UserDirectory,
    private readonly publisher: RealtimeEventPublisher,
    private readonly clock: Clock,
  ) {}

  public async add(
    projectId: string,
    userId: EntityId,
    countId: string,
    itemId: string,
    bytes: Uint8Array,
  ): Promise<Result<EvidenceResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_COUNT)).flatMapAsync(
      async (p: Project): Promise<Result<EvidenceResponse>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (count: InventoryCount): Promise<Result<EvidenceResponse>> => {
            const round: Nullable<RoundSnapshot> = count.currentRound();
            const supervisor: boolean = p.can(userId, ProjectPermission.INVENTORY_SUPERVISE);
            if (round === null || (!supervisor && !count.isAssigned(userId.toString(), itemId))) {
              return EvidenceService.invalid('Solo se agregan fotos a ítems asignados en la ronda abierta');
            }
            if (bytes.length > EvidenceService.MAX_BYTES) {
              return EvidenceService.invalid('La foto supera 5 MB');
            }
            const image: Nullable<EvidenceImage> = EvidenceService.image(bytes);
            if (image === null) {
              return EvidenceService.invalid('Solo se aceptan fotos JPEG, PNG o WebP');
            }
            const existing: number = (await this.evidence.findByCount(count.getId().toString())).filter(
              (e: EvidenceSnapshot): boolean => e.itemId === itemId,
            ).length;
            if (existing >= EvidenceService.MAX_PER_ITEM) {
              return EvidenceService.invalid(
                `Un ítem admite hasta ${String(EvidenceService.MAX_PER_ITEM)} fotos`,
              );
            }
            const id: string = EntityId.generate().toString();
            const snapshot: EvidenceSnapshot = {
              id,
              countId: count.getId().toString(),
              itemId,
              round: round.number,
              userId: userId.toString(),
              contentType: image.contentType,
              size: bytes.length,
              storageKey: `inventory/${count.getId().toString()}/${id}`,
              createdAt: this.clock.now(),
            };
            await this.storage.put(snapshot.storageKey, image.bytes);
            await this.evidence.add(snapshot);
            const event: InventoryEvent = {
              projectId: p.getId().toString(),
              countId: count.getId().toString(),
            };
            this.publisher.publish(
              new UsersAudience(p.getMembers().map((m: ProjectMember): EntityId => m.userId)),
              RealtimeEvent.INVENTORY_CHANGED,
              event,
            );
            return Result.ok((await this.present([snapshot]))[0] ?? EvidenceService.blank(snapshot));
          },
        ),
    );
  }

  public async list(
    projectId: string,
    userId: EntityId,
    countId: string,
    itemId: string,
  ): Promise<Result<EvidenceResponse[]>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<EvidenceResponse[]>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (count: InventoryCount): Promise<Result<EvidenceResponse[]>> => {
            const all: EvidenceSnapshot[] = (
              await this.evidence.findByCount(count.getId().toString())
            ).filter(
              (e: EvidenceSnapshot): boolean =>
                e.itemId === itemId &&
                (p.can(userId, ProjectPermission.INVENTORY_VIEW) || e.userId === userId.toString()),
            );
            return Result.ok(await this.present(all));
          },
        ),
    );
  }

  /** El archivo de una foto: quien supervisa ve todas; quien cuenta, las suyas. */
  public async file(
    projectId: string,
    userId: EntityId,
    countId: string,
    evidenceId: string,
  ): Promise<Result<EvidenceFile>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<EvidenceFile>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (count: InventoryCount): Promise<Result<EvidenceFile>> => {
            const found: Nullable<EvidenceSnapshot> = (await this.evidence.findById(evidenceId))
              .filter(
                (e: EvidenceSnapshot): boolean =>
                  e.countId === count.getId().toString() &&
                  (p.can(userId, ProjectPermission.INVENTORY_VIEW) || e.userId === userId.toString()),
              )
              .toNullable();
            const bytes: Nullable<Uint8Array> =
              found === null ? null : await this.storage.get(found.storageKey);
            return found === null || bytes === null
              ? Result.fail(new NotFoundError(InventoryErrorCode.EVIDENCE_NOT_FOUND, 'La foto no existe'))
              : Result.ok(new EvidenceFile(bytes, found.contentType));
          },
        ),
    );
  }

  private static image(bytes: Uint8Array): Nullable<EvidenceImage> {
    return EvidenceImage.detect(bytes);
  }

  private async present(items: ReadonlyArray<EvidenceSnapshot>): Promise<EvidenceResponse[]> {
    const ids: EntityId[] = [...new Set(items.map((e: EvidenceSnapshot): string => e.userId))]
      .map((id: string): Result<EntityId> => EntityId.fromString(id))
      .filter((r: Result<EntityId>): boolean => r.isOk())
      .map((r: Result<EntityId>): EntityId => r.unwrap());
    const names: Map<string, string> = new Map<string, string>(
      (await this.directory.findMany(ids)).map((u: User): [string, string] => [
        u.getId().toString(),
        u.getDisplayName(),
      ]),
    );
    return items.map((e: EvidenceSnapshot): EvidenceResponse => ({
      ...EvidenceService.blank(e),
      uploadedBy: names.get(e.userId) ?? '',
    }));
  }

  private static blank(e: EvidenceSnapshot): EvidenceResponse {
    return {
      id: e.id,
      itemId: e.itemId,
      round: e.round,
      uploadedBy: '',
      contentType: e.contentType,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private async find(project: Project, countId: string): Promise<Result<InventoryCount>> {
    const id: Result<EntityId> = EntityId.fromString(countId);
    const found: Nullable<InventoryCount> = id.isOk()
      ? (await this.counts.findById(id.unwrap()))
          .filter((c: InventoryCount): boolean => c.belongsTo(project.getId()))
          .toNullable()
      : null;
    return found === null
      ? Result.fail(new NotFoundError(InventoryErrorCode.COUNT_NOT_FOUND, 'La toma no existe'))
      : Result.ok(found);
  }

  private static invalid<T>(message: string): Result<T> {
    return Result.fail(new ValidationError(InventoryErrorCode.INVALID_EVIDENCE, message));
  }
}
