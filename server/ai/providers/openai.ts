/**
 * OpenAI Provider — 真实接入 openai SDK
 *
 * route():用 function calling 强制 AI 输出结构化 RouterDecision
 *   - 定义 route_to_skill function tool
 *   - tool_choice: { type: 'function', function: { name: 'route_to_skill' } }
 *   - 取 message.tool_calls[0].function.arguments(JSON 字符串)解析
 *
 * chat():用 chat.completions.create({ stream: true }) 流式
 *   - 转换 ChatCompletionChunk → ChatStreamEvent
 *   - delta.content → text-delta
 *   - delta.tool_calls[].function.arguments 增量累积 → 在 finish 时 emit tool-use
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type {
  AIProvider,
  ChatRequest,
  ChatStreamEvent,
  DebugContext,
} from '../types.js';
import type { RouterInput, RouterDecision } from '../../../shared/skill.js';
import {
  DEEPSEEK_THINKING_DISABLED,
  isDeepSeekBaseURL,
  shouldOmitDeepSeekToolChoice,
  type DeepSeekThinkingDisabled,
} from './deepseek.js';

export interface OpenAIProviderOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

const ROUTE_FUNCTION_NAME = 'route_to_skill';

const routeDecisionSchema = z.object({
  skillName: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly disableThinkingForRoute: boolean;
  private readonly omitToolChoice: boolean;

  constructor(opts: OpenAIProviderOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === '') {
      throw new Error('OpenAIProvider 需要非空 apiKey');
    }
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
    this.model = opts.model ?? 'gpt-4o-mini';
    this.disableThinkingForRoute = isDeepSeekBaseURL(opts.baseURL);
    this.omitToolChoice = shouldOmitDeepSeekToolChoice(opts.baseURL);
  }

  async route(
    input: RouterInput,
    signal?: AbortSignal,
    _debug?: DebugContext
  ): Promise<RouterDecision> {
    const system = buildRouteSystemPrompt(input);
    const userMessage =
      input.userText.trim().length > 0
        ? input.userText
        : '(用户未输入文本,请基于当前学习态判断意图)';

    const routeParams: OpenAI.ChatCompletionCreateParamsNonStreaming &
      Partial<DeepSeekThinkingDisabled> = {
      model: this.model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: ROUTE_FUNCTION_NAME,
            description:
              '从 availableSkills 中选择一个 Skill,并给出参数、置信度与简短原因。',
            parameters: {
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
        },
      ],
      tool_choice: this.omitToolChoice
        ? undefined
        : {
            type: 'function',
            function: { name: ROUTE_FUNCTION_NAME },
          },
    };
    if (this.disableThinkingForRoute) {
      routeParams.thinking = DEEPSEEK_THINKING_DISABLED.thinking;
    }

    const response = await this.client.chat.completions.create(routeParams, {
      signal,
    });

    const message = response.choices[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== ROUTE_FUNCTION_NAME) {
      throw new Error(
        `OpenAIProvider.route: 响应中未找到 tool_call(${ROUTE_FUNCTION_NAME})`
      );
    }
    let parsedArgs: unknown;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      throw new Error(
        `OpenAIProvider.route: tool_call arguments JSON.parse 失败: ${(e as Error).message}`
      );
    }
    const parsed = routeDecisionSchema.safeParse(parsedArgs);
    if (!parsed.success) {
      throw new Error(
        `OpenAIProvider.route: tool arguments 校验失败 ${parsed.error.message}`
      );
    }
    return parsed.data;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatStreamEvent> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const tools: OpenAI.ChatCompletionTool[] | undefined = req.tools?.map(
      (t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })
    );

    const toolChoice = toOpenAIToolChoice(req.toolChoice, {
      omitToolChoice: this.omitToolChoice,
    });

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        stream: true,
        messages,
        tools,
        tool_choice: toolChoice,
      },
      { signal: req.signal }
    );

    // 累积 tool call:OpenAI 用 index 标识同一个 tool call 的多个增量块
    interface ToolCallState {
      name: string;
      argsBuffer: string;
    }
    const toolCalls = new Map<number, ToolCallState>();
    let stopReason = 'unknown';

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        yield { type: 'text-delta', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              name: tc.function?.name ?? '',
              argsBuffer: '',
            });
          }
          const state = toolCalls.get(idx)!;
          if (tc.function?.name && !state.name) {
            state.name = tc.function.name;
          }
          if (tc.function?.arguments) {
            state.argsBuffer += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason) {
        stopReason = choice.finish_reason;
      }
    }

    // 流结束后一次性 emit tool-use
    for (const state of toolCalls.values()) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = state.argsBuffer
          ? (JSON.parse(state.argsBuffer) as Record<string, unknown>)
          : {};
      } catch (e) {
        console.warn(
          '[OpenAIProvider.chat] tool_call arguments JSON.parse 失败,跳过',
          e
        );
        continue;
      }
      yield { type: 'tool-use', toolName: state.name, input: parsedInput };
    }

    yield { type: 'message-stop', stopReason };
  }
}

export function toOpenAIToolChoice(
  toolChoice: ChatRequest['toolChoice'],
  opts: { omitToolChoice?: boolean } = {}
): OpenAI.ChatCompletionToolChoiceOption | undefined {
  if (opts.omitToolChoice) return undefined;
  if (toolChoice === undefined) return undefined;
  if (toolChoice === 'auto') return 'auto';
  return { type: 'function', function: { name: toolChoice.name } };
}

function buildRouteSystemPrompt(input: RouterInput): string {
  return [
    '你是 Echora 的 AI 路由器。根据用户输入与当前学习态,从 availableSkills 选择最合适的 Skill。',
    '',
    `当前学习态:${input.currentLearningState}`,
    `可选 Skill:${input.availableSkills.join(', ')}`,
    input.profile ? `用户画像摘要:${JSON.stringify(input.profile)}` : '用户画像:未知',
    input.recentMessagesSummary ? `近况:${input.recentMessagesSummary}` : '',
    '',
    '决策原则:',
    '- onboarding 学习态下优先选 onboarding Skill',
    '- practicing/grading 期间不要降级到 general-chat',
    '- 用户主动要求复盘/换场景/重练时,选对应 Skill',
    '- 无明确意图时回 general-chat',
    '',
    '必须通过 route_to_skill function 调用回应,不要直接输出文字。',
  ]
    .filter(Boolean)
    .join('\n');
}
