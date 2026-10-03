import { Injectable } from '@nestjs/common';
import {
  AssignmentMode,
  AssignmentResponse,
  CountEntryRequest,
  CountResponse,
  InventoryErrorCode,
  InventoryEvent,
  InventoryItemRequest,
  ItemCondition,
  ItemStatusResponse,
  ItemsFromDataRequest,
  MyWorkResponse,
  ParticipantDto,
  ProjectPermission,
  RealtimeEvent,
  ReassignRequest,
  RoundResponse,
  StartCountRequest,
  SupervisionResponse,
  WorkItemResponse,
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
import { RealtimeEventPublisher, UsersAudience } from '../../chat/domain/ports';
import { UserDirectory } from '../../iam/application/user-directory';
import { User } from '../../iam/domain/user';
import { ProjectAccess } from '../../projects/application/project-access';
import { Project, ProjectMember } from '../../projects/domain/project';
import { CounterAssignment, ZoneAssignmentStrategy } from '../domain/assignment-strategy';
import { CountSettings, InventoryCount, RoundSnapshot } from '../domain/inventory-count';
import { CountEntrySnapshot, InventoryItemSnapshot } from '../domain/inventory-records';
import {
  CountEntryRepository,
  EvidenceRepository,
  InventoryCountRepository,
  InventoryItemRepository,
} from '../domain/ports';
import { CatalogService } from '../../reports/application/catalog.service';
import { DataRecordRepository, RecordQuery } from '../../reports/domain/ports';
import { ClusterAssignmentStrategy, RangeAssignmentStrategy } from '../domain/assignment-strategies';
import { CountLedger } from './count-ledger';
import { ItemMappingRules } from './item-mapping';

/** Tomas físicas: configuración, rondas, conteo a ciegas, supervisión en vivo y cierre. */
@Injectable()
export class InventoryService {
  private static readonly MAX_ITEMS: number = 20_000;
  private readonly strategy: ZoneAssignmentStrategy = new ZoneAssignmentStrategy();

  public constructor(
    private readonly counts: InventoryCountRepository,
    private readonly items: InventoryItemRepository,
    private readonly entries: CountEntryRepository,
    private readonly evidence: EvidenceRepository,
    private readonly records: DataRecordRepository,
    private readonly catalogs: CatalogService,
    private readonly access: ProjectAccess,
    private readonly directory: UserDirectory,
    private readonly publisher: RealtimeEventPublisher,
    private readonly clock: Clock,
  ) {}

  public async list(projectId: string, userId: EntityId): Promise<Result<CountResponse[]>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse[]>> => {
        const counts: InventoryCount[] = await this.counts.findByProject(p.getId());
        return Result.ok(
          await Promise.all(counts.map((c: InventoryCount): Promise<CountResponse> => this.present(c))),
        );
      },
    );
  }

  public async get(projectId: string, userId: EntityId, countId: string): Promise<Result<CountResponse>> {
    return (await this.access.load(projectId, userId)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (c: InventoryCount): Promise<Result<CountResponse>> => Result.ok(await this.present(c)),
        ),
    );
  }

  public async create(
    projectId: string,
    userId: EntityId,
    settings: CountSettings,
  ): Promise<Result<CountResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_CONFIGURE)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse>> =>
        InventoryCount.create(p.getId(), settings, this.clock).flatMapAsync(
          (c: InventoryCount): Promise<Result<CountResponse>> => this.persist(p, c),
        ),
    );
  }

  public async replaceItems(
    projectId: string,
    userId: EntityId,
    countId: string,
    requests: ReadonlyArray<InventoryItemRequest>,
  ): Promise<Result<CountResponse>> {
    return this.configure(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> => {
        const parsed: Result<InventoryItemSnapshot[]> = InventoryService.parseItems(
          count.getId().toString(),
          requests,
        );
        if (!parsed.isOk()) {
          return Result.fail(parsed.errorOrNull() ?? InventoryService.invalidItems('Ítems inválidos'));
        }
        const changed: Result<InventoryCount> = count.replaceItems(parsed.unwrap().length);
        if (!changed.isOk()) {
          return Result.fail(changed.errorOrNull() ?? InventoryService.invalidItems('Estado inválido'));
        }
        await this.items.replaceForCount(count.getId().toString(), parsed.unwrap());
        return this.persist(p, count);
      },
    );
  }

  /** Ítems desde datos ya cargados (motor de ingestión), con el mapeo de encabezados por nombre. */
  public async itemsFromData(
    projectId: string,
    userId: EntityId,
    countId: string,
    request: ItemsFromDataRequest,
  ): Promise<Result<CountResponse>> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(request.period)) {
      return Result.fail(InventoryService.invalidItems('El período debe tener el formato AAAA-MM'));
    }
    const project: Result<Project> = await this.access.require(
      projectId,
      userId,
      ProjectPermission.INVENTORY_CONFIGURE,
    );
    if (!project.isOk()) {
      return Result.fail(project.errorOrNull() ?? InventoryService.invalidItems('Sin acceso'));
    }
    const p: Project = project.unwrap();
    const rules: Result<ItemMappingRules> = ItemMappingRules.validate(
      request.mapping,
      await this.catalogs.of(p.getId()),
    );
    if (!rules.isOk()) {
      return Result.fail(rules.errorOrNull() ?? InventoryService.invalidItems('Mapeo inválido'));
    }
    const items: InventoryItemRequest[] = [];
    const query: RecordQuery = new RecordQuery(
      p.getId().toString(),
      request.period,
      request.profileId,
      request.companyId,
      [],
      null,
    );
    for await (const record of this.records.stream(query)) {
      const item: Nullable<InventoryItemRequest> = rules.unwrap().item(record.values);
      if (item !== null) {
        items.push(item);
      }
    }
    if (items.length === 0) {
      return Result.fail(
        InventoryService.invalidItems('No hay registros con SKU para ese período y filtros'),
      );
    }
    return this.replaceItems(projectId, userId, countId, items);
  }

  public async setParticipants(
    projectId: string,
    userId: EntityId,
    countId: string,
    participants: ReadonlyArray<ParticipantDto>,
  ): Promise<Result<CountResponse>> {
    return this.configure(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> => {
        const members: Set<string> = new Set<string>(
          p.getMembers().map((m: ProjectMember): string => m.userId.toString()),
        );
        if (participants.some((x: ParticipantDto): boolean => !members.has(x.userId))) {
          return Result.fail(
            new ValidationError(
              InventoryErrorCode.INVALID_COUNT,
              'Los participantes deben ser miembros del proyecto',
            ),
          );
        }
        return count
          .setParticipants(participants)
          .flatMapAsync((c: InventoryCount): Promise<Result<CountResponse>> => this.persist(p, c));
      },
    );
  }

  public async start(
    projectId: string,
    userId: EntityId,
    countId: string,
    request: StartCountRequest,
  ): Promise<Result<CountResponse>> {
    return this.configure(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> => {
        const items: InventoryItemSnapshot[] = await this.items.findByCount(count.getId().toString());
        const planned: Result<CounterAssignment[]> = this.firstPlan(items, count.counters(), request);
        if (!planned.isOk()) {
          return Result.fail(planned.errorOrNull() ?? InventoryService.invalidItems('No se pudo asignar'));
        }
        const plan: CounterAssignment[] = planned.unwrap();
        return count
          .start(
            plan,
            items.map((i: InventoryItemSnapshot): string => i.id),
            this.clock,
          )
          .flatMapAsync((): Promise<Result<CountResponse>> => this.persist(p, count));
      },
    );
  }

  public async myWork(projectId: string, userId: EntityId, countId: string): Promise<Result<MyWorkResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_COUNT)).flatMapAsync(
      async (p: Project): Promise<Result<MyWorkResponse>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (count: InventoryCount): Promise<Result<MyWorkResponse>> => {
            const round: Nullable<RoundSnapshot> = count.currentRound();
            if (round === null) {
              return Result.ok({ round: null, items: [] });
            }
            const mine: ReadonlyArray<string> = (
              round.assignments.find((a: CounterAssignment): boolean => a.userId === userId.toString()) ?? {
                userId: '',
                itemIds: [],
              }
            ).itemIds;
            const byId: Map<string, InventoryItemSnapshot> = new Map<string, InventoryItemSnapshot>(
              (await this.items.findByCount(count.getId().toString())).map(
                (i: InventoryItemSnapshot): [string, InventoryItemSnapshot] => [i.id, i],
              ),
            );
            const ledger: CountLedger = new CountLedger(
              [],
              await this.entries.findByCount(count.getId().toString()),
              count.getTolerance(),
            );
            const photos: ReadonlyMap<string, number> = await this.photoCounts(count, userId.toString());
            const items: WorkItemResponse[] = [];
            for (const itemId of mine) {
              const item: Nullable<InventoryItemSnapshot> = byId.get(itemId) ?? null;
              if (item !== null) {
                items.push({
                  itemId,
                  sku: item.sku,
                  description: item.description,
                  unit: item.unit,
                  location: item.location,
                  counted: ledger.countedIn(itemId, round.number),
                  condition: ledger.conditionIn(itemId, round.number),
                  photos: photos.get(itemId) ?? 0,
                });
              }
            }
            return Result.ok({ round: round.number, items });
          },
        ),
    );
  }

  public async record(
    projectId: string,
    userId: EntityId,
    countId: string,
    request: CountEntryRequest,
  ): Promise<Result<true>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_COUNT)).flatMapAsync(
      async (p: Project): Promise<Result<true>> =>
        (await this.find(p, countId)).flatMapAsync(async (count: InventoryCount): Promise<Result<true>> => {
          const round: Nullable<RoundSnapshot> = count.currentRound();
          if (round === null || !count.isAssigned(userId.toString(), request.itemId)) {
            return Result.fail(
              new ValidationError(
                InventoryErrorCode.NOT_ASSIGNED,
                'Ese ítem no está asignado a ti en la ronda actual',
              ),
            );
          }
          const raw: string =
            request.condition === ItemCondition.NOT_FOUND ? '0' : request.quantity.trim().replace(',', '.');
          const quantity: Result<Decimal> = Decimal.of(raw);
          if (!quantity.isOk() || quantity.unwrap().isNegative()) {
            return Result.fail(
              new ValidationError(
                InventoryErrorCode.INVALID_QUANTITY,
                'La cantidad debe ser un número mayor o igual a cero',
              ),
            );
          }
          await this.entries.add({
            id: EntityId.generate().toString(),
            countId: count.getId().toString(),
            round: round.number,
            itemId: request.itemId,
            counterId: userId.toString(),
            quantity: request.condition === ItemCondition.NOT_FOUND ? '0' : quantity.unwrap().toString(),
            comment: request.comment.trim().slice(0, 500),
            condition: request.condition,
            recordedAt: this.clock.now(),
          });
          this.notify(p, count);
          return Result.ok(true);
        }),
    );
  }

  public async supervision(
    projectId: string,
    userId: EntityId,
    countId: string,
  ): Promise<Result<SupervisionResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_VIEW)).flatMapAsync(
      async (p: Project): Promise<Result<SupervisionResponse>> =>
        (await this.find(p, countId)).flatMapAsync(
          async (count: InventoryCount): Promise<Result<SupervisionResponse>> => {
            const ledger: CountLedger = await this.ledger(count);
            const statuses: ItemStatusResponse[] = ledger.statuses(
              await this.names(count),
              await this.photoCounts(count, null),
            );
            const valuation = ledger.valuation();
            return Result.ok({
              count: await this.present(count),
              items: statuses,
              counted: statuses.filter((s: ItemStatusResponse): boolean => s.counted !== null).length,
              exceeding: statuses.filter((s: ItemStatusResponse): boolean => s.exceedsTolerance).length,
              issues: statuses.filter(
                (s: ItemStatusResponse): boolean => s.condition !== null && s.condition !== ItemCondition.OK,
              ).length,
              differenceValue: ledger.totalDifferenceValue(statuses),
              expectedValue: valuation.expected,
              countedValue: valuation.counted,
              uncountedValue: valuation.uncounted,
            });
          },
        ),
    );
  }

  public async closeRound(
    projectId: string,
    userId: EntityId,
    countId: string,
  ): Promise<Result<CountResponse>> {
    return this.supervise(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> =>
        count
          .closeRound(this.clock)
          .flatMapAsync((): Promise<Result<CountResponse>> => this.persist(p, count)),
    );
  }

  /** Abre una ronda de reconteo con los ítems fuera de tolerancia o sin contar, con otro contador. */
  public async recount(projectId: string, userId: EntityId, countId: string): Promise<Result<CountResponse>> {
    return this.supervise(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> => {
        const items: InventoryItemSnapshot[] = await this.items.findByCount(count.getId().toString());
        const ledger: CountLedger = new CountLedger(
          items,
          await this.entries.findByCount(count.getId().toString()),
          count.getTolerance(),
        );
        const pending: InventoryItemSnapshot[] = items.filter((i: InventoryItemSnapshot): boolean =>
          ledger.needsRecount(i),
        );
        const previous: Map<string, string> = new Map<string, string>();
        for (const item of pending) {
          const entry: Nullable<CountEntrySnapshot> = ledger.entryOf(item.id);
          if (entry !== null) {
            previous.set(item.id, entry.counterId);
          }
        }
        const plan: CounterAssignment[] = this.strategy.plan(pending, count.counters(), previous);
        return count
          .openRecount(
            pending.map((i: InventoryItemSnapshot): string => i.id),
            plan,
            this.clock,
          )
          .flatMapAsync((): Promise<Result<CountResponse>> => this.persist(p, count));
      },
    );
  }

  /** Reasignación dinámica: los pendientes de un contador pasan a otro en la ronda abierta. */
  public async reassign(
    projectId: string,
    userId: EntityId,
    countId: string,
    request: ReassignRequest,
  ): Promise<Result<CountResponse>> {
    return this.supervise(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> => {
        const round: Nullable<RoundSnapshot> = count.currentRound();
        const entries: CountEntrySnapshot[] = await this.entries.findByCount(count.getId().toString());
        const counted: Set<string> = new Set<string>(
          entries
            .filter((e: CountEntrySnapshot): boolean => round !== null && e.round === round.number)
            .map((e: CountEntrySnapshot): string => e.itemId),
        );
        return count
          .reassign(request.fromUserId, request.toUserId, counted)
          .flatMapAsync((): Promise<Result<CountResponse>> => this.persist(p, count));
      },
    );
  }

  public async close(projectId: string, userId: EntityId, countId: string): Promise<Result<CountResponse>> {
    return this.supervise(
      projectId,
      userId,
      countId,
      async (p: Project, count: InventoryCount): Promise<Result<CountResponse>> =>
        count
          .close(this.clock)
          .flatMapAsync((c: InventoryCount): Promise<Result<CountResponse>> => this.persist(p, c)),
    );
  }

  private async configure(
    projectId: string,
    userId: EntityId,
    countId: string,
    change: (p: Project, count: InventoryCount) => Promise<Result<CountResponse>>,
  ): Promise<Result<CountResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_CONFIGURE)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse>> =>
        (await this.find(p, countId)).flatMapAsync((c: InventoryCount): Promise<Result<CountResponse>> =>
          change(p, c),
        ),
    );
  }

  /** Primera ronda según la estrategia elegida; los reconteos siempre van por zonas con otro contador. */
  private firstPlan(
    items: ReadonlyArray<InventoryItemSnapshot>,
    counters: ReadonlyArray<string>,
    request: StartCountRequest,
  ): Result<CounterAssignment[]> {
    switch (request.mode) {
      case AssignmentMode.ZONES:
        return Result.ok(this.strategy.plan(items, counters, new Map<string, string>()));
      case AssignmentMode.RANGES:
        return new RangeAssignmentStrategy().plan(items, counters, request.ranges);
      case AssignmentMode.CLUSTER:
        return new ClusterAssignmentStrategy().plan(items, counters);
    }
  }

  private async supervise(
    projectId: string,
    userId: EntityId,
    countId: string,
    change: (p: Project, count: InventoryCount) => Promise<Result<CountResponse>>,
  ): Promise<Result<CountResponse>> {
    return (await this.access.require(projectId, userId, ProjectPermission.INVENTORY_SUPERVISE)).flatMapAsync(
      async (p: Project): Promise<Result<CountResponse>> =>
        (await this.find(p, countId)).flatMapAsync((c: InventoryCount): Promise<Result<CountResponse>> =>
          change(p, c),
        ),
    );
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

  private async persist(project: Project, count: InventoryCount): Promise<Result<CountResponse>> {
    await this.counts.save(count);
    this.notify(project, count);
    return Result.ok(await this.present(count));
  }

  private notify(project: Project, count: InventoryCount): void {
    const event: InventoryEvent = {
      projectId: project.getId().toString(),
      countId: count.getId().toString(),
    };
    this.publisher.publish(
      new UsersAudience(project.getMembers().map((m: ProjectMember): EntityId => m.userId)),
      RealtimeEvent.INVENTORY_CHANGED,
      event,
    );
  }

  private async ledger(count: InventoryCount): Promise<CountLedger> {
    const id: string = count.getId().toString();
    return new CountLedger(
      await this.items.findByCount(id),
      await this.entries.findByCount(id),
      count.getTolerance(),
    );
  }

  /** Fotos por ítem (de un usuario, o de todos con `null`). */
  private async photoCounts(
    count: InventoryCount,
    userId: Nullable<string>,
  ): Promise<ReadonlyMap<string, number>> {
    const counts: Map<string, number> = new Map<string, number>();
    for (const e of await this.evidence.findByCount(count.getId().toString())) {
      if (userId === null || e.userId === userId) {
        counts.set(e.itemId, (counts.get(e.itemId) ?? 0) + 1);
      }
    }
    return counts;
  }

  private async names(count: InventoryCount): Promise<ReadonlyMap<string, string>> {
    const ids: EntityId[] = count
      .toSnapshot()
      .participants.map((p: ParticipantDto): Result<EntityId> => EntityId.fromString(p.userId))
      .filter((r: Result<EntityId>): boolean => r.isOk())
      .map((r: Result<EntityId>): EntityId => r.unwrap());
    const users: User[] = await this.directory.findMany(ids);
    return new Map<string, string>(
      users.map((u: User): [string, string] => [u.getId().toString(), u.getDisplayName()]),
    );
  }

  private async present(count: InventoryCount): Promise<CountResponse> {
    const s = count.toSnapshot();
    const names: ReadonlyMap<string, string> = await this.names(count);
    const entries: CountEntrySnapshot[] = s.rounds.length === 0 ? [] : await this.entries.findByCount(s.id);
    const items: InventoryItemSnapshot[] = s.rounds.length === 0 ? [] : await this.items.findByCount(s.id);
    const zoneOf: Map<string, string> = new Map<string, string>(
      items.map((i: InventoryItemSnapshot): [string, string] => [
        i.id,
        i.location.split(/[-/.\s]+/)[0] ?? '',
      ]),
    );
    const rounds: RoundResponse[] = s.rounds.map((r: RoundSnapshot): RoundResponse => {
      const countedIds: Set<string> = new Set<string>(
        entries
          .filter((e: CountEntrySnapshot): boolean => e.round === r.number)
          .map((e: CountEntrySnapshot): string => e.itemId),
      );
      return {
        number: r.number,
        status: r.status,
        items: r.itemIds.length,
        openedAt: r.openedAt.toISOString(),
        closedAt: r.closedAt === null ? null : r.closedAt.toISOString(),
        assignments: r.assignments.map((a: CounterAssignment): AssignmentResponse => ({
          userId: a.userId,
          displayName: names.get(a.userId) ?? 'Usuario',
          zones: [
            ...new Set(a.itemIds.map((id: string): string => (zoneOf.get(id) ?? '').toUpperCase())),
          ].filter((z: string): boolean => z !== ''),
          assigned: a.itemIds.length,
          counted: a.itemIds.filter((id: string): boolean => countedIds.has(id)).length,
        })),
      };
    });
    return {
      id: s.id,
      name: s.name,
      warehouse: s.warehouse,
      status: s.status,
      toleranceKind: s.toleranceKind,
      toleranceValue: s.toleranceValue,
      maxRounds: s.maxRounds,
      items: s.itemCount,
      participants: s.participants,
      rounds,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private static parseItems(
    countId: string,
    requests: ReadonlyArray<InventoryItemRequest>,
  ): Result<InventoryItemSnapshot[]> {
    if (requests.length === 0 || requests.length > InventoryService.MAX_ITEMS) {
      return Result.fail(
        InventoryService.invalidItems(`Envía entre 1 y ${String(InventoryService.MAX_ITEMS)} ítems`),
      );
    }
    const skus: Set<string> = new Set<string>();
    const items: InventoryItemSnapshot[] = [];
    for (const [index, r] of requests.entries()) {
      const sku: string = r.sku.trim();
      const expected: Result<Decimal> = Decimal.of(r.expectedQuantity.trim().replace(',', '.'));
      const cost: Nullable<Result<Decimal>> =
        r.unitCost === null || r.unitCost.trim() === ''
          ? null
          : Decimal.of(r.unitCost.trim().replace(',', '.'));
      const key: string = `${sku}|${r.location.trim().toUpperCase()}`;
      const coordinate = (raw: Nullable<string>): Nullable<Result<Decimal>> =>
        raw === null || raw.trim() === '' ? null : Decimal.of(raw.trim().replace(',', '.'));
      const x: Nullable<Result<Decimal>> = coordinate(r.x);
      const y: Nullable<Result<Decimal>> = coordinate(r.y);
      if (
        sku === '' ||
        r.location.trim() === '' ||
        !expected.isOk() ||
        (cost !== null && !cost.isOk()) ||
        (x !== null && !x.isOk()) ||
        (y !== null && !y.isOk()) ||
        skus.has(key)
      ) {
        return Result.fail(
          InventoryService.invalidItems(
            `Fila ${String(index + 1)}: SKU, ubicación y cantidad válidos son obligatorios (sin repetir SKU por ubicación)`,
          ),
        );
      }
      skus.add(key);
      items.push({
        id: EntityId.generate().toString(),
        countId,
        sku,
        description: r.description.trim(),
        unit: r.unit.trim(),
        location: r.location.trim().toUpperCase(),
        expectedQuantity: expected.unwrap().toString(),
        unitCost: cost === null ? null : cost.unwrap().toString(),
        x: x === null ? null : x.unwrap().toString(),
        y: y === null ? null : y.unwrap().toString(),
      });
    }
    return Result.ok(items);
  }

  private static invalidItems(message: string): ValidationError {
    return new ValidationError(InventoryErrorCode.INVALID_ITEMS, message);
  }
}
