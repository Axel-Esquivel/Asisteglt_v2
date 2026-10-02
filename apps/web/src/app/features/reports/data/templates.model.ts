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
  TextAlign,
} from '@asisteglt/shared-contracts';
import {
  Decimal,
  FieldDecoder,
  FieldReader,
  Nullable,
  NumberDecoder,
  RoundingMode,
} from '@asisteglt/shared-kernel';
import { ComputedReport } from './analysis.model';
import { Option } from './reports-labels';

const BOX: FieldDecoder<LayoutBoxDto> = new FieldDecoder<LayoutBoxDto>((f: FieldReader): LayoutBoxDto => ({
  x: f.number('x'),
  y: f.number('y'),
  width: f.number('width'),
  height: f.number('height'),
}));

const STYLE: FieldDecoder<ElementStyleDto> = new FieldDecoder<ElementStyleDto>(
  (f: FieldReader): ElementStyleDto => ({
    fontSize: f.number('fontSize'),
    bold: f.boolean('bold'),
    align: f.oneOf('align', Object.values(TextAlign)),
  }),
);

const FORMAT: FieldDecoder<NumberFormatDto> = new FieldDecoder<NumberFormatDto>(
  (f: FieldReader): NumberFormatDto => ({
    decimals: f.number('decimals'),
    thousands: f.boolean('thousands'),
    negative: f.oneOf('negative', Object.values(NegativeStyle)),
    scale: f.oneOf('scale', Object.values(NumberScale)),
    prefix: f.string('prefix'),
    suffix: f.string('suffix'),
  }),
);

const ELEMENT: FieldDecoder<TemplateElementDto> = new FieldDecoder<TemplateElementDto>(
  (f: FieldReader): TemplateElementDto => ({
    id: f.string('id'),
    kind: f.oneOf('kind', Object.values(ElementKind)),
    name: f.string('name'),
    box: f.nested('box', BOX),
    style: f.nested('style', STYLE),
    numberFormat: f.nested('numberFormat', FORMAT),
    text: f.nullableString('text'),
    reportId: f.nullableString('reportId'),
    formula: f.nullableString('formula'),
    profileId: f.nullableString('profileId'),
    companyId: f.nullableString('companyId'),
    chartType: f.raw('chartType') === null ? null : f.oneOf('chartType', Object.values(ChartType)),
    columns: f.list('columns', new NumberDecoder()),
  }),
);

const PAGE: FieldDecoder<TemplatePageDto> = new FieldDecoder<TemplatePageDto>(
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
    elements: f.list('elements', ELEMENT),
  }),
);

/** Plantilla tal como la devuelve la API (fórmulas con nombres). */
export class TemplateView {
  public constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly version: number,
    public readonly pages: TemplatePageDto[],
  ) {}

  public static decoder(): FieldDecoder<TemplateView> {
    return new FieldDecoder<TemplateView>(
      (f: FieldReader): TemplateView =>
        new TemplateView(f.string('id'), f.string('name'), f.number('version'), f.list('pages', PAGE)),
    );
  }
}

export class ChartSeries {
  public constructor(
    public readonly label: string,
    public readonly values: Array<Nullable<string>>,
  ) {}
}

export class RenderedElement {
  public constructor(
    public readonly id: string,
    public readonly kind: ElementKind,
    public readonly text: Nullable<string>,
    public readonly table: Nullable<ComputedReport>,
    public readonly value: Nullable<string>,
    public readonly labels: string[],
    public readonly series: ChartSeries[],
    public readonly error: Nullable<string>,
  ) {}
}

export class RenderedPage {
  public constructor(
    public readonly id: string,
    public readonly header: string,
    public readonly footer: string,
    public readonly elements: RenderedElement[],
  ) {}

  public element(id: string): Nullable<RenderedElement> {
    return this.elements.find((e: RenderedElement): boolean => e.id === id) ?? null;
  }
}

export class RenderedTemplate {
  public constructor(
    public readonly name: string,
    public readonly period: string,
    public readonly pages: RenderedPage[],
  ) {}

  public static decoder(): FieldDecoder<RenderedTemplate> {
    const series: FieldDecoder<ChartSeries> = new FieldDecoder<ChartSeries>((f: FieldReader): ChartSeries => {
      const raw: unknown = f.raw('values');
      const values: Array<Nullable<string>> = Array.isArray(raw)
        ? raw.map((v: unknown): Nullable<string> => (typeof v === 'string' ? v : null))
        : [];
      return new ChartSeries(f.string('label'), values);
    });
    const chart: FieldDecoder<{ labels: string[]; series: ChartSeries[] }> = new FieldDecoder(
      (f: FieldReader): { labels: string[]; series: ChartSeries[] } => ({
        labels: f.stringList('labels'),
        series: f.list('series', series),
      }),
    );
    const element: FieldDecoder<RenderedElement> = new FieldDecoder<RenderedElement>(
      (f: FieldReader): RenderedElement => {
        const rendered = f.raw('chart') === null ? { labels: [], series: [] } : f.nested('chart', chart);
        return new RenderedElement(
          f.string('id'),
          f.oneOf('kind', Object.values(ElementKind)),
          f.nullableString('text'),
          f.raw('table') === null ? null : f.nested('table', ComputedReport.decoder()),
          f.nullableString('value'),
          rendered.labels,
          rendered.series,
          f.nullableString('error'),
        );
      },
    );
    const page: FieldDecoder<RenderedPage> = new FieldDecoder<RenderedPage>(
      (f: FieldReader): RenderedPage =>
        new RenderedPage(f.string('id'), f.string('header'), f.string('footer'), f.list('elements', element)),
    );
    return new FieldDecoder<RenderedTemplate>(
      (f: FieldReader): RenderedTemplate =>
        new RenderedTemplate(f.string('name'), f.string('period'), f.list('pages', page)),
    );
  }
}

