export interface VoiceAudioHost {
    setStream(stream: MediaStream | null, onBlocked: (error: unknown) => void): void;
    resume(): Promise<boolean>;
    dispose(): void;
}
export interface BrowserVoiceAudioOptions {
    element?: HTMLAudioElement;
    host?: HTMLElement;
    onState?: (state: 'off' | 'starting' | 'playing' | 'blocked') => void;
}
/** Audio elements are created lazily; a supplied element remains caller owned. */
export function createBrowserVoiceAudio(options: BrowserVoiceAudioOptions = {}): VoiceAudioHost {
    let element = options.element;
    let onBlocked: (error: unknown) => void = () => undefined;
    let revision = 0;
    async function resume() {
        const at = revision;
        if (!element?.srcObject)
            return false;
        try {
            await element.play();
            if (at === revision) {
                options.onState?.('playing');
                return true;
            }
        }
        catch (error) {
            if (at === revision) {
                options.onState?.('blocked');
                onBlocked(error);
            }
        }
        return false;
    }
    function clear() {
        revision++;
        if (element) {
            element.pause();
            element.srcObject = null;
        }
        options.onState?.('off');
    }
    return {
        setStream(stream, blocked) {
            onBlocked = blocked;
            if (!stream) {
                clear();
                return;
            }
            if (!element) {
                element = document.createElement('audio');
                element.hidden = true;
                element.autoplay = true;
                element.setAttribute('playsinline', '');
                (options.host ?? document.body).append(element);
            }
            revision++;
            element.srcObject = stream;
            options.onState?.('starting');
            void resume();
        },
        resume,
        dispose() { clear(); if (!options.element) {
            element?.remove();
            element = undefined;
        } },
    };
}
