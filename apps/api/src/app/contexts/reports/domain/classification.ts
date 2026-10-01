import { AnalysisErrorCode, ClassificationNodeDto } from '@asisteglt/shared-contracts';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogField, FieldCatalog } from './field-catalog';

export interface ClassificationSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly fieldKey: string;
  readonly nodes: ReadonlyArray<ClassificationNodeDto>;
  readonly updatedAt: Date;
}

export interface ClassificationDraft {
  readonly name: string;
  readonly fieldKey: string;
  readonly nodes: ReadonlyArray<ClassificationNodeDto>;
}

/** Patrón de asignación con `*` (cualquier texto) y `?` (un carácter), sin distinguir mayúsculas. */
export class NodePattern {
  private readonly regex: RegExp;

  public constructor(public readonly source: string) {
    const body: string = source
      .trim()
      .split('')
      .map((c: string): string =>
        c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    this.regex = new RegExp(`^${body}$`, 'i');
  }

  public matches(value: string): boolean {
    return this.regex.test(value.trim());
  }

  /** Cuántos caracteres literales tiene: el patrón más específico gana. */
  public specificity(): number {
    return this.source.replace(/[*?]/g, '').length;
  }
}

/**
 * Clasificación: árbol de nodos sobre un encabezado clasificable (`id` o `id_name`). Cada nodo
 * asigna valores con patrones; si varios coinciden, gana el más específico.
 */
export class Classification extends AggregateRoot {
  private patterns: ReadonlyArray<{ readonly nodeId: string; readonly pattern: NodePattern }> = [];

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private name: string,
    private fieldKey: string,
    private nodes: ReadonlyArray<ClassificationNodeDto>,
    private updatedAt: Date,
  ) {
    super(id);
    this.index();
  }

  public static create(
    projectId: EntityId,
    draft: ClassificationDraft,
    catalog: FieldCatalog,
    clock: Clock,
  ): Result<Classification> {
    return Classification.validate(draft, catalog).map(
      (valid: ClassificationDraft): Classification =>
        new Classification(
          EntityId.generate(),
          projectId,
          valid.name,
          valid.fieldKey,
          valid.nodes,
          clock.now(),
        ),
    );
  }

  public static restore(s: ClassificationSnapshot): Classification {
    return new Classification(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.name,
      s.fieldKey,
      s.nodes,
      s.updatedAt,
    );
  }

  public getFieldKey(): string {
    return this.fieldKey;
  }

  public getNodes(): ReadonlyArray<ClassificationNodeDto> {
    return this.nodes;
  }

  public belongsTo(projectId: EntityId): boolean {
    return this.projectId.equals(projectId);
  }

  public update(draft: ClassificationDraft, catalog: FieldCatalog, clock: Clock): Result<Classification> {
    return Classification.validate(draft, catalog).map((valid: ClassificationDraft): Classification => {
      this.name = valid.name;
      this.fieldKey = valid.fieldKey;
      this.nodes = valid.nodes;
      this.updatedAt = clock.now();
      this.index();
      return this;
    });
  }

  /** Nodo al que pertenece un valor, o `null` si ningún patrón coincide. */
  public classify(value: string): Nullable<string> {
    let best: Nullable<{ readonly nodeId: string; readonly pattern: NodePattern }> = null;
    for (const entry of this.patterns) {
      if (
        entry.pattern.matches(value) &&
        (best === null || entry.pattern.specificity() > best.pattern.specificity())
      ) {
        best = entry;
      }
    }
    return best === null ? null : best.nodeId;
  }

  public children(parentId: Nullable<string>): ClassificationNodeDto[] {
    return this.nodes.filter((n: ClassificationNodeDto): boolean => n.parentId === parentId);
  }

  public toSnapshot(): ClassificationSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      name: this.name,
      fieldKey: this.fieldKey,
      nodes: this.nodes,
      updatedAt: this.updatedAt,
    };
  }

  private index(): void {
    this.patterns = this.nodes.flatMap((n: ClassificationNodeDto) =>
      n.patterns.map((p: string) => ({ nodeId: n.id, pattern: new NodePattern(p) })),
    );
  }

  private static validate(draft: ClassificationDraft, catalog: FieldCatalog): Result<ClassificationDraft> {
    const invalid = (message: string): Result<ClassificationDraft> =>
      Result.fail(new ValidationError(AnalysisErrorCode.INVALID_CLASSIFICATION, message));
    const name: string = draft.name.trim();
    if (name.length < 2 || name.length > 80) {
      return invalid('El nombre debe tener entre 2 y 80 caracteres');
    }
    const field: Nullable<CatalogField> = catalog.find(draft.fieldKey).toNullable();
    if (field === null || !field.isActive() || !field.isClassifiable()) {
      return Result.fail(
        new ValidationError(
          AnalysisErrorCode.FIELD_NOT_CLASSIFIABLE,
          'Solo se clasifica por un identificador o su nombre',
        ),
      );
    }
    const ids: Set<string> = new Set<string>(draft.nodes.map((n: ClassificationNodeDto): string => n.id));
    if (ids.size !== draft.nodes.length || draft.nodes.length > 2000) {
      return invalid('Los nodos deben tener identificadores únicos (máximo 2000)');
    }
    for (const node of draft.nodes) {
      if (node.name.trim().length === 0 || (node.parentId !== null && !ids.has(node.parentId))) {
        return invalid('Cada nodo necesita nombre y un nodo superior existente');
      }
    }
    for (const node of draft.nodes) {
      const seen: Set<string> = new Set<string>([node.id]);
      let parent: Nullable<string> = node.parentId;
      while (parent !== null) {
        if (seen.has(parent)) {
          return invalid('La jerarquía de nodos tiene un ciclo');
        }
        seen.add(parent);
        const next: Nullable<ClassificationNodeDto> =
          draft.nodes.find((n: ClassificationNodeDto): boolean => n.id === parent) ?? null;
        parent = next === null ? null : next.parentId;
      }
    }
    return Result.ok({
      name,
      fieldKey: field.key,
      nodes: draft.nodes.map((n: ClassificationNodeDto): ClassificationNodeDto => ({
        id: n.id,
        parentId: n.parentId,
        code: n.code.trim(),
        name: n.name.trim(),
        patterns: n.patterns
          .map((p: string): string => p.trim())
          .filter((p: string): boolean => p.length > 0),
      })),
    });
  }
}
