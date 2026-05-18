/**
 * Anthropic Provider — 真实接入 @anthropic-ai/sdk
 *
 * route():用 tool_use 强制 AI 输出结构化 RouterDecision
 * chat():用 messages.stream 流式调用,转换为 ChatStreamEvent 序列
 *
 * 失败时向上抛错;由 createAIRouter 的 catch + fallback 兜底降级到 general-chat。
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
} from '../types.js';
import type {
  RouterInput,
  RouterDecision,
} from '../../../shared/skill.js';
import {
  DEEPSEEK_THINKING_DISABLED,
  isDeepSeekBaseURL,
  shouldOmitDeepSeekToolChoice,
  type DeepSeekThinkingDisabled,
} from './deepseek.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

const ROUTE_TOOL_NAME = 'route_to_skill';

const routeDecisionSchema = z.object({
  skillName: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly disableThinkingForRoute: boolean;
  private readonly omitToolChoice: boolean;

  constructor(opts: AnthropicProviderOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === '') {
      throw new Error('AnthropicProvider 需要非空 apiKey');
    }
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
    this.model = opts.model ?? 'claude-sonnet-4-6';
    this.disableThinkingForRoute = isDeepSeekBaseURL(opts.baseURL);
    this.omitToolChoice = shouldOmitDeepSeekToolChoice(opts.baseURL);
  }

  async route(
    input: RouterInput,
    signal?: AbortSignal
  ): Promise<RouterDecision> {
    const system = buildRouteSystemPrompt(input);
    const userMessage = input.userText.trim().length > 0
      ? input.userText
      : '(用户未输入文本,请基于当前学习态判断意图)';

    const routeParams: Anthropic.MessageCreateParamsNonStreaming &
      Partial<DeepSeekThinkingDisabled> = {
      model: this.model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: ROUTE_TOOL_NAME,
          description:
            '从 availableSkills 中选择一个 Skill,并给出参数、置信度与简短原因。',
          input_schema: {
            type: 'object',
            properties: {
              skillName: {
                type: 'string',
                enum: input.availableSkills,
                description: '选中的 Skill 名',
              },
              params: {
                type: 'object',
                additionalProperties: true,
                description: '传给 Skill 的参数,可空对象',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: '0-1 决策置信度',
              },
              rationale: {
                type: 'string',
                description: '一句话说明为何选这个 Skill',
              },
            },
            required: ['skillName', 'params', 'confidence', 'rationale'],
          },
        },
      ],
      tool_choice: this.omitToolChoice
        ? undefined
        : { type: 'tool', name: ROUTE_TOOL_NAME },
    };
    if (this.disableThinkingForRoute) {
      routeParams.thinking = DEEPSEEK_THINKING_DISABLED.thinking;
    }

    const response = await this.client.messages.create(routeParams, {
      signal,
    });

    const toolUseBlock = response.content.find(
      (b): b is { type: 'tool_use'; name: string; input: unknown; id: string } =>
        b.type === 'tool_use' && b.name === ROUTE_TOOL_NAME
    );
    if (!toolUseBlock) {
      throw new Error(
        `AnthropicProvider.route: 未在响应中找到 tool_use(${ROUTE_TOOL_NAME})`
      );
    }
    const parsed = routeDecisionSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      throw new Error(
        `AnthropicProvider.route: tool input 校验失败 ${parsed.error.message}`
      );
    }
    return parsed.data;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const toolChoice = toAnthropicToolChoice(req.toolChoice, {
      omitToolChoice: this.omitToolChoice,
    });
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: req.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        tool_choice: toolChoice,
      } as Anthropic.MessageStreamParams,
      { signal: req.signal }
    );

    // 跟踪每个 content block 的累积状态
    interface ToolBlockState {
      kind: 'tool_use';
      name: string;
      partialJson: string;
    }
    interface TextBlockState {
      kind: 'text';
    }
    type BlockState = TextBlockState | ToolBlockState;
    const blocks = new Map<number, BlockState>();
    let stopReason = 'unknown';

    try {
      for await (const ev of stream) {
        if (ev.type === 'content_block_start') {
          if (ev.content_block.type === 'text') {
            blocks.set(ev.index, { kind: 'text' });
          } else if (ev.content_block.type === 'tool_use') {
            blocks.set(ev.index, {
              kind: 'tool_use',
              name: ev.content_block.name,
              partialJson: '',
            });
          }
        } else if (ev.type === 'content_block_delta') {
          const state = blocks.get(ev.index);
          if (!state) continue;
          if (state.kind === 'text' && ev.delta.type === 'text_delta') {
            yield { type: 'text-delta', text: ev.delta.text };
          } else if (
            state.kind === 'tool_use' &&
            ev.delta.type === 'input_json_delta'
          ) {
            state.partialJson += ev.delta.partial_json;
          }
        } else if (ev.type === 'content_block_stop') {
          const state = blocks.get(ev.index);
          if (state?.kind === 'tool_use') {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = state.partialJson
                ? (JSON.parse(state.partialJson) as Record<string, unknown>)
                : {};
            } catch (e) {
              console.warn(
                '[AnthropicProvider.chat] tool_use input JSON.parse 失败',
                e
              );
            }
            yield {
              type: 'tool-use',
              toolName: state.name,
              input: parsedInput,
            };
          }
          blocks.delete(ev.index);
        } else if (ev.type === 'message_delta') {
          if (ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
        } else if (ev.type === 'message_stop') {
          // 流末尾,用 message_delta 累积的 stop_reason
        }
      }
    } catch (e) {
      // 上抛由调用方决定如何降级
      throw e;
    }

    yield { type: 'message-stop', stopReason };
  }
}

export function toAnthropicToolChoice(
  toolChoice: ChatRequest['toolChoice'],
  opts: { omitToolChoice?: boolean } = {}
): Anthropic.ToolChoice | undefined {
  if (opts.omitToolChoice) return undefined;
  if (toolChoice === undefined) return undefined;
  if (toolChoice === 'auto') return { type: 'auto' };
  return { type: 'tool', name: toolChoice.name };
}

function buildRouteSystemPrompt(input: RouterInput): string {
  return [
    '你是 Echora 的 AI 路由器。根据用户输入与当前学习态,从 availableSkills 选择最合适的 Skill。',
    '',
    `当前学习态:${input.currentLearningState}`,
    `可选 Skill:${input.availableSkills.join(', ')}`,
    input.profile ? `用户画像摘要:${JSON.stringify(input.profile)}` : '用户画像:未知',
    input.recentMessagesSummary
      ? `近况:${input.recentMessagesSummary}`
      : '',
    '',
    '决策原则:',
    '- onboarding 学习态下优先选 onboarding Skill',
    '- practicing/grading 期间不要降级到 general-chat',
    '- 用户主动要求复盘/换场景/重练时,选对应 Skill',
    '- 无明确意图时回 general-chat',
    '',
    '必须通过 route_to_skill 工具调用回应,不要直接输出文字。',
  ]
    .filter(Boolean)
    .join('\n');
}
