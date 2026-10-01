import nx from '@nx/eslint-plugin';
import asisteglt from './tools/eslint-plugin-asisteglt/index.mjs';

/**
 * Reglas normativas de docs/08-convenciones-tipado-poo.md:
 * sin any, sin undefined, sin opcionales ni `?.`, tipado explícito, POO y UI solo PrimeNG.
 */
const NO_UNDEFINED_SYNTAX = [
  { selector: 'TSUndefinedKeyword', message: 'No uses el tipo undefined; usa Nullable<T>.' },
  { selector: 'TSPropertySignature[optional=true]', message: 'Sin propiedades opcionales; usa T | null.' },
  { selector: 'PropertyDefinition[optional=true]', message: 'Sin propiedades opcionales; usa T | null.' },
  { selector: 'TSMethodSignature[optional=true]', message: 'Sin métodos opcionales.' },
  { selector: 'MethodDefinition[optional=true]', message: 'Sin métodos opcionales.' },
  {
    selector: 'Identifier[optional=true]',
    message: 'Sin parámetros opcionales; usa sobrecargas o T | null.',
  },
  { selector: 'TSOptionalType', message: 'Sin elementos opcionales en tuplas.' },
  {
    selector: 'ChainExpression',
    message: 'Sin ?. (produce undefined); usa Optional<T> o comprobación explícita de null.',
  },
];

const NO_DEFINITE_ASSIGNMENT = {
  selector: 'PropertyDefinition[definite=true]',
  message: 'Sin aserción de asignación definitiva (!); solo se permite en *.dto.ts y *.schema.ts.',
};

const UI_ONLY_PRIMENG = {
  patterns: [
    { group: ['@angular/material', '@angular/material/*'], message: 'UI solo con PrimeNG.' },
    {
      group: ['@angular/cdk', '@angular/cdk/*'],
      message: 'Usa los equivalentes de PrimeNG (p. ej. pDraggable).',
    },
    {
      group: ['@ng-bootstrap/*', 'ngx-bootstrap', 'ngx-bootstrap/*', 'bootstrap'],
      message: 'UI solo con PrimeNG.',
    },
    {
      group: ['@ionic/*', '@taiga-ui/*', 'ng-zorro-antd', 'ng-zorro-antd/*', '@clr/*'],
      message: 'UI solo con PrimeNG.',
    },
    {
      group: ['tailwindcss', 'tailwindcss-primeui', 'primeflex'],
      message: 'Estilos solo con SCSS sobre variables del tema.',
    },
  ],
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      '**/vite.config.*.timestamp*',
      '**/node_modules',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'] },
          ],
        },
      ],
    },
  },
  {
    // Código fuente TypeScript con análisis de tipos.
    files: ['**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
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
      'no-restricted-syntax': ['error', ...NO_UNDEFINED_SYNTAX, NO_DEFINITE_ASSIGNMENT],
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
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            Object: { message: 'Usa un tipo concreto o unknown.' },
            '{}': { message: 'Usa un tipo concreto o unknown.' },
            Function: { message: 'Declara la firma de la función.' },
          },
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'class', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        { selector: 'classProperty', modifiers: ['static', 'readonly'], format: ['UPPER_CASE'] },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Se exige anotar tipos de forma explícita (docs/08), aunque sean inferibles.
      '@typescript-eslint/no-inferrable-types': 'off',
      'no-restricted-imports': ['error', UI_ONLY_PRIMENG],
    },
  },
  {
    // Clases pobladas por reflexión del framework: única excepción a `!`.
    files: ['**/*.dto.ts', '**/*.schema.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_UNDEFINED_SYNTAX],
    },
  },
  {
    files: ['**/*.html'],
    plugins: { asisteglt },
    rules: {
      'asisteglt/primeng-controls-only': 'error',
    },
  },
];
