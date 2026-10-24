// Zet Material Symbols (Outlined, gewicht 400) om naar src/components/iconPaths.ts.
// Gebruik: npm pack @material-symbols/svg-400 && tar xzf … && node scripts/generate-icons.mjs <map/package>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const NAMES = [
  'home', 'donut_small', 'flag', 'receipt_long', 'swap_vert',
  'visibility', 'visibility_off', 'search', 'notifications', 'north_east', 'south_east', 'swipe',
  'pending_actions', 'autorenew', 'balance', 'add', 'arrow_back', 'notification_add', 'lock',
  'currency_exchange', 'payments', 'edit', 'chevron_right', 'calendar_month', 'summarize',
  'insights=search_insights', 'link', 'candlestick_chart', 'account_balance', 'edit_note', 'construction',
  'fingerprint', 'backspace', 'sync', 'check', 'remove', 'expand_more=keyboard_arrow_down', 'close', 'science',
];

const pkg = process.argv[2];
if (!pkg) throw new Error('Geef de map van @material-symbols/svg-400 mee');

const pathOf = (file) => {
  const svg = readFileSync(file, 'utf8');
  const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  if (d.length !== 1) throw new Error(`Verwacht één pad in ${file}`);
  return d[0];
};

// "naam=bestand" als het icoon in de SVG-set anders heet dan in het lettertype.
const lines = NAMES.map((entry) => {
  const [key, n = key] = entry.split('=');
  const fill = join(pkg, 'outlined', `${n}-fill.svg`);
  const o = pathOf(join(pkg, 'outlined', `${n}.svg`));
  const f = existsSync(fill) ? pathOf(fill) : o;
  return `  ${key}: [${JSON.stringify(o)}, ${JSON.stringify(f)}],`;
});

writeFileSync(
  new URL('../src/components/iconPaths.ts', import.meta.url),
  `// Gegenereerd door scripts/generate-icons.mjs uit @material-symbols/svg-400 (Apache-2.0). Niet met de hand aanpassen.\n` +
    `// Per icoon: [omlijnd, gevuld], viewBox "0 -960 960 960".\n` +
    `export const ICON_PATHS = {\n${lines.join('\n')}\n} as const;\n\nexport type IconName = keyof typeof ICON_PATHS;\n`,
);
console.log(`${NAMES.length} iconen geschreven`);
