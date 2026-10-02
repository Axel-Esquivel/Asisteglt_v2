import {
  ChartType,
  ElementKind,
  ElementStyleDto,
  LayoutBoxDto,
  NumberFormatDto,
  PageFormatName,
  PageOrientation,
  TemplateElementDto,
  TemplateErrorCode,
  TemplatePageDto,
  TemplateRequest,
} from '@asisteglt/shared-contracts';
import {
  CompiledFormula,
  FieldResolver,
  FormulaCompiler,
  FormulaContext,
  ValueKind,
} from '@asisteglt/shared-formula-engine';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';

/** Tamaño de papel en milímetros (vertical). */
export class PageFormat {
  private constructor(
    public readonly name: PageFormatName,
    public readonly width: number,
    public readonly height: number,
  ) {}

  public static letter(): PageFormat {
    return new PageFormat(PageFormatName.LETTER, 215.9, 279.4);
  }

  public static legal(): PageFormat {
    return new PageFormat(PageFormatName.LEGAL, 215.9, 355.6);
  }

  public static oficio(): PageFormat {
    return new PageFormat(PageFormatName.OFICIO, 215.9, 330.2);
  }

  public static a4(): PageFormat {
    return new PageFormat(PageFormatName.A4, 210, 297);
  }

  public static custom(width: number, height: number): Result<PageFormat> {
    const ok = (v: number): boolean => Number.isFinite(v) && v >= 50 && v <= 1000;
    return ok(width) && ok(height)
      ? Result.ok(
          new PageFormat(PageFormatName.CUSTOM, Math.round(width * 10) / 10, Math.round(height * 10) / 10),
        )
      : Result.fail(ReportTemplate.invalid('Un tamaño personalizado debe medir entre 50 y 1000 mm por lado'));
  }

  public static of(name: PageFormatName, width: number, height: number): Result<PageFormat> {
    switch (name) {
      case PageFormatName.LETTER:
        return Result.ok(PageFormat.letter());
      case PageFormatName.LEGAL:
        return Result.ok(PageFormat.legal());
      case PageFormatName.OFICIO:
        return Result.ok(PageFormat.oficio());
      case PageFormatName.A4:
        return Result.ok(PageFormat.a4());
      case PageFormatName.CUSTOM:
        return PageFormat.custom(width, height);
    }
  }

  /** Ancho y alto efectivos según la orientación. */
  public oriented(orientation: PageOrientation): readonly [number, number] {
    return orientation === PageOrientation.PORTRAIT ? [this.width, this.height] : [this.height, this.width];
  }
}

/** Lo que un elemento necesita saber del proyecto para validarse. */
export class TemplateContext {
  public constructor(
    public readonly fields: FieldResolver,
    public readonly reportColumns: ReadonlyMap<string, number>,
  ) {}
}

export interface ReportElementVisitor<R> {
  visitText(element: TextElement): R;
  visitMatrix(element: MatrixElement): R;
  visitKpi(element: KpiElement): R;
  visitChart(element: ChartElement): R;
}

/** Elemento de una página: caja, estilo y formato numérico comunes; cada tipo valida lo suyo. */
export abstract class ReportElement {
  protected constructor(protected readonly dto: TemplateElementDto) {}

  public static from(dto: TemplateElementDto): ReportElement {
    switch (dto.kind) {
      case ElementKind.TEXT:
        return new TextElement(dto);
      case ElementKind.MATRIX:
        return new MatrixElement(dto);
      case ElementKind.KPI:
        return new KpiElement(dto);
      case ElementKind.CHART:
        return new ChartElement(dto);
    }
  }

  public get id(): string {
    return this.dto.id;
  }

  public get name(): string {
    return this.dto.name;
  }

  public abstract accept<R>(visitor: ReportElementVisitor<R>): R;

