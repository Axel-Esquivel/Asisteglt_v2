import {
  ChartType,
  ClassificationNodeDto,
  ElementKind,
  ElementStyleDto,
  LayoutBoxDto,
  NumberFormatDto,
  OrgLevel,
  PageFormatName,
  PageOrientation,
  PeriodGrouping,
  PeriodValue,
  PivotDimensionDto,
  PivotDto,
  PivotSource,
  PivotValueDto,
  PivotValueKind,
  TemplateElementDto,
  TemplateErrorCode,
  TemplatePageDto,
  TemplateRequest,
  ValueFilterDto,
} from '@asisteglt/shared-contracts';
import {
  CompiledFormula,
  FieldResolver,
  FormulaCompiler,
  FormulaContext,
  ValueKind,
} from '@asisteglt/shared-formula-engine';
import { AggregateRoot, Clock, EntityId, Nullable, Result, ValidationError } from '@asisteglt/shared-kernel';
import { Classification } from './classification';
import { CatalogField, FieldCatalog } from './field-catalog';
import { PresentationConverter } from './presentation-currency';
import { RecordFilter } from './record-filter';
import { SupplementaryCollection } from './supplementary-collection';

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
    public readonly catalog: FieldCatalog,
    public readonly classifications: ReadonlyMap<string, Classification>,
    public readonly collections: ReadonlyArray<SupplementaryCollection>,
  ) {}
}

/** Valida los filtros de un valor filtrado o una tabla dinámica. */
export class ElementFilter {
  public static validate(
    dto: ValueFilterDto,
    context: TemplateContext,
    label: string,
  ): Result<ValueFilterDto> {
    const fail = (message: string): Result<ValueFilterDto> =>
      Result.fail(ReportTemplate.invalid(`${label}: ${message}`));
    let nodeIds: string[] = [];
    if (dto.classificationId !== null) {
      const classification: Nullable<Classification> = context.classifications.get(dto.classificationId) ?? null;
      if (classification === null) {
        return fail('la clasificación del filtro no existe');
      }
      const known: Set<string> = new Set<string>(classification.getNodes().map((n: ClassificationNodeDto): string => n.id));
      nodeIds = [...new Set(dto.nodeIds)];
      if (nodeIds.some((id: string): boolean => !known.has(id))) {
        return fail('hay nodos del filtro que ya no están en la clasificación');
      }
    }
    if (!Object.values(PeriodGrouping).includes(dto.periodGrouping)) {
      return fail('la agrupación del período no es válida');
    }
    if (!Object.values(PeriodValue).includes(dto.periodValue)) {
      return fail('la forma de tomar el período no es válida');
    }
    if (dto.periodOffset !== 0 && dto.periodOffset !== -1) {
      return fail('el período debe ser el del informe o el anterior');
    }
    if (dto.presentation !== null) {
      const problem: Nullable<string> = PresentationConverter.problem(dto.presentation, context.collections);
      if (problem !== null) {
        return fail(problem);
      }
    }
    return Result.ok({
      classificationId: dto.classificationId,
      nodeIds: dto.classificationId === null ? [] : nodeIds,
      scope: dto.scope,
      periodGrouping: dto.periodGrouping,
      periodValue: dto.periodValue,
      periodOffset: dto.periodOffset,
      presentation: dto.presentation,
    });
  }
}

export interface ReportElementVisitor<R> {
  visitText(element: TextElement): R;
  visitMatrix(element: MatrixElement): R;
  visitKpi(element: KpiElement): R;
  visitChart(element: ChartElement): R;
  visitPivot(element: PivotElement): R;
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
      case ElementKind.PIVOT:
        return new PivotElement(dto);
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
      filter: null,
      pivot: null,
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

  /** Rótulo del valor (p. ej. «Activo corriente: {valor}»); `null` = solo el número. */
  public get caption(): Nullable<string> {
    return this.dto.text;
  }

