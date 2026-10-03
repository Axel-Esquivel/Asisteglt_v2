import { Injectable } from '@nestjs/common';
import {
  CountPackageDto,
  CountResponse,
  InventoryErrorCode,
  ItemCondition,
  ItemStatusResponse,
  PackageItemDto,
  ProjectPermission,
} from '@asisteglt/shared-contracts';
import {
  Clock,
  Decimal,
  EntityId,
  NotFoundError,
  Nullable,
  Result,
  ValidationError,
} from '@asisteglt/shared-kernel';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project } from '../../projects/domain/project';
import { InventoryCount } from '../domain/inventory-count';
import { CountEntrySnapshot, InventoryItemSnapshot } from '../domain/inventory-records';
import { CountEntryRepository, InventoryCountRepository, InventoryItemRepository } from '../domain/ports';
import { CountLedger } from './count-ledger';
import { InventoryService } from './inventory.service';

/**
 * Paquetes de toma: exporta ítems y resultados finales a JSON e importa ese JSON como una toma
 * cerrada en otro servidor (p. ej. de la laptop de bodega al servidor central).
 */
@Injectable()
export class CountPackageService {
  public static readonly FORMAT = 'asisteglt.inventory-count' as const;

  public constructor(
    private readonly counts: InventoryCountRepository,
    private readonly items: InventoryItemRepository,
    private readonly entries: CountEntryRepository,
    private readonly inventory: InventoryService,
    private readonly access: ProjectAccess,
    private readonly clock: Clock,
  ) {}

  public async export(
    projectId: string,
    userId: EntityId,
    countId: string,
  ): Promise<Result<CountPackageDto>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<CountPackageDto>> => {
        const count: Nullable<InventoryCount> = await this.find(p, countId);
        if (count === null) {
          return Result.fail(new NotFoundError(InventoryErrorCode.COUNT_NOT_FOUND, 'La toma no existe'));
        }
        const id: string = count.getId().toString();
        const items: InventoryItemSnapshot[] = await this.items.findByCount(id);
        const ledger: CountLedger = new CountLedger(
          items,
          await this.entries.findByCount(id),
          count.getTolerance(),
        );
        const view: CountResponse = (await this.inventory.get(projectId, userId, countId)).unwrap();
        const statuses: Map<string, ItemStatusResponse> = new Map<string, ItemStatusResponse>(
          ledger
            .statuses(await this.inventory.participantNames(count), new Map<string, number>())
            .map((s: ItemStatusResponse): [string, ItemStatusResponse] => [s.itemId, s]),
        );
        const s = count.toSnapshot();
        return Result.ok({
          format: CountPackageService.FORMAT,
          version: 1,
          exportedAt: this.clock.now().toISOString(),
          settings: {
            name: view.name,
            warehouse: view.warehouse,
            toleranceKind: s.toleranceKind,
            toleranceValue: s.toleranceValue,
            maxRounds: s.maxRounds,
          },
          items: items.map((item: InventoryItemSnapshot): PackageItemDto => {
            const status: Nullable<ItemStatusResponse> = statuses.get(item.id) ?? null;
            return {
              sku: item.sku,
              description: item.description,
              unit: item.unit,
              location: item.location,
              expectedQuantity: item.expectedQuantity,
              unitCost: item.unitCost,
              x: item.x,
              y: item.y,
              counted: status === null ? null : status.counted,
              condition: status === null ? null : status.condition,
              comment: status === null ? '' : status.comment,
              counter: status === null ? '' : (status.counterName ?? ''),
              rounds: status === null ? 0 : status.rounds,
            };
          }),
        });
      },
    );
  }

  public async import(
    projectId: string,
    userId: EntityId,
    pkg: CountPackageDto,
  ): Promise<Result<CountResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_CONFIGURE)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse>> => {
        if (pkg.format !== CountPackageService.FORMAT || pkg.version !== 1) {
          return CountPackageService.invalid('El archivo no es un paquete de toma de AsisteGLT (versión 1)');
        }
        const parsed: Result<InventoryItemSnapshot[]> = InventoryService.parseItems('pendiente', pkg.items);
        if (!parsed.isOk()) {
          return Result.fail(
            parsed.errorOrNull() ?? new ValidationError(InventoryErrorCode.INVALID_ITEMS, 'Ítems inválidos'),
          );
        }
        for (const [index, item] of pkg.items.entries()) {
          if (item.counted !== null && !Decimal.of(item.counted).isOk()) {
            return CountPackageService.invalid(
              `Ítem ${String(index + 1)}: la cantidad contada no es un número`,
            );
          }
        }
        const created: Result<InventoryCount> = InventoryCount.imported(
          p.getId(),
          { ...pkg.settings, name: `${pkg.settings.name} (importada)`.slice(0, 120) },
          parsed.unwrap().map((i: InventoryItemSnapshot): string => i.id),
          userId.toString(),
          this.clock,
        );
        if (!created.isOk()) {
          return Result.fail(created.errorOrNull() ?? CountPackageService.error('Configuración inválida'));
        }
        const count: InventoryCount = created.unwrap();
        const countId: string = count.getId().toString();
        const snapshots: InventoryItemSnapshot[] = parsed
          .unwrap()
          .map((i: InventoryItemSnapshot): InventoryItemSnapshot => ({ ...i, countId }));
        await this.counts.save(count);
        await this.items.replaceForCount(countId, snapshots);
        const now: Date = this.clock.now();
        for (const [index, item] of pkg.items.entries()) {
          const snapshot: Nullable<InventoryItemSnapshot> = snapshots[index] ?? null;
          if (item.counted === null || snapshot === null) {
            continue;
          }
          const entry: CountEntrySnapshot = {
            id: EntityId.generate().toString(),
            countId,
            round: 1,
            itemId: snapshot.id,
            counterId: userId.toString(),
            quantity: Decimal.of(item.counted).unwrap().toString(),
            comment: [item.comment.trim(), item.counter.trim() === '' ? '' : `Contó: ${item.counter.trim()}`]
              .filter((part: string): boolean => part !== '')
              .join(' · ')
              .slice(0, 500),
            condition: item.condition ?? ItemCondition.OK,
            recordedAt: now,
          };
          await this.entries.add(entry);
        }
        return this.inventory.get(projectId, userId, countId);
      },
    );
  }

  private async find(project: Project, countId: string): Promise<Nullable<InventoryCount>> {
    const id: Result<EntityId> = EntityId.fromString(countId);
    return id.isOk()
      ? (await this.counts.findById(id.unwrap()))
          .filter((c: InventoryCount): boolean => c.belongsTo(project.getId()))
          .toNullable()
      : null;
  }

  private static invalid<T>(message: string): Result<T> {
    return Result.fail(CountPackageService.error(message));
  }

  private static error(message: string): ValidationError {
    return new ValidationError(InventoryErrorCode.INVALID_ITEMS, message);
  }
}