  /** Valida y devuelve la forma normalizada (fórmulas en forma canónica, campos ajenos en null). */
  public validate(
    context: TemplateContext,
    pageWidth: number,
    pageHeight: number,
  ): Result<TemplateElementDto> {
    const label: string = this.label();
    const box: LayoutBoxDto = this.dto.box;
    const finite: boolean = [box.x, box.y, box.width, box.height].every((v: number): boolean =>
      Number.isFinite(v),
    );
    if (!finite || box.width < 5 || box.height < 5 || box.x < 0 || box.y < 0) {
      return ReportElement.fail(`${label}: la caja debe medir al menos 5 × 5 mm`);
    }
    if (box.x + box.width > pageWidth + 0.5 || box.y + box.height > pageHeight + 0.5) {
      return ReportElement.fail(`${label}: queda fuera de la página`);
    }
    const style: ElementStyleDto = this.dto.style;
    if (!Number.isInteger(style.fontSize) || style.fontSize < 6 || style.fontSize > 72) {
      return ReportElement.fail(`${label}: el tamaño de letra debe estar entre 6 y 72`);
    }
    const format: NumberFormatDto = this.dto.numberFormat;
    if (!Number.isInteger(format.decimals) || format.decimals < 0 || format.decimals > 6) {
      return ReportElement.fail(`${label}: los decimales deben estar entre 0 y 6`);
    }
    if (format.prefix.length > 8 || format.suffix.length > 8) {
      return ReportElement.fail(`${label}: el prefijo y el sufijo admiten hasta 8 caracteres`);
    }
    const round = (v: number): number => Math.round(v * 10) / 10;
    const base: TemplateElementDto = {
      id: this.dto.id,
      kind: this.dto.kind,
      name: this.dto.name.trim(),
      box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      style,
      numberFormat: format,
      text: null,
      reportId: null,
      formula: null,
      profileId: null,
      companyId: null,
      chartType: null,
      columns: [],
    };
    return this.specific(base, context);
  }

  protected label(): string {
    return this.dto.name.trim() === '' ? `Elemento ${this.dto.id}` : `«${this.dto.name.trim()}»`;
  }

  protected abstract specific(base: TemplateElementDto, context: TemplateContext): Result<TemplateElementDto>;

  protected static fail(message: string): Result<TemplateElementDto> {
    return Result.fail(ReportTemplate.invalid(message));
  }
}

export class TextElement extends ReportElement {
  public constructor(dto: TemplateElementDto) {
    super(dto);
  }

  public get content(): string {
    return this.dto.text ?? '';
  }

  public override accept<R>(visitor: ReportElementVisitor<R>): R {
    return visitor.visitText(this);
  }

  protected override specific(base: TemplateElementDto): Result<TemplateElementDto> {
    const text: string = this.content;
    return text.length > 4000
      ? ReportElement.fail(`${this.label()}: el texto admite hasta 4000 caracteres`)
      : Result.ok({ ...base, text });
  }
}

export class MatrixElement extends ReportElement {
  public constructor(dto: TemplateElementDto) {
    super(dto);
  }

  public get reportId(): string {
    return this.dto.reportId ?? '';
  }

  public override accept<R>(visitor: ReportElementVisitor<R>): R {
    return visitor.visitMatrix(this);
  }

  protected override specific(
    base: TemplateElementDto,
    context: TemplateContext,
  ): Result<TemplateElementDto> {
    return this.dto.reportId === null || !context.reportColumns.has(this.dto.reportId)
      ? ReportElement.fail(`${this.label()}: elige el informe que muestra la tabla`)
      : Result.ok({ ...base, reportId: this.dto.reportId });
  }
}

export class KpiElement extends ReportElement {
  public constructor(dto: TemplateElementDto) {
    super(dto);
  }

  public get formula(): string {
    return this.dto.formula ?? '';
  }

  public get profileId(): Nullable<string> {
    return this.dto.profileId;
  }

  public get companyId(): Nullable<string> {
    return this.dto.companyId;
  }

  public override accept<R>(visitor: ReportElementVisitor<R>): R {
    return visitor.visitKpi(this);
  }

