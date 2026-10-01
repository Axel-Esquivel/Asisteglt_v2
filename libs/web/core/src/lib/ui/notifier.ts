import { Injectable, inject } from '@angular/core';
import { DomainError } from '@asisteglt/shared-kernel';
import { MessageService } from 'primeng/api';

/** Avisos (toast) uniformes para toda la aplicación. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly messages: MessageService = inject(MessageService);

  public success(detail: string): void {
    this.messages.add({ severity: 'success', summary: 'Listo', detail, life: 4000 });
  }

  public info(detail: string): void {
    this.messages.add({ severity: 'info', summary: 'Información', detail, life: 4000 });
  }

  public error(error: DomainError): void {
    this.messages.add({ severity: 'error', summary: 'No se pudo completar', detail: error.message, life: 6000 });
  }
}
