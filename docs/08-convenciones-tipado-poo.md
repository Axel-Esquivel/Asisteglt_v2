# 08 · Convenciones: POO, tipado estricto y PrimeNG

Este documento es **normativo**: el CI rechaza cualquier cambio que lo incumpla.

## 1. Reglas de oro

| # | Regla | Verificación automática |
|---|---|---|
| 1 | **Prohibido `any`** (explícito, implícito o vía `$any()` en plantillas). | `noImplicitAny`, `@typescript-eslint/no-explicit-any`, `no-unsafe-*`, `@angular-eslint/template/no-any` |
| 2 | **Prohibido `undefined`**: no se escribe el identificador ni el tipo, no hay propiedades/parámetros opcionales (`?`) ni encadenamiento opcional (`?.`). | `no-undefined`, `no-restricted-syntax` (ver §3) |
| 3 | La ausencia de valor se expresa con `Nullable<T>` (= `T \| null`), *Null Object* (`EmptyValue`, `NeverMatchRule`) u `Optional<T>`. | Revisión + tipos del *kernel* |
| 4 | Todo valor que venga de fuera (HTTP, sockets, archivos, BD externas, `process.env`) entra como `unknown` y se valida antes de convertirse en un tipo del dominio. | `useUnknownInCatchVariables`, `no-unsafe-*`, decoders |
| 5 | Sin aserciones de tipo (`as T`, `<T>x`) ni `!`. Solo se permite `as const`. | `consistent-type-assertions: never`, `no-non-null-assertion` |
| 6 | Tipos de retorno y modificadores de acceso **explícitos** en todo método y función. | `explicit-function-return-type`, `explicit-member-accessibility` |
| 7 | POO: la lógica vive en **clases** con estado encapsulado (`private readonly`), invariantes en constructores privados + fábricas estáticas que devuelven `Result<T>`. | Revisión + `prefer-readonly` |
| 8 | Dependencias hacia **abstracciones** (clases abstractas) inyectadas por constructor. | `@nx/enforce-module-boundaries` + revisión |
| 9 | Dinero y cantidades con `Decimal`; nunca `number`. | Revisión + tipos (`Decimal` no es asignable a `number`) |
| 10 | UI **solo PrimeNG**. Ninguna otra librería de componentes; ningún control interactivo nativo sin su equivalente PrimeNG. | `no-restricted-imports` + regla propia de plantillas |
| 11 | Estilos solo en **SCSS** con variables del tema PrimeNG; sin Tailwind ni otros frameworks CSS; sin colores fijos. | `stylelint` (`color-no-hex`, `declaration-property-value-disallowed-list`) + `no-restricted-imports` |

### 1.1 ¿Qué pasa con las APIs de terceros que devuelven `undefined`?

No se pueden cambiar (`Array.prototype.find`, `Map.get`, índices de arreglos, algunos eventos de
librerías). Se **normalizan en el punto de contacto** y nunca cruzan una frontera de método:

```ts
// ✔ Normalización inmediata con ?? null (no se escribe `undefined`)
const member: Nullable<ProjectMember> = members.find((m) => m.belongsTo(userId)) ?? null;

// ✔ O mediante utilidades del kernel que devuelven Optional<T>
const role: Optional<Role> = ReadonlyDictionary.from(rolesById).get(roleId);
```

Las clases del *kernel* `ReadonlyDictionary<K, V>`, `Collections.findFirst()` y
`Collections.at(index)` encapsulan estos casos para que el código de negocio nunca los vea.

### 1.2 Contratos compartidos front ↔ back

`libs/shared/contracts` contiene **interfaces de solo tipo** (cero código en tiempo de ejecución)
para los DTO y eventos. Del lado del backend, los DTO son **clases** que las implementan
(`class CreateProjectRequestDto implements CreateProjectRequest`), con validación declarativa.
Del lado del frontend, los *decoders* convierten `unknown` en **clases de modelo de vista**.

## 2. `tsconfig.base.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": true,
    "useUnknownInCatchVariables": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
