import AjvModule, { type JSONSchemaType, type ValidateFunction } from 'ajv';
import type { VoiceToolBinding, VoiceToolContext, VoiceToolContract, VoiceToolHandlers } from './types.js';
/** Share these serializable declarations with the server's approved profile. */
export function bindVoiceTools<const Contracts extends readonly VoiceToolContract[]>(contracts: Contracts, handlers: VoiceToolHandlers<Contracts>): VoiceToolBinding[] {
    const implementations = handlers as Readonly<Record<string, (value: unknown, context: VoiceToolContext) => unknown | Promise<unknown>>>;
    const names = new Set(contracts.map(contract => contract.name));
    if (names.size !== contracts.length)
        throw new Error('Duplicate voice tool name.');
    for (const name of names)
        if (typeof implementations[name] !== 'function')
            throw new Error(`Missing voice tool handler: ${name}`);
    for (const name of Object.keys(handlers))
        if (!names.has(name))
            throw new Error(`Undeclared voice tool handler: ${name}`);
    return contracts.map(contract => ({ contract, execute: implementations[contract.name]! }));
}
/** JSONSchemaType checks typed declarations; Ajv performs runtime validation. */
export function defineVoiceTool<T>(options: {
    name: string;
    description: string;
    parameters: JSONSchemaType<T>;
    execute(value: T, context: VoiceToolContext): unknown | Promise<unknown>;
}): VoiceToolBinding {
    return {
        contract: { name: options.name, description: options.description, parameters: options.parameters as Record<string, unknown> },
        execute: (value, context) => options.execute(value as T, context),
    };
}
export function createToolExecutor(bindings: readonly VoiceToolBinding[]) {
    const ajv = new AjvModule.default({ strict: false, allErrors: true });
    const tools = new Map<string, {
        binding: VoiceToolBinding;
        validate: ValidateFunction;
    }>();
    for (const binding of bindings) {
        if (tools.has(binding.contract.name))
            throw new Error(`Duplicate voice tool: ${binding.contract.name}`);
        tools.set(binding.contract.name, { binding, validate: ajv.compile(binding.contract.parameters) });
    }
    return async (name: string, argumentsText: string, context: VoiceToolContext): Promise<unknown> => {
        const tool = tools.get(name);
        if (!tool)
            return { error: { code: 'unknown_tool', message: `Unknown tool: ${name}` } };
        try {
            context.signal.throwIfAborted();
            const args: unknown = JSON.parse(argumentsText);
            if (!tool.validate(args))
                return { error: { code: 'invalid_arguments', message: ajv.errorsText(tool.validate.errors) } };
            const result = (await tool.binding.execute(args, context)) ?? null;
            JSON.stringify(result);
            return result;
        }
        catch (error) {
            return { error: { code: context.signal.aborted ? 'cancelled' : 'tool_failed', message: errorMessage(error) } };
        }
    };
}
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
