#!/usr/bin/env node
// Publish a compiled preview without removing chunks used by open browser players.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const web = path.resolve(__dirname, '../web');
const build = path.join(web, 'build');
const staging = path.join(build, '.preview');
const result = spawnSync('yarn', ['build'], {
  cwd: web, stdio: 'inherit',
  env: { ...process.env, BUILD_PATH: 'build/.preview', GENERATE_SOURCEMAP: 'false',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --openssl-legacy-provider`.trim() },
});
if (result.status !== 0) process.exit(result.status || 1);
const entrypoints = ['asset-manifest.json', 'index.html'];
for (const entry of fs.readdirSync(staging)) if (!entrypoints.includes(entry))
  fs.cpSync(path.join(staging, entry), path.join(build, entry), { recursive: true });
for (const entry of entrypoints) {
  const temporary = path.join(build, `${entry}.publishing`);
  fs.copyFileSync(path.join(staging, entry), temporary);
  fs.renameSync(temporary, path.join(build, entry));
}
fs.rmSync(staging, { recursive: true, force: true });
console.log('Preview published; existing media sessions and browser chunks are preserved.');