```

> `experimentalDecorators` y `emitDecoratorMetadata` se agregan solo en los `tsconfig` de
> `apps/api`, `apps/worker` y `libs/api/*` (NestJS los requiere); Angular no los necesita.

### 2.1 Opciones del compilador de Angular (`apps/web/tsconfig.json`)

```jsonc
{
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictStandalone": true,
    "typeCheckHostBindings": true,
    "extendedDiagnostics": { "defaultCategory": "error" }
  }
}
```

## 3. ESLint (flat config, fragmento normativo)

```js
// eslint.config.mjs (raíz) — se combina con los presets de Nx, typescript-eslint y angular-eslint
export default [
  {
    files: ['**/*.ts'],
    rules: {
      // any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // undefined
      'no-undefined': 'error',
      'no-void': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSUndefinedKeyword', message: 'No uses el tipo undefined; usa Nullable<T>.' },
        { selector: 'TSPropertySignature[optional=true]', message: 'Sin propiedades opcionales; usa T | null.' },
        { selector: 'PropertyDefinition[optional=true]', message: 'Sin propiedades opcionales; usa T | null.' },
        { selector: 'TSMethodSignature[optional=true]', message: 'Sin métodos opcionales.' },
        { selector: 'MethodDefinition[optional=true]', message: 'Sin métodos opcionales.' },
        { selector: 'Identifier[optional=true]', message: 'Sin parámetros opcionales; usa sobrecargas o T | null.' },
        { selector: 'TSOptionalType', message: 'Sin elementos opcionales en tuplas.' },
        { selector: 'ChainExpression', message: 'Sin ?. (produce undefined); usa Optional<T> o comprobación explícita de null.' },
        { selector: 'PropertyDefinition[definite=true]', message: 'Sin aserción de asignación definitiva (!).' },
      ],

      // tipado explícito y seguridad
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-restricted-types': ['error', {
        types: {
          Object: { message: 'Usa un tipo concreto o unknown.' },
          '{}': { message: 'Usa un tipo concreto o unknown.' },
          Function: { message: 'Declara la firma de la función.' },
        },
      }],
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/naming-convention': ['error',
        { selector: 'class', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'classProperty', modifiers: ['static', 'readonly'], format: ['UPPER_CASE'] },
        { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'forbid' },
      ],

      // UI solo PrimeNG
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@angular/material', '@angular/material/*'], message: 'UI solo con PrimeNG.' },
          { group: ['@angular/cdk/*'], message: 'Usa los equivalentes de PrimeNG (p. ej. pDraggable).' },
          { group: ['@ng-bootstrap/*', 'ngx-bootstrap', 'ngx-bootstrap/*', 'bootstrap'], message: 'UI solo con PrimeNG.' },
          { group: ['@ionic/*', '@taiga-ui/*', 'ng-zorro-antd', 'ng-zorro-antd/*', '@clr/*'], message: 'UI solo con PrimeNG.' },
        ],
      }],
    },
  },
  {
    // Clases pobladas por reflexión del framework (validación de DTO y schemas de Mongoose):
    // única excepción a la aserción de asignación definitiva; ver §5.4.
    files: ['**/*.dto.ts', '**/*.schema.ts'],
    rules: { 'no-restricted-syntax': ['error',
      { selector: 'TSUndefinedKeyword', message: 'No uses el tipo undefined; usa Nullable<T>.' },
      { selector: 'PropertyDefinition[optional=true]', message: 'Sin propiedades opcionales; usa T | null.' },
      { selector: 'ChainExpression', message: 'Sin ?.' },
    ] },
  },
  {
    files: ['**/*.html'],
    rules: {
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
      'asisteglt/primeng-controls-only': 'error', // regla propia en tools/eslint-rules
    },
  },
];
```

La regla propia `asisteglt/primeng-controls-only` rechaza en plantillas los elementos
`<button>` sin `pButton`, `<input>` sin una directiva PrimeNG (`pInputText`, etc.), `<select>`,
`<textarea>` sin `pTextarea`, `<table>` y `<dialog>` nativos.

### 3.1 Excepción conocida: `any` dentro de tipos de PrimeNG

Algunos tipos de eventos y plantillas de PrimeNG declaran `any` (p. ej. `event.value` en
cambios de selección o variables `let-item` de plantillas). Tratamiento obligatorio:

1. El manejador recibe el evento y lee el valor como `unknown`.
2. Lo estrecha con `instanceof` (las opciones son instancias de clases de modelo de vista) o con
   un *type guard* antes de usarlo.
3. Las variables de plantilla se pasan de inmediato a componentes hijos con
   `input.required<T>()`, de modo que el resto del árbol queda tipado.

## 4. Patrones de diseño por problema

| Problema | Patrón | Clases |
|---|---|---|
| Leer fuentes heterogéneas | Strategy + Template Method + Factory | `RecordReader`, `RecordReaderFactory`, `DatabaseConnector` |
| Convertir texto a valores tipados | Strategy + Registry + Null Object | `ValueParser`, `ValueParserRegistry`, `EmptyValue` |
| Clasificar por código/nombre | Composite + Specification | `ClassificationNode`, `MatchRule`, `AndRule/OrRule/NotRule` |
| Operaciones encadenadas sobre datos | Pipeline / Chain of Responsibility | `TransformationPipeline`, `TransformationStep` |
| Fórmulas de usuario | Interpreter + Composite + Visitor | `Expression`, `Evaluator`, `DependencyCollector` |
| Estructura del informe | Composite + Visitor | `ReportTemplate` → `ReportPage` → `ReportElement` |
| Deshacer/rehacer en el diseñador | Command + Memento | `DesignerCommand`, `CommandHistory` |
| Asignación de inventario | Strategy + Factory | `AssignmentStrategy`, `AssignmentStrategyFactory` |
| Ciclo de vida de tomas, cargas, invitaciones | State (métodos de transición con validación) | `InventoryCount`, `ImportJob`, `Invitation` |
| Persistencia | Repository + Data Mapper | `UserRepository` → `MongoUserRepository` + `UserMapper` |
| Notificar cambios en tiempo real | Observer (eventos de dominio) | `DomainEvent`, `RealtimeEventPublisher` |
| Errores de negocio sin excepciones | Result | `Result<T>`, `DomainError` |

## 5. Ejemplos de referencia

### 5.1 Kernel: `Nullable` y `Optional`

```ts
export type Nullable<T> = T | null;

