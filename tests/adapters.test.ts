import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from '@found-in-space/touch-os';
import { createVoiceRuntime } from '../src/index.js';
import { createVoiceTouchOsBinding } from '../src/adapters/touch-os/index.js';
import { bindVoiceButton, createBrowserVoiceAudio } from '../src/browser/index.js';
import { createTransportHarness } from './harness.js';

class Button extends EventTarget {
  disabled = false;
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
}

describe('optional host adapters', () => {
  it('routes a DOM button and tears down its subscription and handler', async () => {
    const h = createTransportHarness(), voice = createVoiceRuntime({ transport: h.transport });
    const button = new Button();
    const detach = bindVoiceButton({ voice, button: button as unknown as HTMLButtonElement });
    button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(voice.active).toBe(true));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await voice.dispose(); expect(button.disabled).toBe(true);
    detach(); expect(button.disabled).toBe(false); expect(button.getAttribute('aria-pressed')).toBeNull();
    button.dispatchEvent(new Event('click')); expect(h.sessions).toHaveLength(1);
  });
  it('routes actual TouchOS runtime output through the same voice handle', async () => {
    const h = createTransportHarness(), voice = createVoiceRuntime({ transport: h.transport });
    const binding = createVoiceTouchOsBinding({ voice, id: 'voice' });
    const panel = createRuntime({ root: binding.createNode(), surface: { width: 240, height: 100 } });
    panel.render();
    panel.dispatchInput({ type: 'pointer-down', surfaceX: 10, surfaceY: 10, timestamp: 1 });
    panel.dispatchInput({ type: 'pointer-up', surfaceX: 10, surfaceY: 10, timestamp: 2 });
    const routed = panel.takeOutputs().some(output => binding.handleOutput(output));
    expect(routed).toBe(true);
    await vi.waitFor(() => expect(voice.active).toBe(true));
    panel.dispose(); await voice.dispose();
  });
  it('reports blocked playback, recovers on a gesture, and preserves borrowed elements', async () => {
    const states: string[] = [], blocked = vi.fn(), remove = vi.fn();
    const play = vi.fn().mockRejectedValueOnce(new Error('gesture required')).mockResolvedValue(undefined);
    const element = { srcObject: null, play, pause: vi.fn(), remove } as unknown as HTMLAudioElement;
    const audio = createBrowserVoiceAudio({ element, onState: state => states.push(state) });
    audio.setStream({} as MediaStream, blocked);
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledOnce()); expect(states.at(-1)).toBe('blocked');
    expect(await audio.resume()).toBe(true); expect(states.at(-1)).toBe('playing');
    audio.dispose(); expect(element.srcObject).toBeNull(); expect(remove).not.toHaveBeenCalled();
  });
});
