const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../../');
const result = spawnSync('npx', ['vitest', 'run', 'src/app/core/renderer/benchmark/renderer-benchmark-heavy.spec.ts', '--reporter=verbose'], {
  cwd: root,
  env: { ...process.env, RENDERER_BENCHMARK: '1' },
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
