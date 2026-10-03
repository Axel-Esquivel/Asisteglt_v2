import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataType, ItemFieldMapping, NumericNature, OrgLevel } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { FloatLabel } from 'primeng/floatlabel';
import { Select } from 'primeng/select';
import { CatalogFieldView, CatalogView } from '../../reports/data/catalog.model';
import { OrgTree, OrgUnitView } from '../../reports/data/org.model';
import { ProfileView } from '../../reports/data/profile.model';
import { ReportsApiClient } from '../../reports/data/reports.api-client';
import { InventoryApiClient } from '../data/inventory.api-client';
import { CountView } from '../data/inventory.model';

interface Option<T> {
  readonly label: string;
  readonly value: T;
}

/** Un campo del ítem y qué encabezados del catálogo admite (por tipo y naturaleza). */
class MappingRole {
  public constructor(
    public readonly key: keyof ItemFieldMapping,
    public readonly label: string,
    public readonly required: boolean,
    public readonly accepts: (field: CatalogFieldView) => boolean,
  ) {}
}

/**
 * Ítems desde datos ya cargados en el proyecto: período, filtros y el mapeo de cada campo a un
 * encabezado elegido por su nombre (la existencia debe ser una Cantidad; el costo, un Precio unitario).
 */
@Component({
  selector: 'app-items-from-data-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, DatePicker, FloatLabel, Select],
  templateUrl: './items-from-data.panel.html',
  styleUrl: '../inventory.scss',
})
export class ItemsFromDataPanel implements OnInit {
  public readonly projectId = input.required<string>();
  public readonly countId = input.required<string>();
  public readonly loaded = output<CountView>();

  protected readonly roles: MappingRole[] = [
    new MappingRole(
      'sku',
      'SKU',
      true,
      (f: CatalogFieldView): boolean => f.dataType === DataType.TEXT || f.dataType === DataType.INTEGER,
    ),
    new MappingRole(
      'description',
      'Descripción',
      true,
      (f: CatalogFieldView): boolean => f.dataType === DataType.TEXT,
    ),
    new MappingRole('unit', 'Unidad', false, (f: CatalogFieldView): boolean => f.dataType === DataType.TEXT),
    new MappingRole(
      'location',
      'Ubicación',
      true,
      (f: CatalogFieldView): boolean => f.dataType === DataType.TEXT,
    ),
    new MappingRole(
      'expected',
      'Existencia (Cantidad)',
      true,
      (f: CatalogFieldView): boolean => f.nature === NumericNature.QUANTITY,
    ),
    new MappingRole(
      'unitCost',
      'Costo unitario (Precio unitario)',
      false,
      (f: CatalogFieldView): boolean => f.nature === NumericNature.UNIT_PRICE,
    ),
    new MappingRole('x', 'Coordenada X', false, (f: CatalogFieldView): boolean => f.isNumeric()),
    new MappingRole('y', 'Coordenada Y', false, (f: CatalogFieldView): boolean => f.isNumeric()),
  ];
  protected readonly month: WritableSignal<Date> = signal<Date>(new Date());
  protected readonly profileId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly companyId: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);
  protected readonly mapping: WritableSignal<ReadonlyMap<keyof ItemFieldMapping, string>> = signal<
    ReadonlyMap<keyof ItemFieldMapping, string>
  >(new Map<keyof ItemFieldMapping, string>());
  protected readonly loading: WritableSignal<boolean> = signal<boolean>(false);

  private readonly catalog: WritableSignal<CatalogView> = signal<CatalogView>(CatalogView.empty());
  private readonly profiles: WritableSignal<ProfileView[]> = signal<ProfileView[]>([]);
  private readonly org: WritableSignal<OrgTree> = signal<OrgTree>(OrgTree.empty());
  private readonly reports: ReportsApiClient = inject(ReportsApiClient);
  private readonly inventory: InventoryApiClient = inject(InventoryApiClient);
  private readonly notifier: Notifier = inject(Notifier);

  protected readonly profileOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.profiles().map((p: ProfileView): Option<string> => ({ label: p.name, value: p.id })),
  );
  protected readonly companyOptions: Signal<Option<string>[]> = computed((): Option<string>[] =>
    this.org()
      .units.filter((u: OrgUnitView): boolean => u.s.level === OrgLevel.COMPANY)
      .map((u: OrgUnitView): Option<string> => ({ label: u.label(), value: u.id })),
  );
  protected readonly complete: Signal<boolean> = computed((): boolean =>
    this.roles.every((r: MappingRole): boolean => !r.required || this.mapping().has(r.key)),
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected optionsFor(role: MappingRole): Option<string>[] {
    return this.catalog()
      .active()
      .filter((f: CatalogFieldView): boolean => role.accepts(f))
      .map((f: CatalogFieldView): Option<string> => ({ label: f.label, value: f.key }));
  }

  protected valueOf(role: MappingRole): Nullable<string> {
    return this.mapping().get(role.key) ?? null;
  }

  protected setRole(role: MappingRole, key: Nullable<string>): void {
    this.mapping.update(
      (current: ReadonlyMap<keyof ItemFieldMapping, string>): ReadonlyMap<keyof ItemFieldMapping, string> => {
        const next: Map<keyof ItemFieldMapping, string> = new Map<keyof ItemFieldMapping, string>(current);
        if (key === null) {
          next.delete(role.key);
        } else {
          next.set(role.key, key);
        }
        return next;
      },
    );
  }

  protected async submit(): Promise<void> {
    const m: ReadonlyMap<keyof ItemFieldMapping, string> = this.mapping();
    const date: Date = this.month();
    this.loading.set(true);
    const result: Result<CountView> = await this.inventory.itemsFromData(this.projectId(), this.countId(), {
      profileId: this.profileId(),
      companyId: this.companyId(),
      period: `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      mapping: {
        sku: m.get('sku') ?? '',
        description: m.get('description') ?? '',
        unit: m.get('unit') ?? null,
        location: m.get('location') ?? '',
        expected: m.get('expected') ?? '',
        unitCost: m.get('unitCost') ?? null,
        x: m.get('x') ?? null,
        y: m.get('y') ?? null,
      },
    });
    this.loading.set(false);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success(`Se cargaron ${String(result.unwrap().s.items)} ítems desde los datos`);
    this.loaded.emit(result.unwrap());
  }

  private async load(): Promise<void> {
    const [catalog, profiles, org] = await Promise.all([
      this.reports.fieldCatalog(this.projectId()),
      this.reports.profileList(this.projectId()),
      this.reports.orgStructure(this.projectId()),
    ]);
    catalog.match(
      (c: CatalogView): void => this.catalog.set(c),
      (e): void => this.notifier.error(e),
    );
    profiles.match(
      (items: ProfileView[]): void => this.profiles.set(items),
      (): void => this.profiles.set([]),
    );
    org.match(
      (tree: OrgTree): void => this.org.set(tree),
      (): void => this.org.set(OrgTree.empty()),
    );
  }
}
