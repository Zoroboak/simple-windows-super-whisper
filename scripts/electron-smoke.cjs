// Launch the actual Electron main/renderer without pausing AudioWorklet debugger targets.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alex-native-qa-'));
const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
const child = spawn(require('electron'), [path.resolve('qa-electron.cjs'), '--no-sandbox',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'], {
  env: { ...process.env, ALEX_QA: '1', ALEX_QA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', data => process.stdout.write(data));
child.stderr.on('data', data => { process.stderr.write(data); fs.appendFileSync(path.join(output, 'electron-stderr.log'), data); });
const timer = setTimeout(() => { console.error('Native Electron smoke exceeded 90 seconds.'); child.kill('SIGKILL'); }, 90000);
child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); fs.rmSync(dir, { recursive: true, force: true }); process.exitCode = code === 0 ? 0 : 1; });
