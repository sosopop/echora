/**
 * exercise_attempts.prompt 的兼容解析
 *
 * 历史数据是普通字符串;016 起 retry 使用轻量 JSON 包一层参考答案,
 * 避免新增数据库列也能让 grade 稳定批改专项题。
 */

export interface StructuredAttemptPrompt {
  kind: 'retry';
  prompt: string;
  referenceAnswer: string;
  targetTag: string;
}

export interface DecodedAttemptPrompt {
  prompt: string;
  referenceAnswer?: string;
  targetTag?: string;
  kind?: string;
}

const STRUCTURED_VERSION = 1;

export function encodeRetryAttemptPrompt(input: {
  prompt: string;
  referenceAnswer: string;
  targetTag: string;
}): string {
  return JSON.stringify({
    __echoraPrompt: STRUCTURED_VERSION,
    kind: 'retry',
    prompt: input.prompt,
    referenceAnswer: input.referenceAnswer,
    targetTag: input.targetTag,
  });
}

export function decodeAttemptPrompt(prompt: string): DecodedAttemptPrompt {
  try {
    const parsed = JSON.parse(prompt) as Partial<StructuredAttemptPrompt> & {
      __echoraPrompt?: number;
    };
    if (
      parsed.__echoraPrompt === STRUCTURED_VERSION &&
      parsed.kind === 'retry' &&
      typeof parsed.prompt === 'string' &&
      typeof parsed.referenceAnswer === 'string'
    ) {
      return {
        prompt: parsed.prompt,
        referenceAnswer: parsed.referenceAnswer,
        targetTag:
          typeof parsed.targetTag === 'string' ? parsed.targetTag : undefined,
        kind: parsed.kind,
      };
    }
  } catch {
    /* plain legacy prompt */
  }
  return { prompt };
}
