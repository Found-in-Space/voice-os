import { mkdtemp, writeFile, readFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), 'voice-os-package-'));
const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', consumer], { cwd: root, encoding: 'utf8' }))[0];
for (const file of packed.files) {
  if (file.path.includes('.env') || file.path.includes('node_modules/') || file.path.startsWith('src/')) throw new Error(`Unexpected packed file: ${file.path}`);
}
const archive = join(consumer, packed.filename);
await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
  '@found-in-space/voice-os': `file:${archive}`, '@found-in-space/touch-os': '0.3.0', '@types/node': '22.18.6',
} }));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--fund=false'], { cwd: consumer, stdio: 'inherit' });
if ((await lstat(join(consumer, 'node_modules/@found-in-space/voice-os'))).isSymbolicLink()) throw new Error('External consumer must use packed contents.');
await writeFile(join(consumer, 'verify.mjs'), `
import assert from 'node:assert/strict';
import { createVoiceRuntime } from '@found-in-space/voice-os';
import { createOpenAIVoiceSessionHandler } from '@found-in-space/voice-os/server/openai';
import { createVoiceTouchOsBinding } from '@found-in-space/voice-os/touch-os';
assert.equal(typeof document, 'undefined');
let connects = 0;
const voice = createVoiceRuntime({ transport: { async connect() { connects++; throw new Error('offline'); } } });
assert.equal(connects, 0);
assert.equal(voice.getSnapshot().state, 'off');
assert.equal(typeof createOpenAIVoiceSessionHandler, 'function');
assert.equal(typeof createVoiceTouchOsBinding, 'function');
await voice.dispose();
`);
execFileSync(process.execPath, ['verify.mjs'], { cwd: consumer, stdio: 'pipe' });
await writeFile(join(consumer, 'types.ts'), `
import { createVoiceRuntime, type VoiceTransport } from '@found-in-space/voice-os';
import { createOpenAIVoiceSessionHandler } from '@found-in-space/voice-os/server/openai';
declare const transport: VoiceTransport;
const voice = createVoiceRuntime({ transport });
voice.subscribe(snapshot => { const active: boolean = snapshot.active; void active; });
void createOpenAIVoiceSessionHandler;
`);
execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--lib', 'ES2023', '--types', 'node', 'types.ts'], { cwd: consumer, stdio: 'pipe' });
await writeFile(join(consumer, 'browser.js'), `
import { createVoiceRuntime } from '@found-in-space/voice-os';
import { createOpenAIRealtimeTransport } from '@found-in-space/voice-os/openai';
import { bindVoiceButton } from '@found-in-space/voice-os/browser';
import { createVoiceTouchOsBinding } from '@found-in-space/voice-os/touch-os';
globalThis.fixture = { createVoiceRuntime, createOpenAIRealtimeTransport, bindVoiceButton, createVoiceTouchOsBinding };
`);
const bundled = await build({ entryPoints: [join(consumer, 'browser.js')], bundle: true, platform: 'browser', format: 'esm', outfile: join(consumer, 'bundle.js'), metafile: true });
if (Object.keys(bundled.metafile.inputs).some(path => path.includes('/server/openai/'))) throw new Error('Server code leaked into browser bundle.');
const metadata = JSON.parse(await readFile(join(consumer, 'node_modules/@found-in-space/voice-os/package.json'), 'utf8'));
for (const entry of Object.values(metadata.exports)) {
  await readFile(join(consumer, 'node_modules/@found-in-space/voice-os', entry.import));
  await readFile(join(consumer, 'node_modules/@found-in-space/voice-os', entry.types));
}
process.stdout.write(`Packed consumer verified: ${packed.filename}; Node imports, declarations, optional TouchOS and browser bundle.\n`);
