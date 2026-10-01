import {
  CollectionErrorCode,
  CollectionFieldDto,
  CollectionRequest,
  CollectionRowDto,
  DataType,
  NumericNature,
} from '@asisteglt/shared-contracts';
import { CellValue } from '@asisteglt/shared-ingestion-core';
import {
  AggregateRoot,
  Clock,
  Decimal,
  DomainError,
  EntityId,
  Nullable,
  Result,
  ValidationError,
} from '@asisteglt/shared-kernel';
import { FieldLabel } from './field-catalog';

export interface CollectionSnapshot extends CollectionRequest {
  readonly id: string;
  readonly projectId: string;
  readonly updatedAt: Date;
}

/**
 * Colección complementaria (tipos de cambio, sueldos…): campos descritos como los encabezados y
 * filas capturadas por período. Sus campos se referencian por clave, así que renombrar no rompe nada.
 */
export class SupplementaryCollection extends AggregateRoot {
  public static readonly MAX_ROWS: number = 5000;
  private static readonly KEY_ALPHABET: string = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private spec: CollectionRequest,
    private updatedAt: Date,
  ) {
    super(id);
  }

  public static create(
    projectId: EntityId,
    request: CollectionRequest,
    clock: Clock,
  ): Result<SupplementaryCollection> {
    return SupplementaryCollection.validate(request, []).map(
      (valid: CollectionRequest): SupplementaryCollection =>
        new SupplementaryCollection(EntityId.generate(), projectId, valid, clock.now()),
    );
  }

  public static restore(s: CollectionSnapshot): SupplementaryCollection {
    const { id, projectId, updatedAt, ...spec } = s;
    return new SupplementaryCollection(
      EntityId.fromString(id).unwrap(),
      EntityId.fromString(projectId).unwrap(),
      spec,
      updatedAt,
    );
  }

  public update(request: CollectionRequest, clock: Clock): Result<SupplementaryCollection> {
    return SupplementaryCollection.validate(request, this.spec.fields).map(
      (valid: CollectionRequest): SupplementaryCollection => {
        this.spec = valid;
        this.updatedAt = clock.now();
        return this;
      },
    );
  }

  public getSpec(): CollectionRequest {
    return this.spec;
  }

  public getName(): string {
    return this.spec.name;
  }

  public belongsTo(projectId: EntityId): boolean {
    return this.projectId.equals(projectId);
  }

  public field(key: string): Nullable<CollectionFieldDto> {
    return this.spec.fields.find((f: CollectionFieldDto): boolean => f.key === key) ?? null;
  }

  public rows(): ReadonlyArray<CollectionRowDto> {
    return this.spec.rows;
  }

  public toSnapshot(): CollectionSnapshot {
    return {
      ...this.spec,
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      updatedAt: this.updatedAt,
    };
  }

  private static validate(
    r: CollectionRequest,
    previous: ReadonlyArray<CollectionFieldDto>,
  ): Result<CollectionRequest> {
    const name: string = r.name.trim();
    if (name.length < 2 || name.length > 80) {
      return SupplementaryCollection.fail('El nombre debe tener entre 2 y 80 caracteres');
    }
    if (r.fields.length === 0 || r.fields.length > 30) {
      return SupplementaryCollection.fail('Define entre 1 y 30 campos');
    }
    if (r.rows.length > SupplementaryCollection.MAX_ROWS) {
      return SupplementaryCollection.fail(
        `Una colección admite hasta ${String(SupplementaryCollection.MAX_ROWS)} filas`,
      );
    }
    const labels: Set<string> = new Set<string>();
    const keys: Set<string> = new Set<string>(previous.map((f: CollectionFieldDto): string => f.key));
    const fields: CollectionFieldDto[] = [];
    for (const field of r.fields) {
      const label: Result<FieldLabel> = FieldLabel.create(field.label);
      if (!label.isOk()) {
        return Result.fail(
          label.errorOrNull() ?? SupplementaryCollection.invalid('Nombre de campo inválido'),
        );
      }
      if (labels.has(label.unwrap().normalized)) {
        return SupplementaryCollection.fail(`El campo «${label.unwrap().value}» está repetido`);
      }
      labels.add(label.unwrap().normalized);
      const numeric: boolean = field.dataType === DataType.DECIMAL || field.dataType === DataType.INTEGER;
      if (numeric && field.nature === null) {
        return SupplementaryCollection.fail(`Elige la naturaleza de «${label.unwrap().value}»`);
      }
      const key: string = field.key === '' ? SupplementaryCollection.newKey(keys) : field.key;
      if (
        !/^[A-Za-z0-9_]{1,40}$/.test(key) ||
        fields.some((f: CollectionFieldDto): boolean => f.key === key)
      ) {
        return SupplementaryCollection.fail(
          `La clave del campo «${label.unwrap().value}» no es válida o está repetida`,
        );
      }
      keys.add(key);
      fields.push({
        key,
        label: label.unwrap().value,
        dataType: field.dataType,
        nature: numeric ? field.nature : null,
      });
    }
    const rows: CollectionRowDto[] = [];
    for (const [index, row] of r.rows.entries()) {
      if (row.period !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) {
        return SupplementaryCollection.fail(
          `Fila ${String(index + 1)}: el período debe tener el formato AAAA-MM`,
        );
      }
      const values: Record<string, CellValue> = {};
      for (const field of fields) {
        const value: Result<CellValue> = SupplementaryCollection.value(
          field,
          row.values[field.key] ?? null,
          index + 1,
        );
        if (!value.isOk()) {
          return Result.fail(value.errorOrNull() ?? SupplementaryCollection.invalid('Valor inválido'));
        }
        values[field.key] = value.unwrap();
      }
      rows.push({ id: row.id === '' ? `r${String(index + 1)}` : row.id, period: row.period, values });
    }
    return Result.ok({ name, fields, rows });
  }

  private static value(field: CollectionFieldDto, raw: CellValue, row: number): Result<CellValue> {
    const bad = (expected: string): Result<CellValue> =>
      SupplementaryCollection.fail(`Fila ${String(row)}: «${field.label}» debe ser ${expected}`);
    if (raw === null || raw === '') {
      return Result.ok(null);
    }
    switch (field.dataType) {
      case DataType.BOOLEAN:
        return typeof raw === 'boolean' ? Result.ok(raw) : bad('sí o no');
      case DataType.TEXT:
        return typeof raw === 'string' ? Result.ok(raw.trim()) : bad('texto');
      case DataType.DATE:
        return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? Result.ok(raw)
          : bad('una fecha AAAA-MM-DD');
      case DataType.INTEGER:
        return typeof raw === 'string' && /^-?\d+$/.test(raw.trim())
          ? Result.ok(raw.trim())
          : bad('un número entero');
      case DataType.DECIMAL: {
        if (typeof raw !== 'string') {
          return bad('un número');
        }
        const parsed: Nullable<Decimal> = Decimal.of(raw.trim()).match(
          (d: Decimal): Nullable<Decimal> => d,
          (): Nullable<Decimal> => null,
        );
        if (parsed === null) {
          return bad('un número con punto decimal');
        }
        if (field.nature === NumericNature.RATE && (parsed.isZero() || parsed.isNegative())) {
          return bad('una tasa mayor que cero');
        }
        return Result.ok(parsed.toString());
      }
    }
  }

  private static newKey(taken: ReadonlySet<string>): string {
    let key: string = '';
    while (key === '' || taken.has(key)) {
      key = 'c_';
      for (let i: number = 0; i < 4; i += 1) {
        key += SupplementaryCollection.KEY_ALPHABET.charAt(
          Math.floor(Math.random() * SupplementaryCollection.KEY_ALPHABET.length),
        );
      }
    }
    return key;
  }

  private static fail<T>(message: string): Result<T> {
    return Result.fail(SupplementaryCollection.invalid(message));
  }

  private static invalid(message: string): DomainError {
    return new ValidationError(CollectionErrorCode.INVALID_COLLECTION, message);
  }
}
