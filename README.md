# AsisteGLT v2

Plataforma web colaborativa y en tiempo real con dos módulos multiproyecto:

- **Reportes**: importación dinámica de datos (texto de ancho fijo, delimitados, hojas de cálculo,
  bases de datos), estructura organizacional, colecciones complementarias, clasificaciones,
  consolidación, operaciones contables y diseñador de informes multipágina con exportación a PDF.
- **Inventarios**: tomas físicas con asignación automática por zonas, conteo guiado en tiempo
  real, evidencias fotográficas, supervisión en vivo y rondas de reconteo.

Funciones globales: registro, inicio de sesión con 2FA, manejo seguro de tokens y sesiones,
perfil, permisos granulares, compartición por vínculo o correo y chat global / entre usuarios.

## Stack

Angular 22 · PrimeNG 22 · NestJS 12 · MongoDB 8 · Redis 8 · Socket.IO · BullMQ · Nx ·
TypeScript 6 (estricto: sin `any`, sin `undefined`, POO).

## Estado

- Análisis y diseño: [`docs/`](docs/README.md).
- **Fase 0 (Fundaciones) implementada**: monorepo, reglas estrictas en CI, kernel POO, API,
  worker y shell web. Cómo levantarlo: [`docs/13-puesta-en-marcha.md`](docs/13-puesta-en-marcha.md).

```bash
npm install && cp .env.example .env && npm run services:up
npm run start:api      # http://localhost:3000/api/v1/health
npm run start:web      # http://localhost:4200
npm run verify         # lint + typecheck + pruebas + build
```
