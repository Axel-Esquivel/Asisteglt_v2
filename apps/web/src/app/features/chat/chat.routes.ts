import { Route } from '@angular/router';

/** Contexto de chat con su propio `router-outlet` para la conversación abierta. */
export const CHAT_ROUTES: Route[] = [
  {
    path: '',
    title: 'Chat · AsisteGLT',
    loadComponent: () => import('./layout/chat-layout').then((m) => m.ChatLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./pages/chat-empty.page').then((m) => m.ChatEmptyPage),
      },
      {
        path: ':conversationId',
        loadComponent: () => import('./pages/chat-conversation.page').then((m) => m.ChatConversationPage),
      },
    ],
  },
];
