import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const signatures = [
  '\u00c2\u00b7',
  '\u00e2\u20ac\u201d',
  '\u00e2\u0153\u201c',
  '\u00c3\u2014',
  '\u00e2\u2014\u008f',
  '\u00e2\u2014\u2039',
  '\u00e2\u0161\u00a0',
  '\u00c3\u201a',
  '\u00c3\u0192',
  '\u00c3\u00a2\u00e2\u201a\u00ac',
  '\u00c3\u00a2\u00c3\u2026',
  '\u00c3\u00a2\u00c5\u0161',
  '\u00c3\u2020',
  '\u00c3\u201e',
  '\ufffd',
  '\u00c3\u00af\u00c2\u00bf\u00c2\u00bd',
];
const extensions = new Set(['.html', '.ts', '.scss', '.css']);
const failures = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(file);
      continue;
    }
    if (!extensions.has(entry.name.slice(entry.name.lastIndexOf('.'))) || entry.name.endsWith('.spec.ts')) continue;
    const text = await readFile(file, 'utf8');
    const found = signatures.filter((signature) => text.includes(signature));
    if (found.length) failures.push(`${relative(repositoryRoot, file)}: ${found.join(', ')}`);
  }
}

await visit(root);
if (failures.length) {
  console.error('Mojibake detected in production frontend source:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Frontend production source encoding check passed.');
}
