import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectPermission, ToleranceKind } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { Notifier } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FileSelectEvent, FileUpload } from 'primeng/fileupload';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../../projects/data/project-context';
import { InventoryApiClient } from '../data/inventory.api-client';
import { CountView } from '../data/inventory.model';

/** Tomas físicas del proyecto. */
@Component({
  selector: 'app-counts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FileUpload,
    FormsModule,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputNumber,
    InputText,
    SelectButton,
    TableModule,
    Tag,
  ],
  templateUrl: './counts.page.html',
  styleUrl: '../inventory.scss',
})
export class CountsPage implements OnInit {
  protected readonly counts: WritableSignal<CountView[]> = signal<CountView[]>([]);
  protected readonly creating: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly name: WritableSignal<string> = signal<string>('');
  protected readonly warehouse: WritableSignal<string> = signal<string>('');
  protected readonly toleranceKind: WritableSignal<ToleranceKind> = signal<ToleranceKind>(
    ToleranceKind.ABSOLUTE,
  );
  protected readonly toleranceValue: WritableSignal<number> = signal<number>(0);
  protected readonly maxRounds: WritableSignal<number> = signal<number>(3);
  protected readonly kindOptions: { label: string; value: ToleranceKind }[] = [
    { label: 'Unidades', value: ToleranceKind.ABSOLUTE },
    { label: 'Porcentaje', value: ToleranceKind.PERCENT },
  ];

  private readonly context: ProjectContext = inject(ProjectContext);
  private readonly api: InventoryApiClient = inject(InventoryApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly router: Router = inject(Router);

  protected readonly canConfigure: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.INVENTORY_CONFIGURE),
  );

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected open(count: CountView): void {
    this.router.navigate(['/app/projects', this.context.id(), 'inventory', count.id]).catch((): void => {
      // Navegación cancelada.
    });
  }

  /** Lee el paquete en el navegador y lo envía; la API lo valida completo. */
  protected async importPackage(event: FileSelectEvent, uploader: FileUpload): Promise<void> {
    const file: Nullable<File> = event.currentFiles[0] ?? null;
    uploader.clear();
    if (file === null) {
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      this.notifier.info('El archivo no es un paquete de toma válido');
      return;
    }
    const result: Result<CountView> = await this.api.importPackage(this.context.id(), parsed);
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.notifier.success('Paquete importado como toma cerrada');
    this.open(result.unwrap());
  }

  protected async create(): Promise<void> {
    const result: Result<CountView> = await this.api.create(this.context.id(), {
      name: this.name(),
      warehouse: this.warehouse(),
      toleranceKind: this.toleranceKind(),
      toleranceValue: String(this.toleranceValue()),
      maxRounds: this.maxRounds(),
    });
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    this.creating.set(false);
    this.open(result.unwrap());
  }

  private async load(): Promise<void> {
    const result: Result<CountView[]> = await this.api.list(this.context.id());
    result.match(
      (items: CountView[]): void => this.counts.set(items),
      (e): void => this.notifier.error(e),
    );
  }
}