/** Tamaño efectivo de una página (mm) según formato y orientación; mismo criterio que la API. */
export class PageGeometry {
  private static readonly SIZES: ReadonlyMap<PageFormatName, readonly [number, number]> = new Map<
    PageFormatName,
    readonly [number, number]
  >([
    [PageFormatName.LETTER, [215.9, 279.4]],
    [PageFormatName.LEGAL, [215.9, 355.6]],
    [PageFormatName.OFICIO, [215.9, 330.2]],
    [PageFormatName.A4, [210, 297]],
  ]);

  public static readonly FORMATS: Option<PageFormatName>[] = [
    { label: 'Carta (216 × 279 mm)', value: PageFormatName.LETTER },
    { label: 'Oficio (216 × 330 mm)', value: PageFormatName.OFICIO },
    { label: 'Legal (216 × 356 mm)', value: PageFormatName.LEGAL },
    { label: 'A4 (210 × 297 mm)', value: PageFormatName.A4 },
    { label: 'Personalizado', value: PageFormatName.CUSTOM },
  ];

  public static readonly ORIENTATIONS: Option<PageOrientation>[] = [
    { label: 'Vertical', value: PageOrientation.PORTRAIT },
    { label: 'Horizontal', value: PageOrientation.LANDSCAPE },
  ];

  public constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}

  public static of(page: TemplatePageDto): PageGeometry {
    const [w, h] = PageGeometry.SIZES.get(page.format) ?? [page.width, page.height];
    return page.orientation === PageOrientation.PORTRAIT ? new PageGeometry(w, h) : new PageGeometry(h, w);
  }

  public static sizeOf(format: PageFormatName): readonly [number, number] {
    return PageGeometry.SIZES.get(format) ?? [215.9, 279.4];
  }
}

export class FormattedNumber {
  public constructor(
    public readonly text: string,
    public readonly negative: boolean,
  ) {}
}

/** Formato numérico de los elementos: escala, decimales, miles, negativos, prefijo y sufijo. */
export class NumberFormatter {
  public static readonly NEGATIVES: Option<NegativeStyle>[] = [
    { label: '-1,234.56', value: NegativeStyle.MINUS },
    { label: '(1,234.56)', value: NegativeStyle.PARENTHESES },
    { label: '-1,234.56 en rojo', value: NegativeStyle.RED },
  ];

  public static readonly SCALES: Option<NumberScale>[] = [
    { label: 'Unidades', value: NumberScale.UNITS },
    { label: 'Miles', value: NumberScale.THOUSANDS },
    { label: 'Millones', value: NumberScale.MILLIONS },
  ];

  public static standard(): NumberFormatDto {
    return {
      decimals: 2,
      thousands: true,
      negative: NegativeStyle.MINUS,
      scale: NumberScale.UNITS,
      prefix: '',
      suffix: '',
    };
  }

  public static format(value: Nullable<string>, f: NumberFormatDto): FormattedNumber {
    if (value === null) {
      return new FormattedNumber('—', false);
    }
    const parsed: Nullable<Decimal> = Decimal.of(value).match(
      (d: Decimal): Nullable<Decimal> => d,
      (): Nullable<Decimal> => null,
    );
    if (parsed === null) {
      return new FormattedNumber(value, false);
    }
    const divisor: Decimal = Decimal.fromInteger(
      f.scale === NumberScale.MILLIONS ? 1_000_000 : f.scale === NumberScale.THOUSANDS ? 1000 : 1,
    ).unwrap();
    const scaled: Decimal = parsed.divide(divisor).match(
      (d: Decimal): Decimal => d,
      (): Decimal => parsed,
    );
    const rounded: Decimal = scaled.round(f.decimals, RoundingMode.HALF_UP);
    const negative: boolean = rounded.isNegative();
    const parts: string[] = rounded.abs().toFixed(f.decimals).split('.');
    const integer: string = parts[0] ?? '';
    const fraction: Nullable<string> = parts[1] ?? null;
    const grouped: string = f.thousands ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : integer;
    const body: string = `${f.prefix}${grouped}${fraction === null ? '' : `.${fraction}`}${f.suffix}`;
    if (!negative) {
      return new FormattedNumber(body, false);
    }
    return new FormattedNumber(f.negative === NegativeStyle.PARENTHESES ? `(${body})` : `-${body}`, true);
  }
}
