import {
  CountResponse,
  InventoryCountStatus,
  ItemStatusResponse,
  MyWorkResponse,
  ParticipantRole,
  RoundStatus,
  ToleranceKind,
  WorkItemResponse,
} from '@asisteglt/shared-contracts';
import { FieldDecoder, FieldReader, Nullable } from '@asisteglt/shared-kernel';

const PARTICIPANT = new FieldDecoder((f: FieldReader) => ({
  userId: f.string('userId'),
  role: f.oneOf('role', Object.values(ParticipantRole)),
}));
const ASSIGNMENT = new FieldDecoder((f: FieldReader) => ({
  userId: f.string('userId'),
  displayName: f.string('displayName'),
  zones: f.stringList('zones'),
  assigned: f.number('assigned'),
  counted: f.number('counted'),
}));
const ROUND = new FieldDecoder((f: FieldReader) => ({
  number: f.number('number'),
  status: f.oneOf('status', Object.values(RoundStatus)),
  items: f.number('items'),
  openedAt: f.string('openedAt'),
  closedAt: f.nullableString('closedAt'),
  assignments: f.list('assignments', ASSIGNMENT),
}));

export class CountView {
  public constructor(public readonly s: CountResponse) {}

  public static decoder(): FieldDecoder<CountView> {
    return new FieldDecoder<CountView>(
      (f: FieldReader): CountView =>
        new CountView({
          id: f.string('id'),
          name: f.string('name'),
          warehouse: f.string('warehouse'),
          status: f.oneOf('status', Object.values(InventoryCountStatus)),
          toleranceKind: f.oneOf('toleranceKind', Object.values(ToleranceKind)),
          toleranceValue: f.string('toleranceValue'),
          maxRounds: f.number('maxRounds'),
          items: f.number('items'),
          participants: f.list('participants', PARTICIPANT),
          rounds: f.list('rounds', ROUND),
          createdAt: f.string('createdAt'),
        }),
    );
  }

  public get id(): string {
    return this.s.id;
  }

  public statusLabel(): { readonly label: string; readonly severity: 'secondary' | 'info' | 'success' } {
    switch (this.s.status) {
      case InventoryCountStatus.DRAFT:
        return { label: 'En preparación', severity: 'secondary' };
      case InventoryCountStatus.IN_PROGRESS:
        return { label: 'En curso', severity: 'info' };
      case InventoryCountStatus.CLOSED:
        return { label: 'Cerrada', severity: 'success' };
    }
  }

  public toleranceLabel(): string {
    return this.s.toleranceKind === ToleranceKind.ABSOLUTE
      ? `± ${this.s.toleranceValue} unidades`
      : `± ${this.s.toleranceValue} %`;
  }

  public currentRound(): Nullable<CountResponse['rounds'][number]> {
    const last: Nullable<CountResponse['rounds'][number]> = this.s.rounds[this.s.rounds.length - 1] ?? null;
    return last !== null && last.status === RoundStatus.OPEN ? last : null;
  }

  public isDraft(): boolean {
    return this.s.status === InventoryCountStatus.DRAFT;
  }

  public isInProgress(): boolean {
    return this.s.status === InventoryCountStatus.IN_PROGRESS;
  }
}

export class MyWork {
  public constructor(public readonly s: MyWorkResponse) {}

  public static decoder(): FieldDecoder<MyWork> {
    const item: FieldDecoder<WorkItemResponse> = new FieldDecoder<WorkItemResponse>(
      (f: FieldReader): WorkItemResponse => ({
        itemId: f.string('itemId'),
        sku: f.string('sku'),
        description: f.string('description'),
        unit: f.string('unit'),
        location: f.string('location'),
        counted: f.nullableString('counted'),
      }),
    );
    return new FieldDecoder<MyWork>(
      (f: FieldReader): MyWork =>
        new MyWork({ round: f.nullableNumber('round'), items: f.list('items', item) }),
    );
  }

  public done(): number {
    return this.s.items.filter((i: WorkItemResponse): boolean => i.counted !== null).length;
  }
}

export class Supervision {
  public constructor(
    public readonly count: CountView,
    public readonly items: ItemStatusResponse[],
    public readonly counted: number,
    public readonly exceeding: number,
    public readonly differenceValue: string,
  ) {}

  public static decoder(): FieldDecoder<Supervision> {
    const item: FieldDecoder<ItemStatusResponse> = new FieldDecoder<ItemStatusResponse>(
      (f: FieldReader): ItemStatusResponse => ({
        itemId: f.string('itemId'),
        sku: f.string('sku'),
        description: f.string('description'),
        location: f.string('location'),
        expected: f.string('expected'),
        counted: f.nullableString('counted'),
        difference: f.nullableString('difference'),
        differenceValue: f.nullableString('differenceValue'),
        exceedsTolerance: f.boolean('exceedsTolerance'),
        rounds: f.number('rounds'),
        counterName: f.nullableString('counterName'),
      }),
    );
    return new FieldDecoder<Supervision>(
      (f: FieldReader): Supervision =>
        new Supervision(
          f.nested('count', CountView.decoder()),
          f.list('items', item),
          f.number('counted'),
          f.number('exceeding'),
          f.string('differenceValue'),
        ),
    );
  }
}

export class InventoryEventView {
  public constructor(
    public readonly projectId: string,
    public readonly countId: string,
  ) {}

  public static decoder(): FieldDecoder<InventoryEventView> {
    return new FieldDecoder<InventoryEventView>(
      (f: FieldReader): InventoryEventView =>
        new InventoryEventView(f.string('projectId'), f.string('countId')),
    );
  }
}
