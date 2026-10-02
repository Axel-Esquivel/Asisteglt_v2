import { ChangeDetectionStrategy, Component, WritableSignal, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Nullable, Result } from '@asisteglt/shared-kernel';
import { AuthSession, CurrentUser } from '@asisteglt/web-core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { Password } from 'primeng/password';

interface LoginFormControls {
  readonly email: FormControl<string>;
  readonly password: FormControl<string>;
}

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Card, FloatLabel, InputText, Password, Button, Message],
  templateUrl: './login.page.html',
  styleUrl: './auth-form.scss',
})
export class LoginPage {
  private readonly session: AuthSession = inject(AuthSession);
  private readonly router: Router = inject(Router);

  protected readonly form: FormGroup<LoginFormControls> = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  protected readonly submitting: WritableSignal<boolean> = signal<boolean>(false);
  protected readonly error: WritableSignal<Nullable<string>> = signal<Nullable<string>>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const result: Result<CurrentUser> = await this.session.login(this.form.getRawValue());
    this.submitting.set(false);
    if (result.isOk()) {
      await this.router.navigateByUrl('/app');
      return;
    }
    this.error.set(
      result.match(
        (): string => '',
        (failure): string => failure.message,
      ),
    );
  }
}
