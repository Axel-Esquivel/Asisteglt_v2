import { ChangeDetectionStrategy, Component, Signal, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  OrgLevel,
  PivotDimensionDto,
  PivotDto,
  PivotSource,
  PivotValueDto,
  PivotValueKind,
} from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { Button } from 'primeng/button';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { ClassificationView } from '../../data/analysis.model';
import { CatalogFieldView, CatalogView } from '../../data/catalog.model';
import { Option } from '../../data/reports-labels';

/** Dónde va una dimensión: en las filas o en las columnas. */
type Axis = 'rows' | 'columns';

/**
 * Configura una tabla dinámica: dimensiones de filas y columnas (encabezados, clasificaciones,
 * niveles de la estructura, moneda o mes) y los valores que se agregan en cada cruce, incluidas
 * diferencias (A − B) y cocientes (A ÷ B %), p. ej. la variación de un mes a otro.
 */
@Component({
  selector: 'app-pivot-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, FloatLabel, InputNumber, InputText, Select, ToggleSwitch],
  templateUrl: './pivot.editor.html',
  styleUrls: ['../../reports.scss', './editor.scss'],
})
export class PivotEditor {
  public static readonly MAX_ROWS: number = 3;
  public static readonly MAX_COLUMNS: number = 3;
  public static readonly MAX_VALUES: number = 6;
  private static readonly ORG_LABELS: ReadonlyArray<Option<OrgLevel>> = [
    { label: 'Organización', value: OrgLevel.ORGANIZATION },
    { label: 'País', value: OrgLevel.COUNTRY },
    { label: 'Compañía', value: OrgLevel.COMPANY },
    { label: 'Empresa', value: OrgLevel.ENTERPRISE },
    { label: 'Sucursal', value: OrgLevel.BRANCH },
  ];

  public readonly pivot = input.required<PivotDto>();
  public readonly catalog = input.required<CatalogView>();
  public readonly classifications = input.required<ClassificationView[]>();
  public readonly prefix = input.required<string>();
  /** Emite el cambio (no el resultado) para aplicarlo sobre el estado vigente del diseñador. */
  public readonly changed = output<(pivot: PivotDto) => PivotDto>();

  protected readonly classification: PivotSource = PivotSource.CLASSIFICATION;
  protected readonly fieldKind: PivotValueKind = PivotValueKind.FIELD;
  protected readonly maxRows: number = PivotEditor.MAX_ROWS;
  protected readonly maxColumns: number = PivotEditor.MAX_COLUMNS;
  protected readonly maxValues: number = PivotEditor.MAX_VALUES;
  protected readonly kinds: Option<PivotValueKind>[] = [
    { label: 'Encabezado', value: PivotValueKind.FIELD },
    { label: 'Diferencia (A − B)', value: PivotValueKind.DIFFERENCE },
    { label: 'Cociente % (A ÷ B × 100)', value: PivotValueKind.RATIO },
  ];
  protected readonly offsets: Option<number>[] = [
    { label: 'Período del informe', value: 0 },
    { label: 'Período anterior', value: -1 },
  ];

