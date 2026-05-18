import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
  DebugContext,
} from './types.js';
import type { DebugLogger } from '../utils/debugLog.js';
import { debugFromContext, sanitizeForDebugLog } from '../utils/debugLog.js';

export async function* debugProviderChat(
  provider: AIProvider,
  req: ChatRequest,
  logDebug: DebugLogger | undefined,
  debug: DebugContext
): AsyncIterable<ChatStreamEvent> {
  if (!provider.chat) {
    throw new Error('Provider does not support chat()');
  }

  const startedAt = Date.now();
  const context = debugFromContext(debug);
  logDebug?.({
    level: 'debug',
    type: 'ai_chat_input',
    ...context,
    provider: provider.name,
    request: sanitizeForDebugLog({
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      toolChoice: req.toolChoice,
      maxTokens: req.maxTokens,
    }),
  });

  let text = '';
  const toolUses: Array<{ toolName: string; input: Record<string, unknown> }> = [];
  try {
    for await (const ev of provider.chat({ ...req, debug })) {
      if (ev.type === 'text-delta') text += ev.text;
      if (ev.type === 'tool-use') {
        toolUses.push({ toolName: ev.toolName, input: ev.input });
      }
      logDebug?.({
        level: 'debug',
        type: 'ai_chat_event',
        ...context,
        provider: provider.name,
        event: sanitizeForDebugLog(ev),
      });
      yield ev;
    }
    logDebug?.({
      level: 'debug',
      type: 'ai_chat_output',
      ...context,
      provider: provider.name,
      durationMs: Date.now() - startedAt,
      text: sanitizeForDebugLog(text),
      toolUses: sanitizeForDebugLog(toolUses),
    });
  } catch (e) {
    logDebug?.({
      level: 'error',
      type: 'ai_chat_error',
      ...context,
      provider: provider.name,
      durationMs: Date.now() - startedAt,
      error: sanitizeForDebugLog(e),
    });
    throw e;
  }
}
