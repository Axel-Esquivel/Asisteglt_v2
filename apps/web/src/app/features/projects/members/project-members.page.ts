import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  WritableSignal,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ModuleType, ProjectPermission, ProjectRole } from '@asisteglt/shared-contracts';
import { DomainError, Nullable, Result } from '@asisteglt/shared-kernel';
import { AuthSession, CurrentUser, Notifier } from '@asisteglt/web-core';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProjectContext } from '../data/project-context';
import { ProjectLabels, RoleOption } from '../data/project-labels';
import { ProjectMemberView, ProjectSummary } from '../data/project.model';
import { ProjectsApiClient } from '../data/projects.api-client';

interface AddMemberControls {
  readonly email: FormControl<string>;
  readonly role: FormControl<ProjectRole>;
}

/** Miembros del proyecto: alta por correo, cambio de rol, baja y salida voluntaria. */
@Component({
  selector: 'app-project-members-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DatePipe,
    Button,
    Card,
    Dialog,
    FloatLabel,
    InputText,
    Select,
    TableModule,
    Tag,
  ],
  templateUrl: './project-members.page.html',
  styleUrl: './project-members.page.scss',
})
export class ProjectMembersPage implements OnInit {
  protected readonly context: ProjectContext = inject(ProjectContext);
  protected readonly members: WritableSignal<ProjectMemberView[]> = signal<ProjectMemberView[]>([]);
  protected readonly dialogOpen: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly saving: WritableSignal<boolean> = signal<boolean>(false);

  protected readonly canManage: Signal<boolean> = computed((): boolean =>
    this.context.can(ProjectPermission.MEMBERS_MANAGE),
  );
  protected readonly roleOptions: Signal<RoleOption[]> = computed((): RoleOption[] => {
    const project: Nullable<ProjectSummary> = this.context.project();
    return ProjectLabels.assignableRoles(project === null ? ModuleType.REPORTS : project.moduleType);
  });

  private readonly api: ProjectsApiClient = inject(ProjectsApiClient);
  private readonly notifier: Notifier = inject(Notifier);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly router: Router = inject(Router);
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  protected readonly form: FormGroup<AddMemberControls> = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: [ProjectRole.VIEWER, [Validators.required]],
  });

  public ngOnInit(): void {
    this.load().catch((): void => {
      // Informado en load.
    });
  }

  protected isMe(member: ProjectMemberView): boolean {
    const user: Nullable<CurrentUser> = this.session.currentUser();
    return user !== null && user.id === member.userId;
  }

  protected openDialog(): void {
    const project: Nullable<ProjectSummary> = this.context.project();
    this.form.reset({
      email: '',
      role: ProjectLabels.defaultInviteRole(project === null ? ModuleType.REPORTS : project.moduleType),
    });
    this.dialogOpen.set(true);
  }

  protected async add(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const result: Result<true> = await this.api.addMember(this.context.id(), this.form.getRawValue());
    this.saving.set(false);
    await this.afterChange(result, 'Miembro agregado', (): void => this.dialogOpen.set(false));
  }

  protected async changeRole(member: ProjectMemberView, role: ProjectRole): Promise<void> {
    const result: Result<true> = await this.api.changeRole(this.context.id(), member.userId, role);
    await this.afterChange(result, `Rol de ${member.displayName} actualizado`, (): void => {
      // Sin acciones adicionales.
    });
  }

  protected confirmRemove(member: ProjectMemberView): void {
    const self: boolean = this.isMe(member);
    this.confirmation.confirm({
      header: self ? 'Salir del proyecto' : 'Quitar miembro',
      message: self
        ? '¿Seguro que quieres salir de este proyecto? Necesitarás una nueva invitación para volver.'
        : `¿Quitar a ${member.displayName} del proyecto?`,
      acceptLabel: self ? 'Salir' : 'Quitar',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.remove(member, self).catch((): void => {
          // Informado en remove.
        });
      },
    });
  }

  private async remove(member: ProjectMemberView, self: boolean): Promise<void> {
    const result: Result<true> = await this.api.removeMember(this.context.id(), member.userId);
    if (self && result.isOk()) {
      this.notifier.success('Saliste del proyecto');
      await this.router.navigate(['/app/projects']);
      return;
    }
    await this.afterChange(result, 'Miembro quitado', (): void => {
      // Sin acciones adicionales.
    });
  }

  private async afterChange(result: Result<true>, success: string, onSuccess: () => void): Promise<void> {
    const error: Nullable<DomainError> = result.errorOrNull();
    if (error !== null) {
      this.notifier.error(error);
      return;
    }
    onSuccess();
    this.notifier.success(success);
    await Promise.all([this.load(), this.context.reload()]);
  }

  private async load(): Promise<void> {
    const result: Result<ProjectMemberView[]> = await this.api.memberList(this.context.id());
    result.match(
      (items: ProjectMemberView[]): void => this.members.set(items),
      (error): void => this.notifier.error(error),
    );
  }
}
