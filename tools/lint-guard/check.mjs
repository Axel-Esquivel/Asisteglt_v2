// Guardián del lint: comprueba que cada regla normativa de docs/08 detecta su violación.
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtures = join(root, 'tools', 'lint-guard', 'fixtures', 'src');

const expectations = [
  { file: 'violations.ts', rule: '@typescript-eslint/no-explicit-any', what: 'any' },
  { file: 'violations.ts', rule: 'no-undefined', what: 'valor undefined' },
  { file: 'violations.ts', rule: 'no-restricted-syntax', text: 'tipo undefined', what: 'tipo undefined' },
  { file: 'violations.ts', rule: 'no-restricted-syntax', text: 'propiedades opcionales', what: 'propiedad opcional' },
  { file: 'violations.ts', rule: 'no-restricted-syntax', text: 'Sin ?.', what: 'encadenamiento opcional ?.' },
  { file: 'violations.ts', rule: 'no-restricted-syntax', text: 'asignación definitiva', what: 'aserción !' },
  { file: 'violations.ts', rule: '@typescript-eslint/consistent-type-assertions', what: 'aserción as' },
  { file: 'violations.ts', rule: 'no-restricted-imports', what: 'librería de UI no PrimeNG' },
  { file: 'violations.html', rule: 'asisteglt/primeng-controls-only', text: '<button>', what: '<button> sin pButton' },
  { file: 'violations.html', rule: 'asisteglt/primeng-controls-only', text: '<input>', what: '<input> sin directiva PrimeNG' },
  { file: 'violations.html', rule: 'asisteglt/primeng-controls-only', text: '<select>', what: '<select> nativo' },
  { file: 'violations.html', rule: 'asisteglt/primeng-controls-only', text: '<table>', what: '<table> nativo' },
  { file: 'violations.html', rule: 'asisteglt/no-template-safe-navigation', what: '?. en plantilla' },
];

const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'tools', 'lint-guard', 'eslint.config.mjs') });
const results = await eslint.lintFiles([join(fixtures, 'violations.ts'), join(fixtures, 'violations.html')]);
let failures = 0;
for (const expectation of expectations) {
  const result = results.find((r) => r.filePath.endsWith(expectation.file));
  const found = (result ? result.messages : []).some(
    (m) => m.ruleId === expectation.rule && (expectation.text === undefined || m.message.includes(expectation.text)),
  );
  console.log(`${found ? '✔' : '✖'} ${expectation.what} (${expectation.rule})`);
  if (!found) failures += 1;
}
if (failures > 0) {
  console.error(`\n${failures} regla(s) normativa(s) no detectaron su violación.`);
  process.exit(1);
}
console.log('\nTodas las reglas normativas detectan sus violaciones.');
