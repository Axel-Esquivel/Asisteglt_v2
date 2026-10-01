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
- **Fase de pruebas**: identidad y sesiones, proyectos con roles y vínculos, chat en tiempo
  real, Reportes (estructura, catálogo de encabezados, asistente de ancho fijo con lienzo, carga
  múltiple, datos, clasificaciones e informes) e Inventarios (tomas por zonas, conteo a ciegas,
  supervisión en vivo y rondas). Guía: [`docs/14-guia-de-pruebas.md`](docs/14-guia-de-pruebas.md).
- Cómo levantarlo: [`docs/13-puesta-en-marcha.md`](docs/13-puesta-en-marcha.md).

```bash
npm install
npm run start:demo     # demostración en memoria con datos ficticios → http://localhost:4200
npm run verify         # lint + typecheck + pruebas + build
npm run e2e            # Playwright (escritorio y móvil)
```