  protected override specific(
    base: TemplateElementDto,
    context: TemplateContext,
  ): Result<TemplateElementDto> {
    const compiled: Result<CompiledFormula> = new FormulaCompiler().compile(
      this.dto.formula ?? '',
      context.fields,
      FormulaContext.AGGREGATE,
    );
    const error = compiled.errorOrNull();
    if (error !== null) {
      return ReportElement.fail(`${this.label()}: ${error.message}`);
    }
    if (compiled.unwrap().resultType.kind !== ValueKind.NUMBER) {
      return ReportElement.fail(`${this.label()}: un indicador debe dar un número`);
    }
    return Result.ok({
      ...base,
      formula: compiled.unwrap().canonicalSource,
      profileId: this.dto.profileId,
      companyId: this.dto.companyId,
    });
  }
}

export class ChartElement extends ReportElement {
  public constructor(dto: TemplateElementDto) {
    super(dto);
  }

  public get reportId(): string {
    return this.dto.reportId ?? '';
  }

  public get chartType(): ChartType {
    return this.dto.chartType ?? ChartType.BAR;
  }

  public get columns(): ReadonlyArray<number> {
    return this.dto.columns;
  }

  public override accept<R>(visitor: ReportElementVisitor<R>): R {
    return visitor.visitChart(this);
  }

  protected override specific(
    base: TemplateElementDto,
    context: TemplateContext,
  ): Result<TemplateElementDto> {
    const available: Nullable<number> =
      this.dto.reportId === null ? null : (context.reportColumns.get(this.dto.reportId) ?? null);
    if (available === null) {
      return ReportElement.fail(`${this.label()}: elige el informe que se grafica`);
    }
    const columns: number[] = [...new Set(this.dto.columns)];
    if (
      columns.length === 0 ||
      columns.some((c: number): boolean => !Number.isInteger(c) || c < 0 || c >= available)
    ) {
      return ReportElement.fail(`${this.label()}: elige al menos una columna del informe para graficar`);
    }
    if (this.dto.chartType === ChartType.PIE && columns.length > 1) {
      return ReportElement.fail(`${this.label()}: un gráfico circular muestra una sola columna`);
    }
    return Result.ok({
      ...base,
      reportId: this.dto.reportId,
      chartType: this.dto.chartType ?? ChartType.BAR,
      columns,
    });
  }
}

export interface ReportTemplateSnapshot extends TemplateRequest {
  readonly id: string;
  readonly projectId: string;
  readonly version: number;
  readonly updatedAt: Date;
}

/** Plantilla de informe: páginas con formato y elementos posicionados (Composite + Visitor). */
export class ReportTemplate extends AggregateRoot {
  public static readonly MAX_PAGES: number = 50;
  public static readonly MAX_ELEMENTS: number = 100;

  private constructor(
    id: EntityId,
    private readonly projectId: EntityId,
    private spec: TemplateRequest,
    private version: number,
    private updatedAt: Date,
  ) {
    super(id);
  }

  public static create(
    projectId: EntityId,
    request: TemplateRequest,
    context: TemplateContext,
    clock: Clock,
  ): Result<ReportTemplate> {
    return ReportTemplate.validate(request, context).map(
      (valid: TemplateRequest): ReportTemplate =>
        new ReportTemplate(EntityId.generate(), projectId, valid, 1, clock.now()),
    );
  }

  public static restore(s: ReportTemplateSnapshot): ReportTemplate {
    const { id, projectId, version, updatedAt, ...spec } = s;
    return new ReportTemplate(
      EntityId.fromString(id).unwrap(),
      EntityId.fromString(projectId).unwrap(),
      spec,
      version,
      updatedAt,
    );
  }

  public update(request: TemplateRequest, context: TemplateContext, clock: Clock): Result<ReportTemplate> {
    return ReportTemplate.validate(request, context).map((valid: TemplateRequest): ReportTemplate => {
      this.spec = valid;
      this.version += 1;
      this.updatedAt = clock.now();
      return this;
    });
  }

