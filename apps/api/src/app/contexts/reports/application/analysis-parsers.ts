import {
  ClassificationNodeDto,
  ClassificationRequest,
  DataColumnDto,
  DataColumnKind,
  DataScopeDto,
  FormulaColumnDto,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  PresentationCurrencyDto,
  RateQuote,
  ReportDefinitionRequest,
  RowSource,
} from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, Nullable, Result } from '@asisteglt/shared-kernel';
import { DataScope } from '../domain/data-scope';

/** Validación de los cuerpos JSON de clasificaciones e informes (compartible con el navegador). */
export class AnalysisParsers {
  public static readonly NODE: Decoder<ClassificationNodeDto> = new FieldDecoder<ClassificationNodeDto>(
    (f: FieldReader): ClassificationNodeDto => ({
      id: f.string('id'),
      parentId: f.nullableString('parentId'),
      code: f.string('code'),
      name: f.string('name'),
      patterns: f.stringList('patterns'),
    }),
  );

  public static readonly FORMULA_COLUMN: Decoder<FormulaColumnDto> = new FieldDecoder<FormulaColumnDto>(
    (f: FieldReader): FormulaColumnDto => ({ label: f.string('label'), formula: f.string('formula') }),
  );

  private static readonly CLASSIFICATION: Decoder<ClassificationRequest> =
    new FieldDecoder<ClassificationRequest>((f: FieldReader): ClassificationRequest => ({
      name: f.string('name'),
      fieldKey: f.string('fieldKey'),
      nodes: f.list('nodes', AnalysisParsers.NODE),
    }));

  public static readonly COLUMN: Decoder<DataColumnDto> = new FieldDecoder<DataColumnDto>(
    (f: FieldReader): DataColumnDto => ({
      kind: f.oneOf('kind', Object.values(DataColumnKind)),
      label: f.string('label'),
      fieldKey: f.nullableString('fieldKey'),
      formula: f.nullableString('formula'),
      periodValue: f.oneOf('periodValue', Object.values(PeriodValue)),
      periodOffset: f.number('periodOffset'),
    }),
  );

  public static readonly SCOPE: Decoder<DataScopeDto> = new FieldDecoder<DataScopeDto>(
    (f: FieldReader): DataScopeDto => ({
      organizationIds: f.stringList('organizationIds'),
      countryIds: f.stringList('countryIds'),
      currencies: f.stringList('currencies'),
      companyIds: f.stringList('companyIds'),
      enterpriseIds: f.stringList('enterpriseIds'),
      branchIds: f.stringList('branchIds'),
    }),
  );

  public static readonly PRESENTATION: Decoder<PresentationCurrencyDto> =
    new FieldDecoder<PresentationCurrencyDto>((f: FieldReader): PresentationCurrencyDto => ({
      targetCurrency: f.string('targetCurrency'),
      collectionId: f.string('collectionId'),
      rateFieldKey: f.string('rateFieldKey'),
      currencyFieldKey: f.string('currencyFieldKey'),
      quote: f.oneOf('quote', Object.values(RateQuote)),
    }));

  /**
   * Tabla de datos. Acepta también la forma anterior de los informes (medidas como lista de
   * encabezados, columnas calculadas aparte y una sola compañía) y la convierte.
   */
  private static readonly REPORT: Decoder<ReportDefinitionRequest> =
    new FieldDecoder<ReportDefinitionRequest>((f: FieldReader): ReportDefinitionRequest => {
      const legacy: boolean = f.raw('columns') === null;
      const company: Nullable<string> = f.raw('scope') === null ? f.nullableString('companyId') : null;
      return {
        name: f.string('name'),
        rowSource: f.oneOf('rowSource', Object.values(RowSource)),
        classificationId: f.nullableString('classificationId'),
        rowFieldKey: f.nullableString('rowFieldKey'),
        classificationColumns:
          f.raw('classificationColumns') === null ? [] : f.stringList('classificationColumns'),
        columns: legacy
          ? [
              ...f.stringList('measures').map((key: string): DataColumnDto => ({
                kind: DataColumnKind.MEASURE,
                label: '',
                fieldKey: key,
                formula: null,
                periodValue: PeriodValue.ACCUMULATED,
                periodOffset: 0,
              })),
              ...(f.raw('formulaColumns') === null
                ? []
                : f.list('formulaColumns', AnalysisParsers.FORMULA_COLUMN)
              ).map((c: FormulaColumnDto): DataColumnDto => ({
                kind: DataColumnKind.FORMULA,
                label: c.label,
                fieldKey: null,
                formula: c.formula,
                periodValue: PeriodValue.ACCUMULATED,
                periodOffset: 0,
              })),
            ]
          : f.list('columns', AnalysisParsers.COLUMN),
        profileId: f.nullableString('profileId'),
        scope:
          f.raw('scope') === null
            ? { ...DataScope.all(), companyIds: company === null ? [] : [company] }
            : f.nested('scope', AnalysisParsers.SCOPE),
        periodGrouping:
          f.raw('periodGrouping') === null
            ? PeriodGrouping.MONTH
            : f.oneOf('periodGrouping', Object.values(PeriodGrouping)),
        columnSplit: f.raw('columnSplit') === null ? [] : f.oneOfList('columnSplit', Object.values(OrgLevel)),
        subtotals: f.raw('subtotals') === null ? true : f.boolean('subtotals'),
        onlyWhenFieldKey: f.nullableString('onlyWhenFieldKey'),
        includeUnclassified: f.boolean('includeUnclassified'),
        presentation:
          f.raw('presentation') === null ? null : f.nested('presentation', AnalysisParsers.PRESENTATION),
      };
    });

  public static classification(body: unknown): Result<ClassificationRequest> {
    return AnalysisParsers.CLASSIFICATION.decode(body);
  }

  public static report(body: unknown): Result<ReportDefinitionRequest> {
    return AnalysisParsers.REPORT.decode(body);
  }
}
