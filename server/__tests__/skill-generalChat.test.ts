/**
 * general-chat skill 单测
 *
 *   - 默认低风险闲聊仍输出自然文本
 *   - intentConfirm 参数 → 输出 intent-confirm widget
 */

import { describe, it, expect } from '@jest/globals';
import { generalChatSkill } from '../skills/generalChat.js';
import type { ServerSkillContext } from '../skills/types.js';
import type { AIProvider } from '../ai/types.js';
import type { SkillEventInput } from '../../shared/skill.js';

const provider: AIProvider = {
  name: 'general-chat-test',
  async route() {
    throw new Error('not used');
  },
};

function makeCtx(params: Record<string, unknown> = {}): ServerSkillContext {
  return {
    user: { id: 1, email: 'g@test.com' },
    conversationId: 1,
    messageId: 1,
    streamId: 'general-chat-stream',
    params,
    learningState: 'scene_selecting',
    signal: new AbortController().signal,
    provider,
    db: {} as ServerSkillContext['db'],
    emit() {},
    makeWidgetId(p) {
      return `${p}-test`;
    },
  };
}

async function collect(
  params: Record<string, unknown> = {}
): Promise<SkillEventInput[]> {
  const out: SkillEventInput[] = [];
  for await (const ev of generalChatSkill.handler(makeCtx(params))) {
    out.push(ev);
  }
  return out;
}

describe('general-chat skill', () => {
  it('默认输出低风险闲聊提示', async () => {
    const events = await collect();
    const text = events
      .filter((ev) => ev.type === 'text-chunk')
      .map((ev) => ev.payload.text)
      .join('');

    expect(text).toContain('开始练习');
    expect(events.some((ev) => ev.type === 'widget-init')).toBe(false);
  });

  it('intentConfirm 参数输出 intent-confirm widget', async () => {
    const events = await collect({
      intentConfirm: {
        question: '你想让我怎么处理?',
        prompt: '换一个',
        choices: [
          {
            id: 'new-scenes',
            title: '换一批场景',
            desc: '重新生成场景',
            action: 'action:request-new-scenes',
          },
          {
            id: 'review',
            title: '看复盘',
            desc: '查看总结',
            action: 'text:复盘',
          },
        ],
      },
    });
    const ready = events.find((ev) => ev.type === 'widget-ready');

    expect(
      events
        .filter((ev) => ev.type === 'text-chunk')
        .map((ev) => ev.payload.text)
        .join('')
    ).toContain('换一个');
    expect(ready?.payload.patch).toMatchObject({
      status: 'ready',
      data: {
        question: '你想让我怎么处理?',
        choices: [
          { id: 'new-scenes', title: '换一批场景' },
          { id: 'review', title: '看复盘' },
        ],
      },
    });
  });
});
