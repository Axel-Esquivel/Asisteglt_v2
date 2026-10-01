import { OperationKind, OperationStepDto } from '@asisteglt/shared-contracts';
import {
  CompiledFormula,
  FieldInfo,
  FormulaCompiler,
  FormulaContext,
  ListFieldResolver,
} from '@asisteglt/shared-formula-engine';
import { FieldDecoder, FieldReader, Result } from '@asisteglt/shared-kernel';
import { CatalogFieldView, CatalogView } from './catalog.model';
import { Option } from './reports-labels';

const STEP: FieldDecoder<OperationStepDto> = new FieldDecoder<OperationStepDto>(
  (f: FieldReader): OperationStepDto => ({
    id: f.string('id'),
    kind: f.oneOf('kind', Object.values(OperationKind)),
    targetKey: f.string('targetKey'),
    formula: f.nullableString('formula'),
    sourceKey: f.nullableString('sourceKey'),
    collectionId: f.nullableString('collectionId'),
    rateFieldKey: f.nullableString('rateFieldKey'),
    targetCurrency: f.nullableString('targetCurrency'),
  }),
);

/** Operaciones del proyecto tal como las devuelve la API (fórmulas con nombres). */
export class OperationsView {
  public constructor(
    public readonly version: number,
    public readonly steps: OperationStepDto[],
  ) {}

  public static decoder(): FieldDecoder<OperationsView> {
    return new FieldDecoder<OperationsView>(
      (f: FieldReader): OperationsView => new OperationsView(f.number('version'), f.list('steps', STEP)),
    );
  }

  public static kindLabel(kind: OperationKind): string {
    switch (kind) {
      case OperationKind.CALCULATED:
        return 'Campo calculado';
      case OperationKind.YEAR_TO_DATE:
        return 'Acumulado del año';
      case OperationKind.CURRENCY_CONVERSION:
        return 'Conversión de moneda';
    }
  }

  public static readonly KINDS: Option<OperationKind>[] = [
    { label: 'Campo calculado', value: OperationKind.CALCULATED },
    { label: 'Acumulado del año', value: OperationKind.YEAR_TO_DATE },
  ];
}

/** Verificación en el navegador con el mismo motor que usa la API. */
export class FormulaCheck {
  private constructor(
    public readonly ok: boolean,
    public readonly message: string,
  ) {}

  public static of(source: string, catalog: CatalogView): FormulaCheck {
    if (source.trim() === '') {
      return new FormulaCheck(false, 'Escribe una fórmula, p. ej. =[Debe] - [Haber]');
    }
    const result: Result<CompiledFormula> = new FormulaCompiler().compile(
      source,
      FormulaCheck.resolver(catalog),
      FormulaContext.RECORD,
    );
    const error = result.errorOrNull();
    return error === null
      ? new FormulaCheck(true, `Resultado: ${result.unwrap().resultType.describe()}`)
      : new FormulaCheck(false, error.message);
  }

  public static resolver(catalog: CatalogView): ListFieldResolver {
    return new ListFieldResolver(
      catalog.fields.map((field: CatalogFieldView): FieldInfo => {
        const s = field.raw();
        return new FieldInfo(s.key, s.label, s.dataType, s.nature, s.aggregation, s.weightField, s.active);
      }),
    );
  }

  public static empty(): FormulaCheck {
    return new FormulaCheck(false, '');
  }

  public static describe(step: OperationStepDto, catalog: CatalogView): string {
    switch (step.kind) {
      case OperationKind.CALCULATED:
        return step.formula ?? '';
      case OperationKind.YEAR_TO_DATE:
        return `Acumula «${catalog.labelOf(step.sourceKey ?? '')}» desde enero`;
      case OperationKind.CURRENCY_CONVERSION:
        return `Convierte «${catalog.labelOf(step.sourceKey ?? '')}» a ${step.targetCurrency ?? ''}`;
    }
  }
}
