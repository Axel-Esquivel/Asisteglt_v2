import {
  ChartType,
  ElementKind,
  ElementStyleDto,
  LayoutBoxDto,
  NegativeStyle,
  NumberFormatDto,
  NumberScale,
  PageFormatName,
  PageOrientation,
  PeriodGrouping,
  PeriodValue,
  PivotDimensionDto,
  PivotDto,
  PivotSource,
  PivotValueDto,
  PivotValueKind,
  ValueFilterDto,
  TemplateElementDto,
  TemplatePageDto,
  TemplateRequest,
  TextAlign,
} from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, NumberDecoder, Result } from '@asisteglt/shared-kernel';
import { AnalysisParsers } from './analysis-parsers';

/** Validación estructural de las plantillas (compartible con el navegador). */
export class TemplatesParsers {
  public static readonly BOX: Decoder<LayoutBoxDto> = new FieldDecoder<LayoutBoxDto>(
    (f: FieldReader): LayoutBoxDto => ({
      x: f.number('x'),
      y: f.number('y'),
      width: f.number('width'),
      height: f.number('height'),
    }),
  );

  public static readonly STYLE: Decoder<ElementStyleDto> = new FieldDecoder<ElementStyleDto>(
    (f: FieldReader): ElementStyleDto => ({
      fontSize: f.number('fontSize'),
      bold: f.boolean('bold'),
      align: f.oneOf('align', Object.values(TextAlign)),
    }),
  );

  public static readonly NUMBER_FORMAT: Decoder<NumberFormatDto> = new FieldDecoder<NumberFormatDto>(
    (f: FieldReader): NumberFormatDto => ({
      decimals: f.number('decimals'),
      thousands: f.boolean('thousands'),
      negative: f.oneOf('negative', Object.values(NegativeStyle)),
      scale: f.oneOf('scale', Object.values(NumberScale)),
      prefix: f.string('prefix'),
      suffix: f.string('suffix'),
    }),
  );

  public static readonly FILTER: Decoder<ValueFilterDto> = new FieldDecoder<ValueFilterDto>(
    (f: FieldReader): ValueFilterDto => ({
      classificationId: f.nullableString('classificationId'),
      nodeIds: f.stringList('nodeIds'),
      scope: f.nested('scope', AnalysisParsers.SCOPE),
      periodGrouping: f.oneOf('periodGrouping', Object.values(PeriodGrouping)),
      periodValue: f.oneOf('periodValue', Object.values(PeriodValue)),
      periodOffset: f.number('periodOffset'),
      presentation:
        f.raw('presentation') === null ? null : f.nested('presentation', AnalysisParsers.PRESENTATION),
    }),
  );

  public static readonly DIMENSION: Decoder<PivotDimensionDto> = new FieldDecoder<PivotDimensionDto>(
    (f: FieldReader): PivotDimensionDto => ({
      source: f.oneOf('source', Object.values(PivotSource)),
      key: f.string('key'),
      level: f.number('level'),
    }),
  );

  public static readonly PIVOT_VALUE: Decoder<PivotValueDto> = new FieldDecoder<PivotValueDto>(
    (f: FieldReader): PivotValueDto => ({
      kind: f.oneOf('kind', Object.values(PivotValueKind)),
      fieldKey: f.nullableString('fieldKey'),
      label: f.string('label'),
      periodOffset: f.number('periodOffset'),
      left: f.number('left'),
      right: f.number('right'),
    }),
  );

  public static readonly PIVOT: Decoder<PivotDto> = new FieldDecoder<PivotDto>(
    (f: FieldReader): PivotDto => ({
      rows: f.list('rows', TemplatesParsers.DIMENSION),
      columns: f.list('columns', TemplatesParsers.DIMENSION),
      values: f.list('values', TemplatesParsers.PIVOT_VALUE),
      subtotals: f.boolean('subtotals'),
      rowTitle: f.string('rowTitle'),
      totalLabel: f.string('totalLabel'),
    }),
  );

  /** Los elementos guardados antes de los filtros y la tabla dinámica no traen esos campos. */
  public static readonly ELEMENT: Decoder<TemplateElementDto> = new FieldDecoder<TemplateElementDto>(
    (f: FieldReader): TemplateElementDto => ({
      id: f.string('id'),
      kind: f.oneOf('kind', Object.values(ElementKind)),
      name: f.string('name'),
      box: f.nested('box', TemplatesParsers.BOX),
      style: f.nested('style', TemplatesParsers.STYLE),
      numberFormat: f.nested('numberFormat', TemplatesParsers.NUMBER_FORMAT),
      text: f.nullableString('text'),
      reportId: f.nullableString('reportId'),
      formula: f.nullableString('formula'),
      profileId: f.nullableString('profileId'),
      companyId: f.nullableString('companyId'),
      chartType: f.raw('chartType') === null ? null : f.oneOf('chartType', Object.values(ChartType)),
      columns: f.list('columns', new NumberDecoder()),
      filter: f.raw('filter') === null ? null : f.nested('filter', TemplatesParsers.FILTER),
      pivot: f.raw('pivot') === null ? null : f.nested('pivot', TemplatesParsers.PIVOT),
    }),
  );

  public static readonly PAGE: Decoder<TemplatePageDto> = new FieldDecoder<TemplatePageDto>(
    (f: FieldReader): TemplatePageDto => ({
      id: f.string('id'),
      name: f.string('name'),
      format: f.oneOf('format', Object.values(PageFormatName)),
      width: f.number('width'),
      height: f.number('height'),
      orientation: f.oneOf('orientation', Object.values(PageOrientation)),
      margin: f.number('margin'),
      header: f.string('header'),
      footer: f.string('footer'),
      elements: f.list('elements', TemplatesParsers.ELEMENT),
    }),
  );

  public static readonly REQUEST: Decoder<TemplateRequest> = new FieldDecoder<TemplateRequest>(
    (f: FieldReader): TemplateRequest => ({
      name: f.string('name'),
      pages: f.list('pages', TemplatesParsers.PAGE),
      scopeParameter: f.raw('scopeParameter') === null ? false : f.boolean('scopeParameter'),
    }),
  );

  public static request(body: unknown): Result<TemplateRequest> {
    return TemplatesParsers.REQUEST.decode(body);
  }
}
