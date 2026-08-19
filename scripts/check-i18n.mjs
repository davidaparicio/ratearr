import { readFileSync } from 'node:fs';

const en = JSON.parse(readFileSync('public/_locales/en/messages.json', 'utf-8'));
const fr = JSON.parse(readFileSync('public/_locales/fr/messages.json', 'utf-8'));

const enKeys = new Set(Object.keys(en));
const frKeys = new Set(Object.keys(fr));

let ok = true;

for (const key of enKeys) {
  if (!frKeys.has(key)) {
    console.error(`Missing in FR: ${key}`);
    ok = false;
  }
}

for (const key of frKeys) {
  if (!enKeys.has(key)) {
    console.error(`Missing in EN: ${key}`);
    ok = false;
  }
}

if (ok) {
  console.log(`i18n parity OK: ${enKeys.size} keys in both locales`);
} else {
  process.exit(1);
}
