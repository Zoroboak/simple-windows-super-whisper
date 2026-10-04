// Launch the actual Electron main/renderer without pausing AudioWorklet debugger targets.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-native-qa-'));
const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
const appDir = path.join(dir, 'app'), dataDir = path.join(dir, 'data');
fs.mkdirSync(appDir); fs.mkdirSync(dataDir);
// A normal app directory ensures Electron uses package version metadata, unlike a bare script.
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'alex-dictate-qa',
  version: require('../package.json').version, main: path.resolve('qa-electron.cjs') }));
const child = spawn(require('electron'), [appDir, '--no-sandbox',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], {
  env: { ...process.env, ALEX_QA: '1', ALEX_QA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', data => process.stdout.write(data));
child.stderr.on('data', data => { process.stderr.write(data); fs.appendFileSync(path.join(output, 'electron-stderr.log'), data); });
const timer = setTimeout(() => { console.error('Native Electron smoke exceeded 90 seconds.'); child.kill('SIGKILL'); }, 90000);
child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); fs.rmSync(dir, { recursive: true, force: true }); process.exitCode = code === 0 ? 0 : 1; });
