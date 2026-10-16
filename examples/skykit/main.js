import { createSkykitBrowser } from '@found-in-space/skykit/browser';
import { createSkykitNavigationPlugin, createRaDecLookAt, SKYKIT_ACTIONS } from '@found-in-space/skykit';
import { bindVoiceTools, createVoiceRuntime } from '@found-in-space/voice-os';
import { createOpenAIRealtimeTransport } from '@found-in-space/voice-os/openai';
import { bindVoiceButton } from '@found-in-space/voice-os/browser';
import { tools } from './contracts.js';

const browser = await createSkykitBrowser({ host: '#viewer' });
await browser.install(createSkykitNavigationPlugin());
const voice = createVoiceRuntime({
  transport: createOpenAIRealtimeTransport({ sessionEndpoint: '/api/voice/session', profile: 'skykit' }),
  tools: bindVoiceTools(tools, {
    get_view: () => browser.viewer.getViewState(),
    async look_at({ right_ascension_degrees: ra, declination_degrees: dec }) {
      await browser.viewer.actions.invoke(SKYKIT_ACTIONS.navigation.transitionTo, { lookAt: createRaDecLookAt(ra, dec), durationSecs: 2 });
      return { status: 'accepted', target: { rightAscensionDegrees: ra, declinationDegrees: dec }, view: browser.viewer.getViewState() };
    },
  }),
});
const detach = bindVoiceButton({ voice, button: document.querySelector('#voice'), status: document.querySelector('#status') });
window.addEventListener('pagehide', () => { detach(); void voice.dispose(); void browser.dispose(); }, { once: true });