  /**
   * Filtros del valor. Los indicadores anteriores a los filtros no los tienen: toman el mes del
   * informe y, si la tenían, su compañía.
   */
  public get filter(): ValueFilterDto {
    if (this.dto.filter !== null) {
      return this.dto.filter;
    }
    const company: Nullable<string> = this.dto.companyId;
    return RecordFilter.plain({
      organizationIds: [],
      countryIds: [],
      currencies: [],
      companyIds: company === null ? [] : [company],
      enterpriseIds: [],
      branchIds: [],
    });
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
    const text: string = this.dto.text ?? '';
    if (text.length > 300) {
      return ReportElement.fail(`${this.label()}: el rótulo admite hasta 300 caracteres`);
    }
    const filter: Result<Nullable<ValueFilterDto>> =
      this.dto.filter === null
        ? Result.ok(null)
        : ElementFilter.validate(this.dto.filter, context, this.label());
    const problem = filter.errorOrNull();
    if (problem !== null) {
      return Result.fail(problem);
    }
    return Result.ok({
      ...base,
      formula: compiled.unwrap().canonicalSource,
      profileId: this.dto.profileId,
      // Con filtros, la compañía va en el alcance del filtro.
      companyId: this.dto.filter === null ? this.dto.companyId : null,
      text: text.trim() === '' ? null : text,
      filter: filter.unwrap(),
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

/** Tabla dinámica: filas, columnas y valores elegidos al diseñarla, sobre los registros filtrados. */
export class PivotElement extends ReportElement {
  public static readonly MAX_ROWS: number = 3;
  public static readonly MAX_COLUMNS: number = 3;
  public static readonly MAX_VALUES: number = 6;

  public constructor(dto: TemplateElementDto) {
    super(dto);
  }

  public get profileId(): Nullable<string> {
    return this.dto.profileId;
  }

  public get pivot(): PivotDto {
    return (
      this.dto.pivot ?? { rows: [], columns: [], values: [], subtotals: true, rowTitle: '', totalLabel: '' }
    );
  }

  public get filter(): ValueFilterDto {
    return this.dto.filter ?? RecordFilter.plain(RecordFilter.everything());
  }

  public override accept<R>(visitor: ReportElementVisitor<R>): R {
    return visitor.visitPivot(this);
  }

  protected override specific(
    base: TemplateElementDto,
    context: TemplateContext,
  ): Result<TemplateElementDto> {
    const pivot: Nullable<PivotDto> = this.dto.pivot;
    if (pivot === null || pivot.rows.length === 0) {
      return ReportElement.fail(`${this.label()}: elige al menos una dimensión para las filas`);
    }
    if (pivot.rows.length > PivotElement.MAX_ROWS || pivot.columns.length > PivotElement.MAX_COLUMNS) {
      return ReportElement.fail(
        `${this.label()}: admite hasta ${String(PivotElement.MAX_ROWS)} dimensiones en filas y ${String(PivotElement.MAX_COLUMNS)} en columnas`,
      );
    }
    if (pivot.values.length === 0 || pivot.values.length > PivotElement.MAX_VALUES) {
      return ReportElement.fail(
        `${this.label()}: elige entre 1 y ${String(PivotElement.MAX_VALUES)} valores para sumar`,
      );
    }
    const seen: Set<string> = new Set<string>();
    const dimensions: PivotDimensionDto[] = [];
    for (const dimension of [...pivot.rows, ...pivot.columns]) {
      const normalized: Result<PivotDimensionDto> = this.dimension(dimension, context);
      const error = normalized.errorOrNull();
      if (error !== null) {
        return Result.fail(error);
      }
      const valid: PivotDimensionDto = normalized.unwrap();
      const key: string = `${valid.source}|${valid.key}|${String(valid.level)}`;
      if (seen.has(key)) {
        return ReportElement.fail(`${this.label()}: una dimensión no puede repetirse`);
      }
      seen.add(key);
      dimensions.push(valid);
    }
    const values: PivotValueDto[] = [];
    for (const [index, value] of pivot.values.entries()) {
      if (value.label.length > 80) {
        return ReportElement.fail(`${this.label()}: los títulos de los valores admiten hasta 80 caracteres`);
      }
      if (value.kind === PivotValueKind.FIELD) {
        const field: Nullable<CatalogField> =
          value.fieldKey === null ? null : context.catalog.find(value.fieldKey).toNullable();
        if (field === null || !field.isActive() || !field.isAggregatable()) {
          return ReportElement.fail(`${this.label()}: los valores deben ser encabezados numéricos activos`);
        }
        if (value.periodOffset !== 0 && value.periodOffset !== -1) {
          return ReportElement.fail(`${this.label()}: un valor es del período del informe o del anterior`);
        }
        values.push({ ...value, fieldKey: field.key, label: value.label.trim(), left: 0, right: 0 });
        continue;
      }
      const earlier = (position: number): boolean =>
        Number.isInteger(position) && position >= 0 && position < index;
      if (!earlier(value.left) || !earlier(value.right)) {
        return ReportElement.fail(
          `${this.label()}: una diferencia o un cociente usa dos valores que estén antes en la lista`,
        );
      }
      values.push({ ...value, fieldKey: null, label: value.label.trim(), periodOffset: 0 });
    }
    if (pivot.rowTitle.length > 80 || pivot.totalLabel.length > 80) {
      return ReportElement.fail(`${this.label()}: los títulos admiten hasta 80 caracteres`);
    }
    const filter: Result<ValueFilterDto> = ElementFilter.validate(
      this.dto.filter ?? RecordFilter.plain(RecordFilter.everything()),
      context,
      this.label(),
    );
    const problem = filter.errorOrNull();
    if (problem !== null) {
      return Result.fail(problem);
    }
    return Result.ok({
      ...base,
      profileId: this.dto.profileId,
      filter: filter.unwrap(),
      pivot: {
        rows: dimensions.slice(0, pivot.rows.length),
        columns: dimensions.slice(pivot.rows.length),
        values,
        subtotals: pivot.subtotals,
        rowTitle: pivot.rowTitle.trim(),
        totalLabel: pivot.totalLabel.trim(),
      },
    });
  }

  private dimension(dto: PivotDimensionDto, context: TemplateContext): Result<PivotDimensionDto> {
    const fail = (message: string): Result<PivotDimensionDto> =>
      Result.fail(ReportTemplate.invalid(`${this.label()}: ${message}`));
    switch (dto.source) {
      case PivotSource.FIELD: {
        const field: Nullable<CatalogField> = context.catalog.find(dto.key).toNullable();
        return field === null || !field.isActive() || !field.isGroupable()
          ? fail('las filas y columnas por encabezado deben usar un encabezado agrupable activo')
          : Result.ok({ source: dto.source, key: dto.key, level: 0 });
      }
      case PivotSource.CLASSIFICATION:
        return !context.classifications.has(dto.key)
          ? fail('la clasificación elegida no existe')
          : !Number.isInteger(dto.level) || dto.level < 0 || dto.level > 10
            ? fail('el nivel de la clasificación debe estar entre 0 y 10')
            : Result.ok({ source: dto.source, key: dto.key, level: dto.level });
      case PivotSource.ORG:
        return Object.values(OrgLevel).some((l: OrgLevel): boolean => l === dto.key)
          ? Result.ok({ source: dto.source, key: dto.key, level: 0 })
          : fail('el nivel de la estructura no es válido');
      case PivotSource.CURRENCY:
      case PivotSource.MONTH:
        return Result.ok({ source: dto.source, key: '', level: 0 });
    }
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

  /** Clasificaciones que usan los filtros y las tablas dinámicas (para impedir eliminarlas). */
  public usesClassification(classificationId: string): boolean {
    return this.spec.pages.some((p: TemplatePageDto): boolean =>
      p.elements.some(
        (e: TemplateElementDto): boolean =>
          (e.filter !== null && e.filter.classificationId === classificationId) ||
          (e.pivot !== null &&
            [...e.pivot.rows, ...e.pivot.columns].some(
              (d: PivotDimensionDto): boolean =>
                d.source === PivotSource.CLASSIFICATION && d.key === classificationId,
            )),
      ),
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
    return Result.ok({ name, pages, scopeParameter: request.scopeParameter });
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
