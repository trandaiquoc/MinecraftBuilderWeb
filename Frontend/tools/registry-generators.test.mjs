import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.dirname(toolsDirectory);
const expectedOrder = [
  'minecraft:a-b',
  'minecraft:a.b',
  'minecraft:a/b',
  'minecraft:a_b',
  'minecraft:aa',
];

async function runGenerator(scriptName, report, locale) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'minecraftbuilder-registry-'));
  try {
    const input = path.join(directory, 'report.json');
    const output = path.join(directory, 'registry.json');
    await writeFile(input, JSON.stringify(report));
    const result = spawnSync(
      process.execPath,
      [path.join(toolsDirectory, scriptName), input, output],
      { cwd: rootDirectory, encoding: 'utf8', env: { ...process.env, LC_ALL: locale } },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return await readFile(output, 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('block registry generation uses locale-independent ordering', async () => {
  const report = Object.fromEntries(
    [...expectedOrder].reverse().map((id) => [
      id,
      {
        properties: { a_b: ['true', 'false'], 'a-b': ['true', 'false'] },
        states: [{ default: true, properties: { a_b: 'true', 'a-b': 'false' } }],
      },
    ]),
  );
  const english = await runGenerator('generate-vanilla-block-registry.mjs', report, 'en_US.UTF-8');
  const turkish = await runGenerator('generate-vanilla-block-registry.mjs', report, 'tr_TR.UTF-8');

  assert.equal(english, turkish);
  const blocks = JSON.parse(english).blocks;
  assert.deepEqual(
    blocks.map((block) => block.id),
    expectedOrder,
  );
  assert.deepEqual(
    blocks[0].properties.map((property) => property.name),
    ['a-b', 'a_b'],
  );
});

test('item registry generation uses locale-independent ordering', async () => {
  const report = Object.fromEntries([...expectedOrder].reverse().map((id) => [id, {}]));
  const english = await runGenerator('generate-vanilla-item-registry.mjs', report, 'en_US.UTF-8');
  const turkish = await runGenerator('generate-vanilla-item-registry.mjs', report, 'tr_TR.UTF-8');

  assert.equal(english, turkish);
  assert.deepEqual(
    JSON.parse(english).items.map((item) => item.id),
    expectedOrder,
  );
});
