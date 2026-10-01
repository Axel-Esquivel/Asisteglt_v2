import { ChangeDetectionStrategy, Component, OnInit, WritableSignal, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { ActiveSession, AuthApiClient, AuthSession, CurrentUser } from '@asisteglt/web-core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

interface ProfileControls {
  readonly displayName: FormControl<string>;
}

interface PasswordControls {
  readonly currentPassword: FormControl<string>;
  readonly newPassword: FormControl<string>;
}

/** Perfil, contraseña y sesiones activas del usuario. */
@Component({
  selector: 'app-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, Card, FloatLabel, InputText, Password, Button, TableModule, Tag],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage implements OnInit {
  private readonly api: AuthApiClient = inject(AuthApiClient);
  private readonly session: AuthSession = inject(AuthSession);
  private readonly messages: MessageService = inject(MessageService);
  private readonly confirmation: ConfirmationService = inject(ConfirmationService);
  private readonly fb: NonNullableFormBuilder = inject(NonNullableFormBuilder);

  protected readonly profileForm: FormGroup<ProfileControls> = this.fb.group({
    displayName: [AccountPage.currentName(this.session), [Validators.required, Validators.minLength(2)]],
  });
  protected readonly passwordForm: FormGroup<PasswordControls> = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(12), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
  });
  protected readonly sessions: WritableSignal<ActiveSession[]> = signal<ActiveSession[]>([]);
  protected readonly savingProfile: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly savingPassword: WritableSignal<boolean> = signal<boolean>(false);

  private static currentName(session: AuthSession): string {
    const user: Nullable<CurrentUser> = session.currentUser();
    return user === null ? '' : user.displayName;
  }

  public ngOnInit(): void {
    this.loadSessions().catch((): void => {
      // Los errores se informan dentro de loadSessions.
    });
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.savingProfile.set(true);
    const result: Result<CurrentUser> = await this.api.updateProfile(this.profileForm.getRawValue());
    this.savingProfile.set(false);
    result.match(
      (user: CurrentUser): void => {
        this.session.updateUser(user);
        this.notify('success', 'Perfil actualizado');
      },
      (error): void => this.notify('error', error.message),
    );
  }

  protected async savePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    const result: Result<true> = await this.api.changePassword(this.passwordForm.getRawValue());
    this.savingPassword.set(false);
    result.match(
      (): void => {
        this.passwordForm.reset();
        this.notify('success', 'Contraseña actualizada; se cerraron tus otras sesiones');
        this.loadSessions().catch((): void => {
          // Informado en loadSessions.
        });
      },
      (error): void => this.notify('error', error.message),
    );
  }

  protected confirmRevoke(target: ActiveSession): void {
    this.confirmation.confirm({
      header: 'Cerrar sesión',
      message: `¿Cerrar la sesión de ${target.deviceLabel()}?`,
      acceptLabel: 'Cerrar sesión',
      rejectLabel: 'Cancelar',
      accept: (): void => {
        this.revoke(target).catch((): void => {
          // Informado en revoke.
        });
      },
    });
  }

  private async revoke(target: ActiveSession): Promise<void> {
    const result: Result<true> = await this.api.revokeSession(target.id);
    result.match(
      (): void => this.notify('success', 'Sesión cerrada'),
      (error): void => this.notify('error', error.message),
    );
    await this.loadSessions();
  }

  private async loadSessions(): Promise<void> {
    const result: Result<ActiveSession[]> = await this.api.activeSessions();
    result.match(
      (items: ActiveSession[]): void => this.sessions.set(items),
      (error): void => this.notify('error', error.message),
    );
  }

  private notify(severity: 'success' | 'error', detail: string): void {
    const summary: Nullable<string> = severity === 'success' ? 'Listo' : 'No se pudo completar';
    this.messages.add({ severity, summary, detail, life: 4000 });
  }
}
