import { ImportItemStatus } from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, EntityId, Nullable } from '@asisteglt/shared-kernel';
import { EntityScope } from './org-structure';

export interface ImportIssue {
  readonly line: number;
  readonly messages: ReadonlyArray<string>;
}

export interface ImportItemSnapshot {
  readonly id: string;
  readonly fileName: string;
  readonly size: number;
  readonly hash: string;
  readonly storageKey: string;
  readonly profileId: string;
  readonly profileName: string;
  readonly profileVersion: number;
  readonly period: string;
  readonly organizationId: string;
  readonly countryId: string;
  readonly currency: string;
  readonly companyId: string;
  readonly enterpriseId: Nullable<string>;
  readonly branchId: Nullable<string>;
  readonly status: ImportItemStatus;
  readonly total: number;
  readonly data: number;
  readonly ignored: number;
  readonly rejected: number;
  readonly issues: ReadonlyArray<ImportIssue>;
  readonly error: Nullable<string>;
  readonly createdAt: Date;
  readonly finishedAt: Nullable<Date>;
}

export interface ImportBatchSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly items: ReadonlyArray<ImportItemSnapshot>;
}

export class ReadCounts {
  public constructor(
    public readonly total: number,
    public readonly data: number,
    public readonly ignored: number,
    public readonly rejected: number,
  ) {}
}

export interface NewImportItem {
  readonly fileName: string;
  readonly size: number;
  readonly hash: string;
  readonly storageKey: string;
  readonly profileId: string;
  readonly profileName: string;
  readonly profileVersion: number;
  readonly period: string;
  readonly scope: EntityScope;
}

/** Lote de carga: cada archivo se procesa y publica de forma independiente (docs/12 §4.5). */
export class ImportBatch extends AggregateRoot {
  public static readonly MAX_ISSUES: number = 200;

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private readonly createdBy: EntityId,
    private readonly createdAt: Date,
    private entries: ImportItemSnapshot[],
  ) {
    super(id);
  }

  public static open(
    projectId: EntityId,
    createdBy: EntityId,
    items: ReadonlyArray<NewImportItem>,
    clock: Clock,
  ): ImportBatch {
    const now: Date = clock.now();
    return new ImportBatch(
      EntityId.generate(),
      projectId,
      createdBy,
      now,
      items.map((item: NewImportItem): ImportItemSnapshot => ({
        id: EntityId.generate().toString(),
        fileName: item.fileName,
        size: item.size,
        hash: item.hash,
        storageKey: item.storageKey,
        profileId: item.profileId,
        profileName: item.profileName,
        profileVersion: item.profileVersion,
        period: item.period,
        organizationId: item.scope.organizationId,
        countryId: item.scope.countryId,
        currency: item.scope.currency,
        companyId: item.scope.companyId,
        enterpriseId: item.scope.enterpriseId,
        branchId: item.scope.branchId,
        status: ImportItemStatus.QUEUED,
        total: 0,
        data: 0,
        ignored: 0,
        rejected: 0,
        issues: [],
        error: null,
        createdAt: now,
        finishedAt: null,
      })),
    );
  }

  public static restore(s: ImportBatchSnapshot): ImportBatch {
    return new ImportBatch(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      EntityId.fromString(s.createdBy).unwrap(),
      s.createdAt,
      [...s.items],
    );
  }

  public static scopeKey(item: ImportItemSnapshot): string {
    return [
      item.profileId,
      item.period,
      item.organizationId,
      item.countryId,
      item.currency,
      item.companyId,
      item.enterpriseId ?? '-',
      item.branchId ?? '-',
    ].join('|');
  }

  public getProjectId(): EntityId {
    return this.projectId;
  }

  public items(): ReadonlyArray<ImportItemSnapshot> {
    return this.entries;
  }

  public item(itemId: string): Nullable<ImportItemSnapshot> {
    return this.entries.find((i: ImportItemSnapshot): boolean => i.id === itemId) ?? null;
  }

  public start(itemId: string): void {
    this.change(itemId, (i: ImportItemSnapshot): ImportItemSnapshot => ({
      ...i,
      status: ImportItemStatus.PROCESSING,
    }));
  }

  public publish(itemId: string, counts: ReadCounts, issues: ReadonlyArray<ImportIssue>, clock: Clock): void {
    this.finish(itemId, ImportItemStatus.PUBLISHED, counts, issues, null, clock);
  }

  public fail(
    itemId: string,
    counts: ReadCounts,
    issues: ReadonlyArray<ImportIssue>,
    error: string,
    clock: Clock,
  ): void {
    this.finish(itemId, ImportItemStatus.FAILED, counts, issues, error, clock);
  }

  public supersede(itemId: string): void {
    this.change(itemId, (i: ImportItemSnapshot): ImportItemSnapshot =>
      i.status === ImportItemStatus.PUBLISHED ? { ...i, status: ImportItemStatus.SUPERSEDED } : i,
    );
  }

  public toSnapshot(): ImportBatchSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      createdBy: this.createdBy.toString(),
      createdAt: this.createdAt,
      items: this.entries,
    };
  }

  private finish(
    itemId: string,
    status: ImportItemStatus,
    counts: ReadCounts,
    issues: ReadonlyArray<ImportIssue>,
    error: Nullable<string>,
    clock: Clock,
  ): void {
    this.change(itemId, (i: ImportItemSnapshot): ImportItemSnapshot => ({
      ...i,
      status,
      total: counts.total,
      data: counts.data,
      ignored: counts.ignored,
      rejected: counts.rejected,
      issues: issues.slice(0, ImportBatch.MAX_ISSUES),
      error,
      finishedAt: clock.now(),
    }));
  }

  private change(itemId: string, mutate: (item: ImportItemSnapshot) => ImportItemSnapshot): void {
    this.entries = this.entries.map((i: ImportItemSnapshot): ImportItemSnapshot =>
      i.id === itemId ? mutate(i) : i,
    );
  }
}
