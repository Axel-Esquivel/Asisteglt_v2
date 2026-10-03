import {
  InventoryCountStatus,
  InventoryErrorCode,
  ParticipantDto,
  ParticipantRole,
  RoundStatus,
  ToleranceKind,
} from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CounterAssignment } from './assignment-strategy';
import { Tolerance } from './tolerance';

export interface RoundSnapshot {
  readonly number: number;
  readonly status: RoundStatus;
  readonly itemIds: ReadonlyArray<string>;
  readonly assignments: ReadonlyArray<CounterAssignment>;
  readonly openedAt: Date;
  readonly closedAt: Nullable<Date>;
}

export interface InventoryCountSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly warehouse: string;
  readonly status: InventoryCountStatus;
  readonly toleranceKind: ToleranceKind;
  readonly toleranceValue: string;
  readonly maxRounds: number;
  readonly itemCount: number;
  readonly participants: ReadonlyArray<ParticipantDto>;
  readonly rounds: ReadonlyArray<RoundSnapshot>;
  readonly createdAt: Date;
}

export interface CountSettings {
  readonly name: string;
  readonly warehouse: string;
  readonly toleranceKind: ToleranceKind;
  readonly toleranceValue: string;
  readonly maxRounds: number;
}

/** Toma física: participantes, rondas de conteo con asignaciones y cierre (docs/04 §12). */
export class InventoryCount extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private readonly name: string,
    private readonly warehouse: string,
    private status: InventoryCountStatus,
    private readonly tolerance: Tolerance,
    private readonly maxRounds: number,
    private itemCount: number,
    private participants: ReadonlyArray<ParticipantDto>,
    private rounds: ReadonlyArray<RoundSnapshot>,
    private readonly createdAt: Date,
  ) {
    super(id);
  }

  public static create(projectId: EntityId, settings: CountSettings, clock: Clock): Result<InventoryCount> {
    const name: string = settings.name.trim();
    if (
      name.length < 3 ||
      name.length > 120 ||
      !Number.isInteger(settings.maxRounds) ||
      settings.maxRounds < 1 ||
      settings.maxRounds > 5
    ) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_COUNT,
        'Nombre de 3 a 120 caracteres y entre 1 y 5 rondas',
      );
    }
    return Tolerance.create(settings.toleranceKind, settings.toleranceValue).map(
      (tolerance: Tolerance): InventoryCount =>
        new InventoryCount(
          EntityId.generate(),
          projectId,
          name,
          settings.warehouse.trim(),
          InventoryCountStatus.DRAFT,
          tolerance,
          settings.maxRounds,
          0,
          [],
          [],
          clock.now(),
        ),
    );
  }

  /** Toma importada de un paquete: queda cerrada, con una ronda a nombre de quien importa. */
  public static imported(
    projectId: EntityId,
    settings: CountSettings,
    itemIds: ReadonlyArray<string>,
    importerId: string,
    clock: Clock,
  ): Result<InventoryCount> {
    return InventoryCount.create(projectId, settings, clock).map((count: InventoryCount): InventoryCount => {
      const now: Date = clock.now();
      count.status = InventoryCountStatus.CLOSED;
      count.itemCount = itemIds.length;
      count.participants = [{ userId: importerId, role: ParticipantRole.SUPERVISOR }];
      count.rounds = [
        {
          number: 1,
          status: RoundStatus.CLOSED,
          itemIds,
          assignments: [{ userId: importerId, itemIds }],
          openedAt: now,
          closedAt: now,
        },
      ];
      return count;
    });
  }

  public static restore(s: InventoryCountSnapshot): InventoryCount {
    return new InventoryCount(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.name,
      s.warehouse,
      s.status,
      Tolerance.create(s.toleranceKind, s.toleranceValue).unwrap(),
      s.maxRounds,
      s.itemCount,
      s.participants,
      s.rounds,
      s.createdAt,
    );
  }

  public belongsTo(projectId: EntityId): boolean {
    return this.projectId.equals(projectId);
  }

  public getTolerance(): Tolerance {
    return this.tolerance;
  }

  public getStatus(): InventoryCountStatus {
    return this.status;
  }

  public counters(): string[] {
    return this.participants
      .filter((p: ParticipantDto): boolean => p.role === ParticipantRole.COUNTER)
      .map((p: ParticipantDto): string => p.userId);
  }

  public currentRound(): Nullable<RoundSnapshot> {
    const last: Nullable<RoundSnapshot> = this.rounds[this.rounds.length - 1] ?? null;
    return last !== null && last.status === RoundStatus.OPEN ? last : null;
  }

  public lastRound(): Nullable<RoundSnapshot> {
    return this.rounds[this.rounds.length - 1] ?? null;
  }

  public isAssigned(userId: string, itemId: string): boolean {
    const round: Nullable<RoundSnapshot> = this.currentRound();
    return (
      round !== null &&
      round.assignments.some(
        (a: CounterAssignment): boolean => a.userId === userId && a.itemIds.includes(itemId),
      )
    );
  }

  public replaceItems(count: number): Result<InventoryCount> {
    if (this.status !== InventoryCountStatus.DRAFT) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_STATE,
        'Los ítems solo se reemplazan antes de iniciar la toma',
      );
    }
    this.itemCount = count;
    return Result.ok(this);
  }

  public setParticipants(participants: ReadonlyArray<ParticipantDto>): Result<InventoryCount> {
    if (this.status === InventoryCountStatus.CLOSED) {
      return InventoryCount.invalid(InventoryErrorCode.INVALID_STATE, 'La toma está cerrada');
    }
    const unique: Map<string, ParticipantDto> = new Map<string, ParticipantDto>(
      participants.map((p: ParticipantDto): [string, ParticipantDto] => [p.userId, p]),
    );
    this.participants = [...unique.values()];
    return Result.ok(this);
  }

  public start(
    plan: ReadonlyArray<CounterAssignment>,
    itemIds: ReadonlyArray<string>,
    clock: Clock,
  ): Result<RoundSnapshot> {
    if (this.status !== InventoryCountStatus.DRAFT) {
      return InventoryCount.invalid(InventoryErrorCode.INVALID_STATE, 'La toma ya se inició');
    }
    if (itemIds.length === 0 || this.counters().length === 0) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_STATE,
        'Carga los ítems y agrega al menos un contador antes de iniciar',
      );
    }
    this.status = InventoryCountStatus.IN_PROGRESS;
    return Result.ok(this.open(itemIds, plan, clock));
  }

  public closeRound(clock: Clock): Result<RoundSnapshot> {
    const round: Nullable<RoundSnapshot> = this.currentRound();
    if (round === null) {
      return InventoryCount.invalid(InventoryErrorCode.INVALID_STATE, 'No hay una ronda abierta');
    }
    const closed: RoundSnapshot = { ...round, status: RoundStatus.CLOSED, closedAt: clock.now() };
    this.rounds = this.rounds.map((r: RoundSnapshot): RoundSnapshot =>
      r.number === round.number ? closed : r,
    );
    return Result.ok(closed);
  }

  public openRecount(
    itemIds: ReadonlyArray<string>,
    plan: ReadonlyArray<CounterAssignment>,
    clock: Clock,
  ): Result<RoundSnapshot> {
    if (this.status !== InventoryCountStatus.IN_PROGRESS || this.currentRound() !== null) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_STATE,
        'Cierra la ronda actual antes de abrir un reconteo',
      );
    }
    if (this.rounds.length >= this.maxRounds) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_STATE,
        `Se alcanzó el máximo de ${String(this.maxRounds)} rondas`,
      );
    }
    if (itemIds.length === 0) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_STATE,
        'No hay ítems fuera de tolerancia para recontar',
      );
    }
    return Result.ok(this.open(itemIds, plan, clock));
  }

  /** Mueve a `toUserId` los ítems de `fromUserId` que aún no se contaron en la ronda abierta. */
  public reassign(fromUserId: string, toUserId: string, counted: ReadonlySet<string>): Result<RoundSnapshot> {
    const round: Nullable<RoundSnapshot> = this.currentRound();
    if (round === null) {
      return InventoryCount.invalid(InventoryErrorCode.INVALID_STATE, 'No hay una ronda abierta');
    }
    if (fromUserId === toUserId || !this.counters().includes(toUserId)) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_REASSIGNMENT,
        'Elige otro contador de la toma para recibir los pendientes',
      );
    }
    const from: Nullable<CounterAssignment> =
      round.assignments.find((a: CounterAssignment): boolean => a.userId === fromUserId) ?? null;
    const moving: string[] =
      from === null ? [] : from.itemIds.filter((id: string): boolean => !counted.has(id));
    if (moving.length === 0) {
      return InventoryCount.invalid(
        InventoryErrorCode.INVALID_REASSIGNMENT,
        'Ese contador no tiene ítems pendientes',
      );
    }
    const moved: Set<string> = new Set<string>(moving);
    const hasTarget: boolean = round.assignments.some(
      (a: CounterAssignment): boolean => a.userId === toUserId,
    );
    const assignments: CounterAssignment[] = [
      ...round.assignments.map((a: CounterAssignment): CounterAssignment => {
        if (a.userId === fromUserId) {
          return { ...a, itemIds: a.itemIds.filter((id: string): boolean => !moved.has(id)) };
        }
        return a.userId === toUserId ? { ...a, itemIds: [...a.itemIds, ...moving] } : a;
      }),
      ...(hasTarget ? [] : [{ userId: toUserId, itemIds: moving }]),
    ];
    const updated: RoundSnapshot = { ...round, assignments };
    this.rounds = this.rounds.map((r: RoundSnapshot): RoundSnapshot =>
      r.number === round.number ? updated : r,
    );
    return Result.ok(updated);
  }

  public close(clock: Clock): Result<InventoryCount> {
    if (this.status !== InventoryCountStatus.IN_PROGRESS) {
      return InventoryCount.invalid(InventoryErrorCode.INVALID_STATE, 'Solo se cierra una toma en curso');
    }
    if (this.currentRound() !== null) {
      this.closeRound(clock);
    }
    this.status = InventoryCountStatus.CLOSED;
    return Result.ok(this);
  }

  public toSnapshot(): InventoryCountSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      name: this.name,
      warehouse: this.warehouse,
      status: this.status,
      toleranceKind: this.tolerance.kind,
      toleranceValue: this.tolerance.value.toString(),
      maxRounds: this.maxRounds,
      itemCount: this.itemCount,
      participants: this.participants,
      rounds: this.rounds,
      createdAt: this.createdAt,
    };
  }

  private open(
    itemIds: ReadonlyArray<string>,
    plan: ReadonlyArray<CounterAssignment>,
    clock: Clock,
  ): RoundSnapshot {
    const round: RoundSnapshot = {
      number: this.rounds.length + 1,
      status: RoundStatus.OPEN,
      itemIds: [...itemIds],
      assignments: [...plan],
      openedAt: clock.now(),
      closedAt: null,
    };
    this.rounds = [...this.rounds, round];
    return round;
  }

  private static invalid<T>(code: InventoryErrorCode, message: string): Result<T> {
    return Result.fail(new ValidationError(code, message));
  }
}