  public getSpec(): TemplateRequest {
    return this.spec;
  }

  public belongsTo(projectId: EntityId): boolean {
    return this.projectId.equals(projectId);
  }

  /** Informes que usa la plantilla (para impedir eliminarlos). */
  public usesReport(reportId: string): boolean {
    return this.spec.pages.some((p: TemplatePageDto): boolean =>
      p.elements.some((e: TemplateElementDto): boolean => e.reportId === reportId),
    );
  }

  public toSnapshot(): ReportTemplateSnapshot {
    return {
      ...this.spec,
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      version: this.version,
      updatedAt: this.updatedAt,
    };
  }

  public static invalid(message: string): ValidationError {
    return new ValidationError(TemplateErrorCode.INVALID_TEMPLATE, message);
  }

  private static validate(request: TemplateRequest, context: TemplateContext): Result<TemplateRequest> {
    const name: string = request.name.trim();
    if (name.length < 2 || name.length > 80) {
      return Result.fail(ReportTemplate.invalid('El nombre debe tener entre 2 y 80 caracteres'));
    }
    if (request.pages.length === 0 || request.pages.length > ReportTemplate.MAX_PAGES) {
      return Result.fail(
        ReportTemplate.invalid(`Una plantilla tiene entre 1 y ${String(ReportTemplate.MAX_PAGES)} páginas`),
      );
    }
    const ids: Set<string> = new Set<string>();
    const pages: TemplatePageDto[] = [];
    for (const [index, page] of request.pages.entries()) {
      const valid: Result<TemplatePageDto> = ReportTemplate.page(page, index + 1, context, ids);
      if (!valid.isOk()) {
        return Result.fail(valid.errorOrNull() ?? ReportTemplate.invalid('Página inválida'));
      }
      pages.push(valid.unwrap());
    }
    return Result.ok({ name, pages });
  }

  private static page(
    page: TemplatePageDto,
    number: number,
    context: TemplateContext,
    ids: Set<string>,
  ): Result<TemplatePageDto> {
    const fail = (message: string): Result<TemplatePageDto> =>
      Result.fail(ReportTemplate.invalid(`Página ${String(number)}: ${message}`));
    const format: Result<PageFormat> = PageFormat.of(page.format, page.width, page.height);
    if (!format.isOk()) {
      return Result.fail(format.errorOrNull() ?? ReportTemplate.invalid('Formato inválido'));
    }
    if (!Number.isFinite(page.margin) || page.margin < 0 || page.margin > 50) {
      return fail('el margen debe estar entre 0 y 50 mm');
    }
    if (page.header.length > 300 || page.footer.length > 300) {
      return fail('el encabezado y el pie admiten hasta 300 caracteres');
    }
    if (page.elements.length > ReportTemplate.MAX_ELEMENTS) {
      return fail(`admite hasta ${String(ReportTemplate.MAX_ELEMENTS)} elementos`);
    }
    if (ids.has(page.id) || page.id.trim() === '') {
      return fail('identificador repetido');
    }
    ids.add(page.id);
    const [width, height] = format.unwrap().oriented(page.orientation);
    const elements: TemplateElementDto[] = [];
    for (const dto of page.elements) {
      if (ids.has(dto.id) || dto.id.trim() === '') {
        return fail('hay elementos con el mismo identificador');
      }
      ids.add(dto.id);
      const valid: Result<TemplateElementDto> = ReportElement.from(dto).validate(context, width, height);
      const error = valid.errorOrNull();
      if (error !== null) {
        return fail(error.message);
      }
      elements.push(valid.unwrap());
    }
    return Result.ok({
      id: page.id,
      name: page.name.trim() === '' ? `Página ${String(number)}` : page.name.trim(),
      format: format.unwrap().name,
      width: format.unwrap().width,
      height: format.unwrap().height,
      orientation: page.orientation,
      margin: page.margin,
      header: page.header,
      footer: page.footer,
      elements,
    });
  }
}