export abstract class Optional<T> {
  public static of<T>(value: T): Optional<T> {
    return new Present<T>(value);
  }

  public static empty<T>(): Optional<T> {
    return new Empty<T>();
  }

  public static fromNullable<T>(value: Nullable<T>): Optional<T> {
    return value === null ? Optional.empty<T>() : Optional.of<T>(value);
  }

  public abstract isPresent(): boolean;
  public abstract map<R>(mapper: (value: T) => R): Optional<R>;
  public abstract orElse(fallback: T): T;
  public abstract orElseThrow(factory: () => Error): T;
}

class Present<T> extends Optional<T> {
  public constructor(private readonly value: T) {
    super();
  }

  public override isPresent(): boolean {
    return true;
  }

  public override map<R>(mapper: (value: T) => R): Optional<R> {
    return Optional.of<R>(mapper(this.value));
  }

  public override orElse(_fallback: T): T {
    return this.value;
  }

  public override orElseThrow(_factory: () => Error): T {
    return this.value;
  }
}

class Empty<T> extends Optional<T> {
  public override isPresent(): boolean {
    return false;
  }

  public override map<R>(_mapper: (value: T) => R): Optional<R> {
    return Optional.empty<R>();
  }

  public override orElse(fallback: T): T {
    return fallback;
  }

  public override orElseThrow(factory: () => Error): T {
    throw factory();
  }
}
```

### 5.2 Value object con invariantes: `Period`

```ts
interface PeriodProps {
  readonly year: number;
  readonly month: number;
}

export class Period extends ValueObject<PeriodProps> {
  private static readonly MIN_YEAR: number = 1900;
  private static readonly MAX_YEAR: number = 2999;

  private constructor(props: PeriodProps) {
    super(props);
  }

  public static of(year: number, month: number): Result<Period> {
    if (!Number.isInteger(year) || year < Period.MIN_YEAR || year > Period.MAX_YEAR) {
      return Result.fail(new ValidationError('PERIOD_INVALID_YEAR', `Año inválido: ${year}`));
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return Result.fail(new ValidationError('PERIOD_INVALID_MONTH', `Mes inválido: ${month}`));
    }
    return Result.ok(new Period({ year, month }));
  }

