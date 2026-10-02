import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { CountEntryRequest, ItemCondition } from '@asisteglt/shared-contracts';
import {
  ArrayDecoder,
  DomainError,
  FieldDecoder,
  FieldReader,
  Nullable,
  Result,
} from '@asisteglt/shared-kernel';
import { InventoryApiClient } from './inventory.api-client';

/** Conteo guardado en el dispositivo mientras no hay conexión con el servidor. */
export class PendingEntry {
  public constructor(
    public readonly projectId: string,
    public readonly countId: string,
    public readonly entry: CountEntryRequest,
    public readonly queuedAt: string,
  ) {}

  public static decoder(): FieldDecoder<PendingEntry> {
    const entry: FieldDecoder<CountEntryRequest> = new FieldDecoder<CountEntryRequest>(
      (f: FieldReader): CountEntryRequest => ({
        itemId: f.string('itemId'),
        quantity: f.string('quantity'),
        comment: f.string('comment'),
        condition: f.oneOf('condition', Object.values(ItemCondition)),
      }),
    );
    return new FieldDecoder<PendingEntry>(
      (f: FieldReader): PendingEntry =>
        new PendingEntry(
          f.string('projectId'),
          f.string('countId'),
          f.nested('entry', entry),
          f.string('queuedAt'),
        ),
    );
  }
}

/** Resultado de un reenvío: enviados, rechazados por el servidor (con su motivo) y si sigue sin conexión. */
export class FlushOutcome {
  public constructor(
    public readonly sent: number,
    public readonly rejected: ReadonlyArray<DomainError>,
    public readonly offline: boolean,
  ) {}
}

/**
 * Cola local de conteos (RF-INV, modo sin conexión): si el servidor no responde, el conteo se
 * guarda en este navegador y se reenvía en orden al volver la conexión. El último conteo de cada
 * ítem es el que vale en el servidor, así que reenviar uno ya recibido no cambia el resultado.
 */
@Injectable({ providedIn: 'root' })
export class PendingEntries {
  private static readonly STORAGE_KEY: string = 'asisteglt.inventory.pending';

  private readonly document: Document = inject(DOCUMENT);
  private readonly api: InventoryApiClient = inject(InventoryApiClient);
  private readonly entries: WritableSignal<PendingEntry[]> = signal<PendingEntry[]>(this.read());
  private flushing: boolean = false;

  public readonly all: Signal<ReadonlyArray<PendingEntry>> = this.entries.asReadonly();
  public readonly size: Signal<number> = computed((): number => this.entries().length);

  /** Errores de red o del servidor intermedio: vale la pena reintentar. */
  public static isRetriable(error: DomainError): boolean {
    const status: number = error.httpStatus();
    return status === 0 || status === 502 || status === 503 || status === 504;
  }

  public forCount(countId: string): PendingEntry[] {
    return this.entries().filter((p: PendingEntry): boolean => p.countId === countId);
  }

  public enqueue(projectId: string, countId: string, entry: CountEntryRequest): void {
    this.entries.update((entries: PendingEntry[]): PendingEntry[] => [
      ...entries.filter(
        (p: PendingEntry): boolean => !(p.countId === countId && p.entry.itemId === entry.itemId),
      ),
      new PendingEntry(projectId, countId, entry, new Date().toISOString()),
    ]);
    this.write();
  }

  /** Reenvía en orden; se detiene en el primer error de red para no desordenar los conteos. */
  public async flush(): Promise<FlushOutcome> {
    if (this.flushing || this.entries().length === 0) {
      return new FlushOutcome(0, [], false);
    }
    this.flushing = true;
    let sent: number = 0;
    const rejected: DomainError[] = [];
    let offline: boolean = false;
    try {
      for (const pending of [...this.entries()]) {
        const result: Result<true> = await this.api.record(pending.projectId, pending.countId, pending.entry);
        const error: Nullable<DomainError> = result.errorOrNull();
        if (error !== null && PendingEntries.isRetriable(error)) {
          offline = true;
          break;
        }
        if (error === null) {
          sent += 1;
        } else {
          rejected.push(error);
        }
        this.entries.update((entries: PendingEntry[]): PendingEntry[] =>
          entries.filter((p: PendingEntry): boolean => p !== pending),
        );
        this.write();
      }
    } finally {
      this.flushing = false;
    }
    return new FlushOutcome(sent, rejected, offline);
  }

  private storage(): Nullable<Storage> {
    try {
      return this.document.defaultView === null ? null : this.document.defaultView.localStorage;
    } catch {
      return null;
    }
  }

  private read(): PendingEntry[] {
    try {
      const storage: Nullable<Storage> = this.storage();
      const raw: Nullable<string> = storage === null ? null : storage.getItem(PendingEntries.STORAGE_KEY);
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      return new ArrayDecoder<PendingEntry>(PendingEntry.decoder()).decode(parsed).match(
        (entries: PendingEntry[]): PendingEntry[] => entries,
        (): PendingEntry[] => [],
      );
    } catch {
      return [];
    }
  }

  private write(): void {
    const storage: Nullable<Storage> = this.storage();
    if (storage === null) {
      return;
    }
    try {
      storage.setItem(PendingEntries.STORAGE_KEY, JSON.stringify(this.entries()));
    } catch {
      // Sin espacio o almacenamiento bloqueado: la cola dura mientras la página siga abierta.
    }
  }
}
