import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';

@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Card, Button, RouterLink],
  template: `
    <div class="not-found">
      <p-card header="Página no encontrada">
        <p>La dirección que buscas no existe.</p>
        <p-button label="Volver al inicio" icon="pi pi-home" routerLink="/" />
      </p-card>
    </div>
  `,
  styles: `
    .not-found {
      max-width: 480px;
      margin: 4rem auto;
      padding-inline: 1rem;
    }
  `,
})
export class NotFoundPage {}
