const { spawnSync } = require('node:child_process');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const expoPackage = require.resolve('expo/package.json', { paths: [mobileRoot] });
const expoCli = path.join(path.dirname(expoPackage), 'bin', 'cli');
const mobileModules = path.join(mobileRoot, 'node_modules');
const nodePath = [mobileModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(process.execPath, [expoCli, ...process.argv.slice(2)], {
  cwd: mobileRoot,
  env: { ...process.env, NODE_PATH: nodePath },
  stdio: 'inherit',
});

if (result.error) {
  console.error('Unable to launch Expo:', result.error.message);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