  /** Dimensiones posibles, codificadas como «origen|clave». */
  protected readonly dimensionOptions: Signal<Option<string>[]> = computed((): Option<string>[] => [
    ...this.classifications().map(
      (c: ClassificationView): Option<string> => ({
        label: `Clasificación: ${c.name}`,
        value: PivotEditor.code(PivotSource.CLASSIFICATION, c.id),
      }),
    ),
    ...this.catalog()
      .fields.filter((f: CatalogFieldView): boolean => f.active && f.isGroupable())
      .map(
        (f: CatalogFieldView): Option<string> => ({
          label: `Encabezado: ${f.label}`,
          value: PivotEditor.code(PivotSource.FIELD, f.key),
        }),
      ),
    ...PivotEditor.ORG_LABELS.map(
      (o: Option<OrgLevel>): Option<string> => ({
        label: o.label,
        value: PivotEditor.code(PivotSource.ORG, o.value),
      }),
    ),
    { label: 'Moneda', value: PivotEditor.code(PivotSource.CURRENCY, '') },
    { label: 'Mes', value: PivotEditor.code(PivotSource.MONTH, '') },
  ]);
  protected readonly fieldOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.catalog()
      .fields.filter((f: CatalogFieldView): boolean => f.active && f.isAggregatable())
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key })),
  );

  protected id(name: string): string {
    return `${this.prefix()}${name}`;
  }

  protected dimensionCode(dimension: PivotDimensionDto): string {
    return PivotEditor.code(dimension.source, dimension.key);
  }

  protected addDimension(axis: Axis): void {
    const first: Nullable<Option<string>> = this.dimensionOptions()[0] ?? null;
    if (first === null) {
      return;
    }
    const dimension: PivotDimensionDto = { ...PivotEditor.decode(first.value), level: 0 };
    this.emit((p: PivotDto): PivotDto =>
      axis === 'rows' ? { ...p, rows: [...p.rows, dimension] } : { ...p, columns: [...p.columns, dimension] },
    );
  }

  protected removeDimension(axis: Axis, index: number): void {
    const keep = (_d: PivotDimensionDto, i: number): boolean => i !== index;
    this.emit((p: PivotDto): PivotDto =>
      axis === 'rows' ? { ...p, rows: p.rows.filter(keep) } : { ...p, columns: p.columns.filter(keep) },
    );
  }

  protected setDimension(axis: Axis, index: number, code: Nullable<string>): void {
    if (code === null) {
      return;
    }
    this.changeDimension(axis, index, (): PivotDimensionDto => ({ ...PivotEditor.decode(code), level: 0 }));
  }

  protected setLevel(axis: Axis, index: number, level: Nullable<number>): void {
    this.changeDimension(axis, index, (d: PivotDimensionDto): PivotDimensionDto => ({ ...d, level: level ?? 0 }));
  }

  protected addValue(): void {
    const first: Nullable<Option<string>> = this.fieldOptions()[0] ?? null;
    this.emit((p: PivotDto): PivotDto => ({
      ...p,
      values: [
        ...p.values,
        {
          kind: PivotValueKind.FIELD,
          fieldKey: first === null ? null : first.value,
          label: '',
          periodOffset: 0,
          left: 0,
          right: 0,
        },
      ],
    }));
  }

  protected removeValue(index: number): void {
    // Las diferencias que usaban valores posteriores se reajustan al primero.
    this.emit((p: PivotDto): PivotDto => ({
      ...p,
      values: p.values
        .filter((_v: PivotValueDto, i: number): boolean => i !== index)
        .map((v: PivotValueDto): PivotValueDto => ({
          ...v,
          left: v.left === index ? 0 : v.left > index ? v.left - 1 : v.left,
          right: v.right === index ? 0 : v.right > index ? v.right - 1 : v.right,
        })),
    }));
  }

  protected setKind(index: number, kind: PivotValueKind): void {
    const first: Nullable<Option<string>> = this.fieldOptions()[0] ?? null;
    this.changeValue(index, (v: PivotValueDto): PivotValueDto =>
      kind === PivotValueKind.FIELD
        ? { ...v, kind, fieldKey: v.fieldKey ?? (first === null ? null : first.value), left: 0, right: 0 }
        : { ...v, kind, fieldKey: null, periodOffset: 0, left: 0, right: Math.max(0, index - 1) },
    );
  }

  protected setField(index: number, fieldKey: Nullable<string>): void {
    this.changeValue(index, (v: PivotValueDto): PivotValueDto => ({ ...v, fieldKey }));
  }

  protected setOffset(index: number, periodOffset: number): void {
    this.changeValue(index, (v: PivotValueDto): PivotValueDto => ({ ...v, periodOffset }));
  }

  protected setOperand(index: number, side: 'left' | 'right', position: number): void {
    this.changeValue(index, (v: PivotValueDto): PivotValueDto =>
      side === 'left' ? { ...v, left: position } : { ...v, right: position },
    );
  }

  protected setLabel(index: number, label: string): void {
    this.changeValue(index, (v: PivotValueDto): PivotValueDto => ({ ...v, label }));
  }

  /** Valores anteriores que puede usar una diferencia o un cociente. */
  protected earlier(index: number): Option<number>[] {
    return this.pivot()
      .values.slice(0, index)
      .map((v: PivotValueDto, i: number): Option<number> => ({
        label: `${String(i + 1)}. ${this.valueName(v)}`,
        value: i,
      }));
  }

  protected setSubtotals(value: boolean): void {
    this.emit((p: PivotDto): PivotDto => ({ ...p, subtotals: value }));
  }

  protected setRowTitle(value: string): void {
    this.emit((p: PivotDto): PivotDto => ({ ...p, rowTitle: value }));
  }

  protected setTotalLabel(value: string): void {
    this.emit((p: PivotDto): PivotDto => ({ ...p, totalLabel: value }));
  }

  private valueName(value: PivotValueDto): string {
    if (value.label !== '') {
      return value.label;
    }
    if (value.kind !== PivotValueKind.FIELD) {
      return value.kind === PivotValueKind.DIFFERENCE ? 'Diferencia' : 'Cociente %';
    }
    const name: string = value.fieldKey === null ? '?' : this.catalog().labelOf(value.fieldKey);
    return value.periodOffset === 0 ? name : `${name} (período anterior)`;
  }

  private changeDimension(
    axis: Axis,
    index: number,
    change: (d: PivotDimensionDto) => PivotDimensionDto,
  ): void {
    const apply = (d: PivotDimensionDto, i: number): PivotDimensionDto => (i === index ? change(d) : d);
    this.emit((p: PivotDto): PivotDto =>
      axis === 'rows' ? { ...p, rows: p.rows.map(apply) } : { ...p, columns: p.columns.map(apply) },
    );
  }

  private changeValue(index: number, change: (v: PivotValueDto) => PivotValueDto): void {
    this.emit((p: PivotDto): PivotDto => ({
      ...p,
      values: p.values.map((v: PivotValueDto, i: number): PivotValueDto => (i === index ? change(v) : v)),
    }));
  }

  private emit(change: (p: PivotDto) => PivotDto): void {
    this.changed.emit(change);
  }

  private static code(source: PivotSource, key: string): string {
    return `${source}|${key}`;
  }

  private static decode(code: string): { readonly source: PivotSource; readonly key: string } {
    const [source, ...rest] = code.split('|');
    return {
      source: Object.values(PivotSource).find((s: PivotSource): boolean => s === source) ?? PivotSource.FIELD,
      key: rest.join('|'),
    };
  }
}
