import { bindVoiceTools, createVoiceRuntime } from '@found-in-space/voice-os';
import { createOpenAIRealtimeTransport } from '@found-in-space/voice-os/openai';
import { bindVoiceButton } from '@found-in-space/voice-os/browser';
import { tools } from './contracts.js';

let scale = 1;
const voice = createVoiceRuntime({
  transport: createOpenAIRealtimeTransport({ sessionEndpoint: '/api/voice/session', profile: 'minimal' }),
  greetingInstructions: 'Briefly invite the user to change the scale. Do not call tools in the greeting.',
  tools: bindVoiceTools(tools, {
    set_scale({ scale: requested }) {
      scale = requested;
      document.querySelector('#scale').textContent = String(scale);
      return { status: 'completed', scale };
    },
  }),
});
const detach = bindVoiceButton({ voice, button: document.querySelector('#voice'), status: document.querySelector('#status') });
window.addEventListener('pagehide', () => { detach(); void voice.dispose(); }, { once: true });
