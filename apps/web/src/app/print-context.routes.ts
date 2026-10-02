import { Route } from '@angular/router';

/** Rutas del contexto de impresión (vistas previas listas para imprimir o guardar como PDF). */
export const PRINT_CONTEXT_ROUTES: Route[] = [
  {
    path: 'projects/:projectId/templates/:templateId',
    title: 'Vista previa · AsisteGLT',
    loadComponent: () =>
      import('./features/reports/print/template-print.page').then((m) => m.TemplatePrintPage),
  },
];
