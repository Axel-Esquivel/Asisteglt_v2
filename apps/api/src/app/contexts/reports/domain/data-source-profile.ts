import {
  DataType,
  DerivedAttributeKind,
  DerivedAttributeSpec,
  FieldOrigin,
  FieldRole,
  FixedWidthSpec,
  IngestionErrorCode,
  NumericNature,
  ProfileStatus,
  SourceType,
  ColumnSpec,
  IdentifierMaskSpec,
} from '@asisteglt/shared-contracts';
import { FixedWidthLayout } from '@asisteglt/shared-ingestion-core';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogField, FieldCatalog } from './field-catalog';

export interface ProfileSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceType: SourceType;
  readonly extensions: ReadonlyArray<string>;
  readonly fileNamePattern: Nullable<string>;
  readonly status: ProfileStatus;
  readonly version: number;
  readonly spec: FixedWidthSpec;
  readonly updatedAt: Date;
}

export interface ProfileDraft {
  readonly name: string;
  readonly description: string;
  readonly extensions: ReadonlyArray<string>;
  readonly fileNamePattern: Nullable<string>;
  readonly spec: FixedWidthSpec;
}

/** Patrón de nombre de archivo con `*` y `?` (sin distinguir mayúsculas). */
export class FileNamePattern {
  public static matches(pattern: string, fileName: string): boolean {
    const source: string = pattern
      .split('')
      .map((c: string): string =>
        c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    return new RegExp(`^${source}$`, 'i').test(fileName);
  }
}

/**
 * Preconfiguración con nombre para un tipo de archivo (docs/12 §3). Guarda la lectura completa
 * (`FixedWidthSpec`) con referencias a encabezados por clave; nunca guarda líneas del archivo.
 */
export class DataSourceProfile extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private name: string,
    private description: string,
    private extensions: string[],
    private fileNamePattern: Nullable<string>,
    private status: ProfileStatus,
    private version: number,
    private spec: FixedWidthSpec,
    private updatedAt: Date,
  ) {
    super(id);
  }

  public static create(
    projectId: EntityId,
    draft: ProfileDraft,
    catalog: FieldCatalog,
    clock: Clock,
  ): Result<DataSourceProfile> {
    return DataSourceProfile.validate(draft, catalog).map(
      (valid: ProfileDraft): DataSourceProfile =>
        new DataSourceProfile(
          EntityId.generate(),
          projectId,
          valid.name,
          valid.description,
          [...valid.extensions],
          valid.fileNamePattern,
          ProfileStatus.DRAFT,
          1,
          valid.spec,
          clock.now(),
        ),
    );
  }

  public static restore(s: ProfileSnapshot): DataSourceProfile {
    return new DataSourceProfile(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.name,
      s.description,
      [...s.extensions],
      s.fileNamePattern,
      s.status,
      s.version,
      s.spec,
      s.updatedAt,
    );
  }

  public static normalizeName(name: string): string {
    return name.trim().toLocaleLowerCase();
  }

  public getName(): string {
    return this.name;
  }

  public getVersion(): number {
    return this.version;
  }

  public getSpec(): FixedWidthSpec {
    return this.spec;
  }

  public isActive(): boolean {
    return this.status === ProfileStatus.ACTIVE;
  }

  public fieldKeys(): string[] {
    return [
      ...this.spec.columns.map((c: ColumnSpec): string => c.fieldKey),
      ...this.spec.derived.map((d: DerivedAttributeSpec): string => d.targetKey),
    ];
  }

  public accepts(fileName: string): boolean {
    const lower: string = fileName.toLocaleLowerCase();
    return this.extensions.some((ext: string): boolean => lower.endsWith(ext));
  }

  public matchesPattern(fileName: string): boolean {
    return this.fileNamePattern !== null && FileNamePattern.matches(this.fileNamePattern, fileName);
  }

  public update(draft: ProfileDraft, catalog: FieldCatalog, clock: Clock): Result<DataSourceProfile> {
    return DataSourceProfile.validate(draft, catalog).map((valid: ProfileDraft): DataSourceProfile => {
      this.name = valid.name;
      this.description = valid.description;
      this.extensions = [...valid.extensions];
      this.fileNamePattern = valid.fileNamePattern;
      this.spec = valid.spec;
      this.version += 1;
      this.updatedAt = clock.now();
      return this;
    });
  }

  public activate(catalog: FieldCatalog, clock: Clock): Result<DataSourceProfile> {
    return DataSourceProfile.validate(this.draft(), catalog).map((): DataSourceProfile => {
      this.status = ProfileStatus.ACTIVE;
      this.updatedAt = clock.now();
      return this;
    });
  }

  public archive(clock: Clock): void {
    this.status = ProfileStatus.ARCHIVED;
    this.updatedAt = clock.now();
  }

  public toSnapshot(): ProfileSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      name: this.name,
      description: this.description,
      sourceType: SourceType.FIXED_WIDTH,
      extensions: this.extensions,
      fileNamePattern: this.fileNamePattern,
      status: this.status,
      version: this.version,
      spec: this.spec,
      updatedAt: this.updatedAt,
    };
  }

  private draft(): ProfileDraft {
    return {
      name: this.name,
      description: this.description,
      extensions: this.extensions,
      fileNamePattern: this.fileNamePattern,
      spec: this.spec,
    };
  }

  /** Valida contra el catálogo y toma la instantánea de rol, tipo y naturaleza de cada columna. */
  private static validate(draft: ProfileDraft, catalog: FieldCatalog): Result<ProfileDraft> {
    const invalid = (message: string): Result<ProfileDraft> =>
      Result.fail(new ValidationError(IngestionErrorCode.INVALID_PROFILE, message));
    const name: string = draft.name.trim();
    if (!/^[\p{L}\p{N}_.\- ]{2,60}$/u.test(name)) {
      return invalid('El nombre debe tener entre 2 y 60 letras, números, espacios, «_», «-» o «.»');
    }
    const extensions: string[] = [
      ...new Set(
        draft.extensions
          .map((e: string): string => e.trim().toLocaleLowerCase())
          .filter((e: string): boolean => e.length > 0)
          .map((e: string): string => (e.startsWith('.') ? e : `.${e}`)),
      ),
    ];
    if (extensions.length === 0 || extensions.some((e: string): boolean => !/^\.[a-z0-9]{1,10}$/.test(e))) {
      return invalid('Indica al menos una extensión válida (p. ej. .txt)');
    }
    const layout: Result<FixedWidthLayout> = FixedWidthLayout.of(draft.spec.dividers, draft.spec.lineLength);
    if (!layout.isOk()) {
      return invalid('Las divisorias no son válidas');
    }
    const bandCount: number = layout.unwrap().bands().length;
    const columns: ColumnSpec[] = [];
    const seen: Set<string> = new Set<string>();
    for (const column of draft.spec.columns) {
      const field: Nullable<CatalogField> = catalog.find(column.fieldKey).toNullable();
      if (field === null || !field.isActive()) {
        return invalid('Una columna usa un encabezado inexistente o inactivo');
      }
      const s = field.snapshot();
      if (s.origin === FieldOrigin.DERIVED) {
        return invalid(`«${s.label}» se calcula; no se puede leer de un archivo`);
      }
      if (seen.has(s.key)) {
        return invalid(`«${s.label}» está asignado a más de una columna`);
      }
      if (column.bandIndex < 0 || column.bandIndex >= bandCount) {
        return invalid(`La franja ${String(column.bandIndex + 1)} no existe`);
      }
      seen.add(s.key);
      columns.push({ ...column, role: s.role, dataType: s.dataType, nature: s.nature });
    }
    if (!columns.some((c: ColumnSpec): boolean => c.role === FieldRole.IDENTIFIER)) {
      return invalid('La preconfiguración necesita al menos una columna identificadora (rol id)');
    }
    for (const column of columns) {
      const s = catalog
        .find(column.fieldKey)
        .map((f: CatalogField) => f.snapshot())
        .toNullable();
      if (
        s !== null &&
        s.role === FieldRole.IDENTIFIER_NAME &&
        s.describes !== null &&
        !seen.has(s.describes)
      ) {
        const target: string = catalog.labels().get(s.describes) ?? s.describes;
        return invalid(
          `La columna «${s.label}» describe a «${target}», que no está en esta preconfiguración`,
        );
      }
    }
    const masks: IdentifierMaskSpec[] = draft.spec.masks.filter(
      (m: IdentifierMaskSpec): boolean => m.pattern.trim().length > 0,
    );
    if (
      masks.some(
        (m: IdentifierMaskSpec): boolean =>
          !columns.some(
            (c: ColumnSpec): boolean => c.fieldKey === m.fieldKey && c.role === FieldRole.IDENTIFIER,
          ),
      )
    ) {
      return invalid('Las máscaras solo se aplican a columnas identificadoras');
    }
    for (const derived of draft.spec.derived) {
      const target: Nullable<CatalogField> = catalog.find(derived.targetKey).toNullable();
      const ts = target === null ? null : target.snapshot();
      if (!seen.has(derived.sourceKey)) {
        return invalid('El origen de un atributo derivado debe ser una columna de la preconfiguración');
      }
      const expected: boolean =
        ts !== null &&
        ts.active &&
        ts.origin === FieldOrigin.DERIVED &&
        (derived.kind === DerivedAttributeKind.LEAF_FLAG
          ? ts.dataType === DataType.BOOLEAN
          : ts.dataType === DataType.INTEGER && ts.nature === NumericNature.DESCRIPTIVE);
      if (!expected) {
        return invalid(
          'El destino de un atributo derivado debe ser un encabezado derivado (nivel: entero descriptivo; detalle: sí/no)',
        );
      }
    }
    const pattern: Nullable<string> =
      draft.fileNamePattern === null || draft.fileNamePattern.trim() === ''
        ? null
        : draft.fileNamePattern.trim();
    return Result.ok({
      name,
      description: draft.description.trim(),
      extensions,
      fileNamePattern: pattern,
      spec: { ...draft.spec, columns, masks },
    });
  }
}
