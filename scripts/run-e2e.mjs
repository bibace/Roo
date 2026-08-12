import { spawnSync } from 'node:child_process';

const target = process.argv[2];

if (target !== 'chrome' && target !== 'edge-target') {
  throw new Error('E2E target must be chrome or edge-target.');
}

const artifactTarget = target === 'edge-target' ? 'edge' : 'chrome';

const playwrightCommand = process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
const result = spawnSync(playwrightCommand, ['test', ...process.argv.slice(3)], {
  env: { ...process.env, ROO_E2E_ARTIFACT_TARGET: artifactTarget },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
