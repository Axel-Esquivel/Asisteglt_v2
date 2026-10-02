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
  TemplateElementDto,
  TemplatePageDto,
  TemplateRequest,
  TextAlign,
} from '@asisteglt/shared-contracts';
import { Decoder, FieldDecoder, FieldReader, NumberDecoder, Result } from '@asisteglt/shared-kernel';

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
    }),
  );

  public static request(body: unknown): Result<TemplateRequest> {
    return TemplatesParsers.REQUEST.decode(body);
  }
}
