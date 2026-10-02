import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Message } from 'primeng/message';

@Component({
  selector: 'app-chat-empty-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Message],
  template: `<p-message severity="secondary" icon="pi pi-comments"
    >Selecciona una conversación o inicia una nueva.</p-message
  >`,
})
export class ChatEmptyPage {}
