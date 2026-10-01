import {
  DataType,
  FieldOrigin,
  NumericNature,
  OperationKind,
  OperationStepDto,
  OperationsErrorCode,
} from '@asisteglt/shared-contracts';
import {
  CompiledFormula,
  FieldResolver,
  FormulaCompiler,
  FormulaContext,
  ValueKind,
  ValueType,
} from '@asisteglt/shared-formula-engine';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { CatalogField, FieldCatalog } from './field-catalog';
import { SupplementaryCollection } from './supplementary-collection';

export interface OperationPipelineSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  /** Fórmulas en forma canónica (`[#clave]`). */
  readonly steps: ReadonlyArray<OperationStepDto>;
  readonly updatedAt: Date;
}

/**
 * Operaciones del proyecto, en orden: cada paso escribe un encabezado derivado que los pasos
 * siguientes, los datos y los informes usan por su nombre.
 */
export class OperationPipeline extends AggregateRoot {
  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private version: number,
    private steps: ReadonlyArray<OperationStepDto>,
    private updatedAt: Date,
  ) {
    super(id);
  }

  public static empty(projectId: EntityId, clock: Clock): OperationPipeline {
    return new OperationPipeline(EntityId.generate(), projectId, 0, [], clock.now());
  }

  public static restore(s: OperationPipelineSnapshot): OperationPipeline {
    return new OperationPipeline(
      EntityId.fromString(s.id).unwrap(),
      EntityId.fromString(s.projectId).unwrap(),
      s.version,
      s.steps.map((step: OperationStepDto): OperationStepDto => ({
        ...step,
        currencyFieldKey: step.currencyFieldKey ?? null,
        quote: step.quote ?? null,
      })),
      s.updatedAt,
    );
  }

  public getSteps(): ReadonlyArray<OperationStepDto> {
    return this.steps;
  }

  public getVersion(): number {
    return this.version;
  }

  /** Valida cada paso contra el catálogo (con los derivados de los pasos anteriores) y guarda. */
  public replace(
    steps: ReadonlyArray<OperationStepDto>,
    catalog: FieldCatalog,
    resolver: FieldResolver,
    collectionOf: (id: string) => Nullable<SupplementaryCollection>,
    clock: Clock,
  ): Result<OperationPipeline> {
    const targets: Set<string> = new Set<string>();
    const validated: OperationStepDto[] = [];
    for (const [index, step] of steps.entries()) {
      const result: Result<OperationStepDto> = OperationPipeline.validate(
        step,
        index + 1,
        catalog,
        resolver,
        collectionOf,
      );
      if (!result.isOk()) {
        return Result.fail(result.errorOrNull() ?? OperationPipeline.invalid('Paso inválido'));
      }
      if (targets.has(step.targetKey)) {
        return Result.fail(
          OperationPipeline.invalid(`El paso ${String(index + 1)} repite el destino de otro paso`),
        );
      }
      targets.add(step.targetKey);
      validated.push(result.unwrap());
    }
    this.steps = validated;
    this.version += 1;
    this.updatedAt = clock.now();
    return Result.ok(this);
  }

  /** Pasos que usan un encabezado (como destino, origen, tasa o dentro de la fórmula). */
  public usages(key: string): string[] {
    return this.steps.flatMap((s: OperationStepDto, index: number): string[] =>
      s.targetKey === key || s.sourceKey === key || (s.formula ?? '').includes(`[#${key}]`)
        ? [`Operación ${String(index + 1)}`]
        : [],
    );
  }

  public usesCollection(collectionId: string): boolean {
    return this.steps.some((s: OperationStepDto): boolean => s.collectionId === collectionId);
  }

  /** Moneda fija de los encabezados escritos por una conversión (destino → moneda). */
  public convertedCurrencies(): ReadonlyMap<string, string> {
    return new Map<string, string>(
      this.steps
        .filter((s: OperationStepDto): boolean => s.kind === OperationKind.CURRENCY_CONVERSION)
        .map((s: OperationStepDto): [string, string] => [s.targetKey, s.targetCurrency ?? '']),
    );
  }

  public toSnapshot(): OperationPipelineSnapshot {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      version: this.version,
      steps: this.steps,
      updatedAt: this.updatedAt,
    };
  }

  private static validate(
    step: OperationStepDto,
    number: number,
    catalog: FieldCatalog,
    resolver: FieldResolver,
    collectionOf: (id: string) => Nullable<SupplementaryCollection>,
  ): Result<OperationStepDto> {
    const target: Nullable<CatalogField> = catalog.find(step.targetKey).toNullable();
    if (target === null || !target.isActive() || target.snapshot().origin !== FieldOrigin.DERIVED) {
      return Result.fail(
        OperationPipeline.invalid(
          `Paso ${String(number)}: el destino debe ser un encabezado derivado activo`,
        ),
      );
    }
    const ts = target.snapshot();
    const blank: OperationStepDto = {
      ...step,
      formula: null,
      sourceKey: null,
      collectionId: null,
      rateFieldKey: null,
      currencyFieldKey: null,
      quote: null,
      targetCurrency: null,
    };
    switch (step.kind) {
      case OperationKind.CALCULATED: {
        const compiled: Result<CompiledFormula> = new FormulaCompiler().compile(
          step.formula ?? '',
          resolver,
          FormulaContext.RECORD,
        );
        if (!compiled.isOk()) {
          return Result.fail(compiled.errorOrNull() ?? OperationPipeline.invalid('Fórmula inválida'));
        }
        if (compiled.unwrap().fieldDependencies.includes(step.targetKey)) {
          return Result.fail(
            OperationPipeline.invalid(`Paso ${String(number)}: la fórmula no puede usar su propio destino`),
          );
        }
        const type: ValueType = compiled.unwrap().resultType;
        if (!OperationPipeline.fits(type, ts.dataType, ts.nature)) {
          return Result.fail(
            new ValidationError(
              OperationsErrorCode.TARGET_TYPE_MISMATCH,
              `El resultado es ${type.describe()} y «${ts.label}» es ${OperationPipeline.describe(ts.dataType, ts.nature)}`,
            ),
          );
        }
        return Result.ok({ ...blank, formula: compiled.unwrap().canonicalSource });
      }
      case OperationKind.YEAR_TO_DATE: {
        const source: Nullable<CatalogField> =
          step.sourceKey === null ? null : catalog.find(step.sourceKey).toNullable();
        const ss = source === null ? null : source.snapshot();
        const additive: boolean =
          ss !== null &&
          ss.active &&
          (ss.nature === NumericNature.AMOUNT || ss.nature === NumericNature.QUANTITY);
        if (ss === null || !additive || ss.nature !== ts.nature) {
          return Result.fail(
            new ValidationError(
              OperationsErrorCode.TARGET_TYPE_MISMATCH,
              `Paso ${String(number)}: el acumulado necesita un Monto o una Cantidad y un destino de la misma naturaleza`,
            ),
          );
        }
        return Result.ok({ ...blank, sourceKey: ss.key });
      }
      case OperationKind.CURRENCY_CONVERSION: {
        const source: Nullable<CatalogField> =
          step.sourceKey === null ? null : catalog.find(step.sourceKey).toNullable();
        const ss = source === null ? null : source.snapshot();
        const convertible: boolean =
          ss !== null &&
          ss.active &&
          (ss.nature === NumericNature.AMOUNT || ss.nature === NumericNature.UNIT_PRICE);
        const currency: string = (step.targetCurrency ?? '').trim().toUpperCase();
        if (ss === null || !convertible || ss.nature !== ts.nature) {
          return Result.fail(
            new ValidationError(
              OperationsErrorCode.TARGET_TYPE_MISMATCH,
              `Paso ${String(number)}: solo se convierten Montos o Precios unitarios a un destino de la misma naturaleza`,
            ),
          );
        }
        const collection: Nullable<SupplementaryCollection> =
          step.collectionId === null ? null : collectionOf(step.collectionId);
        const rate =
          collection === null || step.rateFieldKey === null ? null : collection.field(step.rateFieldKey);
        const code =
          collection === null || step.currencyFieldKey === null
            ? null
            : collection.field(step.currencyFieldKey);
        if (
          collection === null ||
          rate === null ||
          rate.nature !== NumericNature.RATE ||
          code === null ||
          code.dataType !== DataType.TEXT ||
          step.quote === null ||
          !/^[A-Z]{3}$/.test(currency)
        ) {
          return Result.fail(
            OperationPipeline.invalid(
              `Paso ${String(number)}: elige la colección, su campo de tasa (naturaleza Tasa), su campo de moneda (texto), cómo está cotizada y la moneda destino`,
            ),
          );
        }
        return Result.ok({
          ...blank,
          sourceKey: ss.key,
          collectionId: step.collectionId,
          rateFieldKey: rate.key,
          currencyFieldKey: code.key,
          quote: step.quote,
          targetCurrency: currency,
        });
      }
    }
  }

  private static fits(type: ValueType, dataType: DataType, nature: Nullable<NumericNature>): boolean {
    switch (type.kind) {
      case ValueKind.NUMBER:
        return (
          (dataType === DataType.DECIMAL || dataType === DataType.INTEGER) &&
          (type.literal || type.nature === nature)
        );
      case ValueKind.TEXT:
        return dataType === DataType.TEXT;
      case ValueKind.DATE:
        return dataType === DataType.DATE;
      case ValueKind.BOOLEAN:
        return dataType === DataType.BOOLEAN;
    }
  }

  private static describe(dataType: DataType, nature: Nullable<NumericNature>): string {
    if (nature !== null) {
      return ValueType.natureLabel(nature);
    }
    return dataType === DataType.TEXT
      ? 'Texto'
      : dataType === DataType.DATE
        ? 'Fecha'
        : dataType === DataType.BOOLEAN
          ? 'Sí/No'
          : 'Número';
  }

  private static invalid(message: string): ValidationError {
    return new ValidationError(OperationsErrorCode.INVALID_OPERATION, message);
  }
}
