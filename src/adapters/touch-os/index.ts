import { createButton } from '@found-in-space/touch-os/components';
import type { RuntimeOutput, DisplayNode } from '@found-in-space/touch-os';
import type { VoiceRuntime, VoiceSnapshot } from '../../types.js';
/** Host renders the returned node and routes its outputs through handleOutput. */
export function createVoiceTouchOsBinding(options: {
    voice: VoiceRuntime;
    id: string;
    label?: (snapshot: VoiceSnapshot) => string;
}) {
    const actionId = `${options.id}.toggleVoice`;
    return {
        createNode(): DisplayNode {
            const snapshot = options.voice.getSnapshot();
            return createButton(options.id, {
                label: options.label?.(snapshot) ?? (snapshot.playback === 'blocked' ? 'Enable audio' : snapshot.active ? 'Disable voice' : 'Enable voice'),
                actionId, disabled: snapshot.disposed,
            });
        },
        handleOutput(output: RuntimeOutput): boolean {
            if (output.type !== 'action' || output.actionId !== actionId)
                return false;
            if (options.voice.getSnapshot().playback === 'blocked')
                void options.voice.resumePlayback();
            else
                void options.voice.toggle();
            return true;
        },
        subscribe(invalidate: () => void) { return options.voice.subscribe(() => invalidate()); },
    };
}
