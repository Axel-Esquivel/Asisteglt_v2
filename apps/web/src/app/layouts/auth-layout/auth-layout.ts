import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Contexto de acceso (login/registro): pantalla centrada con su propio `router-outlet`. */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <div class="auth-layout">
      <header class="auth-layout__brand">
        <i class="pi pi-chart-bar auth-layout__logo" aria-hidden="true"></i>
        <span>AsisteGLT</span>
      </header>
      <main class="auth-layout__content">
        <router-outlet />
      </main>
      <footer class="auth-layout__footer">Reportes e inventarios colaborativos en tiempo real</footer>
    </div>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
