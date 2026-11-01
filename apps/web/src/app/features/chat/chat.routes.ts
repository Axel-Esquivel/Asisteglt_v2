import { inject } from '@angular/core';
import { RedirectFunction, Route } from '@angular/router';
import { FloatingChatControl } from './floating/floating-chat-control';

const openConversation: RedirectFunction = ({ params }): string => {
  const id: unknown = params['conversationId'];
  if (typeof id === 'string' && id !== '') {
    inject(FloatingChatControl).showConversation(id);
  }
  return '/app';
};

/**
 * El chat vive en una ventana flotante (ver `FloatingChat`), no en una pantalla propia. Las rutas
 * antiguas se conservan para enlaces guardados: abren la ventana y vuelven al inicio.
 */
export const CHAT_ROUTES: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: (): string => {
      inject(FloatingChatControl).show();
      return '/app';
    },
  },
  {
    path: ':conversationId',
    redirectTo: openConversation,
  },
];
