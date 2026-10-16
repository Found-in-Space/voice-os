export type VoiceState = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
export type VoiceReason = 'disabled' | 'connecting' | 'ready' | 'hearing' | 'response' | 'tools' | 'greeting' | 'playback' | 'failure';
export type VoiceTurnMode = 'automatic' | 'coordinated';
export interface VoiceStatus {
    readonly state: VoiceState;
    readonly reason: VoiceReason;
    readonly error: string | null;
    readonly playback: 'idle' | 'playing' | 'blocked';
}
export interface VoiceToolContract {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
}
export interface VoiceToolContext {
    readonly signal: AbortSignal;
    readonly sessionId: number;
    readonly responseId: string;
    readonly callId: string;
}
export interface VoiceToolBinding {
    readonly contract: VoiceToolContract;
    readonly execute: (argumentsValue: unknown, context: VoiceToolContext) => unknown | Promise<unknown>;
}
export type VoiceToolHandlers<Contracts extends readonly VoiceToolContract[]> = {
    readonly [Name in Contracts[number]['name']]: (value: unknown, context: VoiceToolContext) => unknown | Promise<unknown>;
};
export interface VoiceToolCall {
    readonly id: string;
    readonly name: string;
    readonly arguments: string;
}
export interface VoiceApplicationEvent {
    readonly id: string;
    readonly type: string;
    readonly occurredAt: string;
    readonly delivery: 'immediate' | 'next-turn';
    readonly speech: 'silent' | 'proactive';
    readonly data: unknown;
    readonly dedupeKey?: string;
    readonly expiresAt?: string;
}
export interface VoiceStateSource<T = unknown> {
    readonly key: string;
    snapshot(signal: AbortSignal): T | Promise<T>;
    hasMateriallyChanged?(previous: T, next: T): boolean;
}
export interface VoiceContextSnapshot {
    readonly version: number;
    readonly capturedAt: string;
    readonly sources: Readonly<Record<string, unknown>>;
}
export type VoiceTransportEvent = {
    type: 'ready';
} | {
    type: 'speech-start';
} | {
    type: 'speech-stop';
} | {
    type: 'user-turn-committed';
} | {
    type: 'response-start';
    id: string;
} | {
    type: 'response-done';
    id: string;
    status: string;
    error?: string;
    calls: readonly VoiceToolCall[];
} | {
    type: 'playback-start';
} | {
    type: 'playback-stop';
} | {
    type: 'playback-blocked';
    error?: string;
} | {
    type: 'playback-resumed';
} | {
    type: 'error';
    message: string;
} | {
    type: 'closed';
    message: string;
};
export interface VoiceConnection {
    requestResponse(instructions?: string): boolean;
    sendToolResult(callId: string, result: unknown): boolean;
    replaceContext(snapshot: VoiceContextSnapshot, signal: AbortSignal): Promise<void>;
    publishEvent(event: VoiceApplicationEvent, signal: AbortSignal): Promise<void>;
    resumePlayback?(): Promise<void>;
    close(): void | Promise<void>;
}
export interface VoiceTransport {
    connect(options: {
        signal: AbortSignal;
        tools: readonly VoiceToolContract[];
        turnMode: VoiceTurnMode;
        emit(event: VoiceTransportEvent): Promise<void>;
    }): Promise<VoiceConnection>;
}
export interface VoiceSnapshot extends VoiceStatus {
    readonly active: boolean;
    readonly disposed: boolean;
    readonly sessionId: number | null;
    readonly responseCount: number;
    readonly toolCount: number;
    readonly contextVersion: number;
    readonly pendingEvents: number;
    readonly turnMode: VoiceTurnMode;
}
export interface VoiceRuntimeOptions {
    readonly transport: VoiceTransport;
    readonly tools?: readonly VoiceToolBinding[];
    readonly stateSources?: readonly VoiceStateSource[];
    readonly turnMode?: VoiceTurnMode;
    readonly greetingInstructions?: string;
    readonly allowProactive?: boolean;
}
export interface VoiceRuntime {
    readonly active: boolean;
    enable(): Promise<void>;
    disable(): void;
    toggle(): Promise<void>;
    dispose(): Promise<void>;
    subscribe(listener: (snapshot: VoiceSnapshot) => void): () => void;
    getSnapshot(): VoiceSnapshot;
    markStateDirty(key: string): void;
    publishEvent(event: VoiceApplicationEvent): Promise<void>;
    resumePlayback(): Promise<void>;
}
