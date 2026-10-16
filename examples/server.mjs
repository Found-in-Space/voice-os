import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createOpenAIVoiceTokenMiddleware } from '@found-in-space/voice-os/server/openai';
import { tools as minimal } from './browser-minimal/contracts.js';
import { tools as skykit } from './skykit/contracts.js';

const configuration = {
  expires_after: { anchor: 'created_at', seconds: 600 },
  session: { type: 'realtime', model: 'gpt-realtime-2.1',
    instructions: 'You are a concise guide to this application. Use its tools for live state and commands. Never invent a successful application change.',
    audio: { input: { turn_detection: { type: 'server_vad' } }, output: { voice: 'marin' } },
    tool_choice: 'auto',
  },
};
const voice = createOpenAIVoiceTokenMiddleware({
  path: '/api/voice/session', apiKey: process.env.OPENAI_API_KEY,
  profiles: { minimal: { configuration, tools: minimal }, skykit: { configuration, tools: skykit } },
  authorize(request) {
    const origin = request.headers.get('origin');
    return !origin || origin === 'http://localhost:4188' || origin === 'http://127.0.0.1:4188';
  },
});
const routes = new Map([
  ['/', ['browser-minimal/index.html', 'text/html']],
  ['/main.js', ['browser-minimal/main.js', 'text/javascript']],
  ['/skykit/', ['skykit/index.html', 'text/html']],
  ['/skykit/main.js', ['skykit/main.js', 'text/javascript']],
]);
const server = createServer((request, response) => {
  void voice(request, response, () => {
    const route = routes.get(new URL(request.url ?? '/', 'http://local').pathname);
    if (!route) { response.writeHead(404).end(); return; }
    void readFile(new URL(`../.cache/examples/${route[0]}`, import.meta.url)).then(data => {
      response.setHeader('Content-Type', route[1]); response.end(data);
    }, () => response.writeHead(503).end('Run npm run example:build first.'));
  }).catch(() => response.writeHead(500).end('Example server failed.'));
});
server.listen(4188, '127.0.0.1', () => process.stdout.write('VoiceOS examples: http://127.0.0.1:4188\n'));