  public previous(): Period {
    return this.props.month === 1
      ? new Period({ year: this.props.year - 1, month: 12 })
      : new Period({ year: this.props.year, month: this.props.month - 1 });
  }

  public isBefore(other: Period): boolean {
    return this.props.year < other.props.year
      || (this.props.year === other.props.year && this.props.month < other.props.month);
  }
}
```

### 5.3 Especificación de clasificación

```ts
export abstract class MatchRule {
  public and(other: MatchRule): MatchRule {
    return new AndRule(this, other);
  }

  public or(other: MatchRule): MatchRule {
    return new OrRule(this, other);
  }

  public not(): MatchRule {
    return new NotRule(this);
  }

  public abstract isSatisfiedBy(value: string): boolean;
}

export class StartsWithRule extends MatchRule {
  public constructor(
    private readonly prefix: string,
    private readonly options: TextMatchOptions,
  ) {
    super();
  }

  public override isSatisfiedBy(value: string): boolean {
    return this.options.normalize(value).startsWith(this.options.normalize(this.prefix));
  }
}

// Activo corriente = códigos que inician con "11" excepto los que contienen "-99"
const currentAssets: MatchRule = new StartsWithRule('11', TextMatchOptions.caseInsensitive())
  .and(new ContainsRule('-99', TextMatchOptions.caseInsensitive()).not());
```

### 5.4 NestJS: DTO, controlador y caso de uso

```ts
// create-project.request.dto.ts — clase poblada por ValidationPipe (whitelist + forbidNonWhitelisted)
export class CreateProjectRequestDto implements CreateProjectRequest {
  @IsDefined() @IsString() @Length(3, 120)
  public readonly name!: string;

  @IsDefined() @IsEnum(ModuleType)
  public readonly moduleType!: ModuleType;

  @IsDefined() @IsString() @MaxLength(500)
  public readonly description!: string;
}
```

> `!` en DTO y schemas es la **única** excepción (lint la limita a `*.dto.ts` y `*.schema.ts`):
> esas clases las instancia el framework por reflexión y la validación garantiza la presencia de
> cada campo (`@IsDefined()` obligatorio). Nunca salen de la capa de presentación/infraestructura:
> se convierten de inmediato en comandos o entidades construidos por constructor.

```ts
@Controller('projects')
export class ProjectsController {
  public constructor(private readonly createProject: CreateProjectUseCase) {}

  @Post()
  @CheckPolicies(new CanPolicy(Action.CREATE, Subject.PROJECT))
  public async create(
    @Body() body: CreateProjectRequestDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ProjectResponse> {
    const command: CreateProjectCommand = new CreateProjectCommand(
      principal.userId,
      body.name,
      body.moduleType,
      body.description,
    );
    const result: Result<Project> = await this.createProject.execute(command);
    return ProjectPresenter.toResponse(result.unwrap()); // DomainErrorFilter traduce Fail → HTTP
  }
}

@Injectable()
export class CreateProjectUseCase {
  public constructor(
    private readonly projects: ProjectRepository,       // clase abstracta
    private readonly factory: ProjectFactory,
    private readonly events: DomainEventPublisher,      // clase abstracta
  ) {}

  public async execute(command: CreateProjectCommand): Promise<Result<Project>> {
    const created: Result<Project> = this.factory.create(command);
    if (!created.isOk()) {
      return created;
    }
    const project: Project = created.unwrap();
    await this.projects.save(project);
    await this.events.publishAll(project.pullDomainEvents());
    return Result.ok(project);
  }
}
```

### 5.5 Schema de Mongoose con nulos explícitos

```ts
@Schema({ collection: 'users', timestamps: true, optimisticConcurrency: true })
export class UserDocument {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  public email!: string;

  @Prop({ type: String, required: true })
  public passwordHash!: string;

  @Prop({ type: Date, default: null })
  public lastLoginAt!: Date | null;

