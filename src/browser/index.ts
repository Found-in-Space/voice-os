import type { VoiceRuntime, VoiceSnapshot } from '../types.js';
export { createBrowserVoiceAudio } from './audio.js';
export type { VoiceAudioHost, BrowserVoiceAudioOptions } from './audio.js';
export function bindVoiceButton(options: {
    voice: VoiceRuntime;
    button: HTMLButtonElement;
    status?: HTMLElement;
    formatStatus?: (snapshot: VoiceSnapshot) => string;
}) {
    const { voice, button } = options;
    const previousPressed = button.getAttribute('aria-pressed');
    const previousDisabled = button.disabled;
    const click = () => { if (voice.getSnapshot().playback === 'blocked')
        void voice.resumePlayback();
    else
        void voice.toggle(); };
    button.addEventListener('click', click);
    const unsubscribe = voice.subscribe(snapshot => {
        button.setAttribute('aria-pressed', String(snapshot.active));
        button.disabled = snapshot.disposed;
        if (options.status)
            options.status.textContent = options.formatStatus?.(snapshot) ?? snapshot.error ?? snapshot.state;
    });
    return () => {
        unsubscribe();
        button.removeEventListener('click', click);
        button.disabled = previousDisabled;
        if (previousPressed === null)
            button.removeAttribute('aria-pressed');
        else
            button.setAttribute('aria-pressed', previousPressed);
    };
}
