import { ChangeDetectionStrategy, Component, Signal, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ClassificationNodeDto,
  CollectionFieldDto,
  OrgLevel,
  PeriodGrouping,
  PeriodValue,
  PresentationCurrencyDto,
  RateQuote,
  ValueFilterDto,
} from '@asisteglt/shared-contracts';
import { Nullable } from '@asisteglt/shared-kernel';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { ClassificationView } from '../../data/analysis.model';
import { CollectionView } from '../../data/collections.model';
import { OperationsView } from '../../data/operations.model';
import { OrgTree } from '../../data/org.model';
import { ReportScope } from '../../data/report-scope.model';
import { Option, ReportsLabels } from '../../data/reports-labels';

/** Nivel del alcance que se edita (la moneda va aparte de la estructura). */
type ScopeLevel = OrgLevel | 'CURRENCY';

/**
 * Filtros de un valor filtrado o una tabla dinámica: nodos de una clasificación, alcance
 * (organización, país, moneda, compañía, empresa, sucursal), período y moneda de presentación.
 */
@Component({
  selector: 'app-value-filter-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FloatLabel, InputText, Message, MultiSelect, Select, ToggleSwitch],
  templateUrl: './value-filter.editor.html',
  styleUrls: ['../../reports.scss', './editor.scss'],
})
export class ValueFilterEditor {
  public readonly filter = input.required<ValueFilterDto>();
  public readonly classifications = input.required<ClassificationView[]>();
  public readonly org = input.required<OrgTree>();
  public readonly collections = input.required<CollectionView[]>();
  /** Prefijo de los identificadores (para que no se repitan en la página). */
  public readonly prefix = input.required<string>();
  /** El valor filtrado elige el período (del informe o anterior); la tabla dinámica, en cada valor. */
  public readonly withOffset = input.required<boolean>();
  /** Emite el cambio (no el resultado) para aplicarlo sobre el estado vigente del diseñador. */
  public readonly changed = output<(filter: ValueFilterDto) => ValueFilterDto>();

  protected readonly levels: typeof OrgLevel = OrgLevel;
  protected readonly groupings: Option<PeriodGrouping>[] = ReportsLabels.PERIOD_GROUPINGS;
  protected readonly periodValues: Option<PeriodValue>[] = ReportsLabels.PERIOD_VALUES;
  protected readonly offsets: Option<number>[] = [
    { label: 'Período del informe', value: 0 },
    { label: 'Período anterior', value: -1 },
  ];
  protected readonly quotes: Option<RateQuote>[] = OperationsView.QUOTES;
  protected readonly scopeLevels: ReadonlyArray<{ readonly level: ScopeLevel; readonly label: string }> = [
    { level: OrgLevel.ORGANIZATION, label: 'Organizaciones (todas)' },
    { level: OrgLevel.COUNTRY, label: 'Países (todos)' },
    { level: 'CURRENCY', label: 'Monedas (todas)' },
    { level: OrgLevel.COMPANY, label: 'Compañías (todas)' },
    { level: OrgLevel.ENTERPRISE, label: 'Empresas (todas)' },
    { level: OrgLevel.BRANCH, label: 'Sucursales (todas)' },
  ];

