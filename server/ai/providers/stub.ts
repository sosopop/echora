/**
 * Stub Provider — 默认 AI Provider,零外部依赖
 *
 * route() 固定返回 general-chat decision,具体业务由各 Skill stub 自产 SkillEvent。
 * 用于本地开发与未来 Provider 异常的兜底。
 */

import type { AIProvider } from '../types.js';
import type {
  RouterInput,
  RouterDecision,
} from '../../../shared/skill.js';
import type { ChatRequest, ChatStreamEvent } from '../types.js';
import { SKILL_NAMES } from '../../../shared/skill.js';

export class StubProvider implements AIProvider {
  readonly name = 'stub';

  async route(
    _input: RouterInput,
    signal?: AbortSignal
  ): Promise<RouterDecision> {
    throwIfAborted(signal);
    return {
      skillName: SKILL_NAMES.generalChat,
      params: {},
      confidence: 0.6,
      rationale: 'stub provider 默认路由',
    };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
    throwIfAborted(req.signal);
    const userText = req.messages.at(-1)?.content.trim() ?? '';
    if (userText) {
      yield {
        type: 'text-delta',
        text: buildSmallTalkReply(userText),
      };
      yield { type: 'message-stop', stopReason: 'end_turn' };
      return;
    }

    yield {
      type: 'text-delta',
      text: '我在。你可以直接说想练什么,或者点“开始练习”“换场景”。',
    };
    yield { type: 'message-stop', stopReason: 'end_turn' };
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  throw error;
}

function buildSmallTalkReply(userText: string): string {
  if (/练习|scene|场景|换一批|复盘|重练|review|practice/i.test(userText)) {
    return '可以,我们可以继续学英语。你可以说“开始练习”或“换场景”。';
  }
  if (/hello|hi|hey|你好|在吗|聊聊/i.test(userText)) {
    return '在的。你想先练口语、看复盘,还是换个新场景?';
  }
  return `我听到了“${userText}”。如果你想继续学习,可以直接说“开始练习”或者“换场景”。`;
}
