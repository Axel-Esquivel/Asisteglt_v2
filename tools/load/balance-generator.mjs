// Genera un balance de saldos «impreso a archivo» 100 % FICTICIO con el mismo diseño que el de
// demostración (DemoData.balance): encabezado de 3 líneas repetido por página y columnas fijas.
// Uso: node tools/load/balance-generator.mjs <archivo> <líneas> [mes]
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

const LINES_PER_PAGE = 60;

/** Generador pseudoaleatorio determinista (mulberry32): mismos datos en cada ejecución. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function amount(value) {
  const [integer, cents] = Math.abs(value).toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `(${grouped}.${cents})` : `${grouped}.${cents}`;
}

function header(month, page) {
  return [
    // Siempre al menos un espacio tras «Pagina:», como en el reporte impreso (la firma lo exige).
    `${page === 1 ? '' : '\f'}EMPRESA DEMO, S.A.                                              Pagina: ${String(page).padStart(4)}`,
    `Emision:  05/${month}/26  09:15:02`,
    'No. de Cuenta    Nombre de la Cuenta            Saldo Ant.       DEBE      HABER',
  ];
}

function account(index) {
  const group = 1 + (index % 9);
  const rest = Math.floor(index / 9);
  const a = String(Math.floor(rest / 10_000_000) % 1000).padStart(3, '0');
  const b = String(Math.floor(rest / 10_000) % 1000).padStart(3, '0');
  const c = String(rest % 10_000).padStart(4, '0');
  return `${group}.${a}.${b}.${c}`;
}

export async function generateBalance(path, lines, month) {
  const next = random(2026 + Number(month));
  const out = createWriteStream(path);
  let page = 0;
  let written = 0;
  let buffer = '';
  const flush = async () => {
    if (!out.write(buffer)) {
      await once(out, 'drain');
    }
    buffer = '';
  };
  for (let index = 0; written < lines; index += 1) {
    if (index % LINES_PER_PAGE === 0) {
      page += 1;
      for (const line of header(month, page)) {
        buffer += `${line}\n`;
        written += 1;
      }
      continue;
    }
    const balance = Math.round((next() - 0.4) * 1_000_000) / 100;
    const debit = Math.round(next() * 500_000) / 100;
    const credit = Math.round(next() * 500_000) / 100;
    buffer +=
      `${account(index).padEnd(17)}${`   Cuenta ficticia ${index}`.padEnd(30)}` +
      `${amount(balance).padStart(11)}${amount(debit).padStart(11)}${amount(credit).padStart(11)}\n`;
    written += 1;
    if (buffer.length > 1 << 20) {
      await flush();
    }
  }
  await flush();
  out.end();
  await once(out, 'finish');
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path, count, month = '09'] = process.argv.slice(2);
  if (path === undefined || count === undefined) {
    process.stderr.write('Uso: node tools/load/balance-generator.mjs <archivo> <líneas> [mes]\n');
    process.exit(2);
  }
  const written = await generateBalance(path, Number(count), month);
  process.stdout.write(`${written} líneas ficticias en ${path}\n`);
}