  protected readonly scope: Signal<ReportScope> = computed(
    (): ReportScope => ReportScope.of(this.filter().scope),
  );
  protected readonly classificationOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.classifications().map((c: ClassificationView): Option<string> => ({ label: c.name, value: c.id })),
  );
  /** Nodos en orden de árbol, sangrados por nivel. */
  protected readonly nodeOptions: Signal<Option<string>[]> = computed((): Option<string>[] => {
    const id: Nullable<string> = this.filter().classificationId;
    const classification: Nullable<ClassificationView> =
      this.classifications().find((c: ClassificationView): boolean => c.id === id) ?? null;
    if (classification === null) {
      return [];
    }
    const options: Option<string>[] = [];
    const visit = (parentId: Nullable<string>, depth: number): void => {
      for (const node of classification.nodes.filter(
        (n: ClassificationNodeDto): boolean => n.parentId === parentId,
      )) {
        const name: string = node.code === '' ? node.name : `${node.code} ${node.name}`;
        options.push({ label: `${'· '.repeat(depth)}${name}`, value: node.id });
        visit(node.id, depth + 1);
      }
    };
    visit(null, 0);
    return options;
  });
  protected readonly collectionOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.collections().map((c: CollectionView): Option<string> => ({ label: c.name, value: c.id })),
  );

  protected id(name: string): string {
    return `${this.prefix()}${name}`;
  }

  protected scopeOptions(level: ScopeLevel): Option<string>[] {
    return level === 'CURRENCY'
      ? this.scope().currencyOptions(this.org())
      : this.scope().options(this.org(), level);
  }

  protected scopeValue(level: ScopeLevel): string[] {
    const s: ReportScope = this.scope();
    switch (level) {
      case OrgLevel.ORGANIZATION:
        return s.organizationIds;
      case OrgLevel.COUNTRY:
        return s.countryIds;
      case 'CURRENCY':
        return s.currencies;
      case OrgLevel.COMPANY:
        return s.companyIds;
      case OrgLevel.ENTERPRISE:
        return s.enterpriseIds;
      case OrgLevel.BRANCH:
        return s.branchIds;
    }
  }

  protected setScope(level: ScopeLevel, ids: Nullable<string[]>): void {
    this.emit(
      (f: ValueFilterDto): ValueFilterDto => ({
        ...f,
        scope: ReportScope.of(f.scope)
          .with(level, ids ?? [])
          .dto(),
      }),
    );
  }

  protected setClassification(id: Nullable<string>): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({ ...f, classificationId: id, nodeIds: [] }));
  }

  protected setNodes(ids: Nullable<string[]>): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({ ...f, nodeIds: ids ?? [] }));
  }

  protected setGrouping(value: PeriodGrouping): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({ ...f, periodGrouping: value }));
  }

  protected setPeriodValue(value: PeriodValue): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({ ...f, periodValue: value }));
  }

  protected setOffset(value: number): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({ ...f, periodOffset: value }));
  }

  protected setConvert(on: boolean): void {
    this.emit((f: ValueFilterDto): ValueFilterDto => ({
      ...f,
      presentation: on
        ? {
            targetCurrency: '',
            collectionId: '',
            rateFieldKey: '',
            currencyFieldKey: '',
            quote: RateQuote.UNITS_PER_TARGET,
          }
        : null,
    }));
  }

  protected setPresentation(change: (p: PresentationCurrencyDto) => PresentationCurrencyDto): void {
    this.emit((f: ValueFilterDto): ValueFilterDto =>
      f.presentation === null ? f : { ...f, presentation: change(f.presentation) },
    );
  }

  protected setTarget(value: string): void {
    this.setPresentation((p: PresentationCurrencyDto): PresentationCurrencyDto => ({
      ...p,
      targetCurrency: value.trim().toUpperCase(),
    }));
  }

  protected setCollection(value: Nullable<string>): void {
    this.setPresentation((p: PresentationCurrencyDto): PresentationCurrencyDto => ({
      ...p,
      collectionId: value ?? '',
      rateFieldKey: '',
      currencyFieldKey: '',
    }));
  }

  protected setRateField(value: Nullable<string>): void {
    this.setPresentation((p: PresentationCurrencyDto): PresentationCurrencyDto => ({
      ...p,
      rateFieldKey: value ?? '',
    }));
  }

  protected setCurrencyField(value: Nullable<string>): void {
    this.setPresentation((p: PresentationCurrencyDto): PresentationCurrencyDto => ({
      ...p,
      currencyFieldKey: value ?? '',
    }));
  }

  protected setQuote(value: RateQuote): void {
    this.setPresentation((p: PresentationCurrencyDto): PresentationCurrencyDto => ({ ...p, quote: value }));
  }

  protected rateFieldOptions(collectionId: string): Option<string>[] {
    const collection: Nullable<CollectionView> = this.collection(collectionId);
    return collection === null
      ? []
      : collection
          .rateFields()
          .map((f: CollectionFieldDto): Option<string> => ({ label: f.label, value: f.key }));
  }

  protected currencyFieldOptions(collectionId: string): Option<string>[] {
    const collection: Nullable<CollectionView> = this.collection(collectionId);
    return collection === null
      ? []
      : collection
          .textFields()
          .map((f: CollectionFieldDto): Option<string> => ({ label: f.label, value: f.key }));
  }

  private collection(id: string): Nullable<CollectionView> {
    return this.collections().find((c: CollectionView): boolean => c.id === id) ?? null;
  }

  private emit(change: (f: ValueFilterDto) => ValueFilterDto): void {
    this.changed.emit(change);
  }
}
