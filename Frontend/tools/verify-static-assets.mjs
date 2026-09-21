import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const staticRoots = ['public', 'dist'].map((directory) => join(root, directory));
const jars = staticRoots.flatMap((directory) => existsSync(directory) ? findJars(directory) : []);
if (jars.length) throw new Error(`Raw Minecraft JAR found in static output: ${jars.join(', ')}`);
console.log('Verified that public and dist contain no raw Minecraft JAR.');

function findJars(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findJars(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.jar') ? [path] : [];
  });
}