  @Prop({ type: String, enum: Object.values(UserStatus), required: true })
  public status!: UserStatus;
}
```

### 5.6 Angular: componente de presentación con PrimeNG

```ts
@Component({
  selector: 'app-conversation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Listbox, FormsModule, ConversationItemComponent],
  template: `
    <p-listbox
      [options]="conversations()"
      [ngModel]="selected()"
      (onChange)="onChange($event)"
      optionLabel="title"
      [filter]="true"
      styleClass="conversation-list"
    >
      <ng-template #item let-conversation>
        <app-conversation-item [conversation]="conversation" />
      </ng-template>
    </p-listbox>
  `,
})
export class ConversationListComponent {
  public readonly conversations: InputSignal<ConversationVm[]> = input.required<ConversationVm[]>();
  public readonly selected: InputSignal<Nullable<ConversationVm>> = input<Nullable<ConversationVm>>(null);
  public readonly selectedChange: OutputEmitterRef<ConversationVm> = output<ConversationVm>();

  protected onChange(event: ListboxChangeEvent): void {
    const value: unknown = event.value;
    if (value instanceof ConversationVm) {
      this.selectedChange.emit(value);
    }
  }
}
```

### 5.7 Store basado en signals

```ts
export abstract class BaseStore<TState extends object> {
  protected readonly state: WritableSignal<TState>;

  protected constructor(initialState: TState) {
    this.state = signal<TState>(initialState);
  }

  public select<R>(projector: (state: TState) => R): Signal<R> {
    return computed<R>(() => projector(this.state()));
  }

  protected update(updater: (current: TState) => TState): void {
    this.state.update(updater);
  }
}

interface ChatState {
  readonly conversations: ConversationVm[];
  readonly activeConversationId: Nullable<EntityId>;
  readonly messages: MessageVm[];
}

@Injectable({ providedIn: 'root' })
export class ChatStore extends BaseStore<ChatState> {
  public readonly conversations: Signal<ConversationVm[]> = this.select((s) => s.conversations);
  public readonly unreadTotal: Signal<number> =
    this.select((s) => s.conversations.reduce((total, c) => total + c.unreadCount, 0));

  public constructor(
    private readonly api: ChatApiClient,
    private readonly channel: ChatRealtimeChannel,
  ) {
    super({ conversations: [], activeConversationId: null, messages: [] });
    this.channel.on('message.created', (payload) => this.appendMessage(MessageVm.fromDto(payload)));
  }

  private appendMessage(message: MessageVm): void {
    this.update((current) => ({ ...current, messages: [...current.messages, message] }));
  }
}
```

## 6. Nomenclatura y archivos

| Elemento | Convención | Ejemplo |
|---|---|---|
| Idioma del código | Inglés | `InventoryCount`, `recordFailedLogin()` |
| Idioma de UI y documentación | Español | "Toma de inventario" |
| Clases | `PascalCase` + sufijo de rol | `CreateProjectUseCase`, `MongoUserRepository`, `ChatStore`, `ReportsApiClient` |
| Archivos | `kebab-case.<rol>.ts` | `create-project.use-case.ts`, `user.repository.ts`, `user.schema.ts`, `chat.store.ts` |
| Enumeraciones | `PascalCase` con miembros `UPPER_CASE` | `ModuleType.REPORTS` |
| Eventos de dominio | Pasado | `ProjectCreated`, `CountEntryRecorded` |
| Eventos de tiempo real | `recurso.accion` | `entry.recorded`, `message.created` |
| Commits | *Conventional Commits* | `feat(reports): add fixed width ruler` |

## 7. Pruebas

| Nivel | Herramienta | Alcance |
|---|---|---|
| Unitarias | Vitest (web y libs compartidas), Jest (NestJS) | Dominio, casos de uso, stores, *parsers*, motor de fórmulas, estrategias de asignación |
| Integración | Testcontainers (MongoDB replica set, Redis) | Repositorios, agregaciones de informes, colas, gateways |
| E2E | Playwright | Login + 2FA, importación, diseño y exportación PDF, toma de inventario con dos usuarios simultáneos |
| Contratos | Compilación conjunta del monorepo | Cualquier cambio de `libs/shared/contracts` compila front y back |

Cobertura mínima del 80 % en `domain` y `application`; los *parsers* y el motor de fórmulas se
prueban además con **pruebas basadas en propiedades** (fast-check).
