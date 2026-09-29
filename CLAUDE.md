# AsisteGLT v2 — guía para agentes

Antes de escribir código, lee `docs/08-convenciones-tipado-poo.md` (normativo) y el documento de
diseño del contexto que vayas a tocar (`docs/04-modelo-de-dominio.md`, `docs/07-frontend-primeng.md`).

Reglas no negociables del cliente:

- Programación orientada a objetos: lógica en clases con estado encapsulado; dependencias hacia
  clases abstractas inyectadas por constructor.
- Prohibido `any` (incluido `$any()` en plantillas) y prohibido `undefined`: sin `?:`, sin
  parámetros opcionales, sin `?.`; la ausencia se modela con `Nullable<T>` (`T | null`),
  *Null Object* u `Optional<T>`. Normaliza valores de terceros con `?? null` en el punto de contacto.
- Todo tipado: tipos de retorno y modificadores de acceso explícitos; sin `as` (salvo `as const`)
  ni `!` (salvo en `*.dto.ts` / `*.schema.ts`); datos externos entran como `unknown` y se validan.
- Dinero y cantidades con `Decimal`, nunca `number`.
- UI exclusivamente con componentes y directivas de PrimeNG; estilos solo con SCSS sobre las
  variables CSS del tema (sin Tailwind ni colores fijos).
- Los datos importados por el cliente son confidenciales: nunca los copies al repositorio ni a
  documentación; usa datos ficticios en ejemplos y pruebas.

Código en inglés; interfaz de usuario y documentación en español.
