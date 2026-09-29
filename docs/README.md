# Documentación de análisis y diseño — AsisteGLT v2

| # | Documento | Contenido |
|---|---|---|
| 01 | [Análisis de requerimientos](01-analisis-requerimientos.md) | Visión, stack, restricciones, actores, RF/RNF, glosario, supuestos, preguntas abiertas |
| 02 | [Arquitectura](02-arquitectura.md) | Contexto y contenedores (C4), monorepo Nx, capas hexagonales, flujo de datos, tiempo real, Redis, colas, PDF, despliegue, ADR |
| 03 | [Funcionalidad y casos de uso](03-casos-de-uso.md) | Mapa funcional, diagramas de casos de uso por módulo, especificación de casos críticos |
| 04 | [Modelo de dominio (UML)](04-modelo-de-dominio.md) | 13 diagramas de clases: kernel, IAM, acceso, chat, estructura organizacional, ingestión, datasets, clasificaciones, operaciones, fórmulas, informes, inventarios, asignación |
| 05 | [Flujos y estados](05-flujos-y-estados.md) | Diagramas de secuencia, actividad y máquinas de estado |
| 06 | [Modelo de datos](06-modelo-de-datos.md) | Diagrama ER, colecciones MongoDB e índices |
| 07 | [Frontend Angular + PrimeNG](07-frontend-primeng.md) | Lineamientos, clases del frontend, navegación, pantallas → componentes PrimeNG |
| 08 | [Convenciones: POO y tipado estricto](08-convenciones-tipado-poo.md) | Reglas sin `any`/`undefined`, `tsconfig`, ESLint, patrones, ejemplos de código |
| 09 | [Seguridad y permisos](09-seguridad-permisos.md) | Controles de seguridad, modelo RBAC + ABAC, matrices de roles, compartición |
| 10 | [Plan de trabajo](10-plan-de-trabajo.md) | Fases, cronograma, entregables, criterios de aceptación, DoD, riesgos, próximos pasos |
| 11 | [Importación de ancho fijo](11-importacion-ancho-fijo.md) | Asistente con lienzo de divisorias, reglas de líneas, sugerencia automática, validaciones, clases y confidencialidad |

Los diagramas están escritos en **Mermaid** y GitHub los muestra directamente.

## Resumen ejecutivo

- **Qué es**: plataforma colaborativa en tiempo real con dos módulos multiproyecto —
  **Reportes** (ingestión de datos sin formato estándar → clasificación → consolidación →
  operaciones → informes multipágina con PDF) e **Inventarios** (tomas físicas guiadas con
  asignación por zonas, evidencias, supervisión en vivo y rondas de reconteo) — sobre una base
  común de identidad, permisos granulares, compartición y chat.
- **Cómo**: monorepo Nx; Angular 22 + PrimeNG 22 (zoneless, signals); NestJS 12 como monolito
  modular hexagonal + workers BullMQ; MongoDB 8 (replica set) + Redis 8; Socket.IO con Redis
  adapter; CASL para autorización; `Decimal` en todo cálculo monetario.
- **Restricciones del cliente**: POO, sin `any`, sin `undefined`, todo tipado, UI solo PrimeNG —
  convertidas en reglas de compilador y lint que **bloquean el CI** (ver 08).
- **Plan**: 9 fases (≈ 22 sprints de esfuerzo; ≈ 9 meses de calendario con 3–4 desarrolladores),
  con Reportes e Inventarios en paralelo a partir del motor de ingestión compartido.
