/**
 * Expected user input policy.
 *
 * Any workflow step that expects the user to answer a specific question should
 * declare how to recover when the user refuses, gives an unusable answer, or
 * the model does not collect the value. This keeps state advancement out of
 * prompt wording and makes retries/fallbacks/skips explicit.
 */

export type ExpectedInputRecovery<Value = unknown> =
  | { kind: 'retry'; reason: string }
  | { kind: 'fallback'; value: Value; reason: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'fail'; code: string; message: string; reason: string };

export interface ExpectedInputPolicy<
  Field extends string = string,
  Value = unknown,
> {
  field: Field;
  label: string;
  required: boolean;
  prompt: string;
  recovery: ExpectedInputRecovery<Value>;
  refusalPatterns?: RegExp[];
  promptedPatterns?: RegExp[];
}

export type ExpectedInputResolution<Field extends string = string, Value = unknown> =
  | {
      kind: 'retry';
      field: Field;
      prompt: string;
      reason: string;
    }
  | {
      kind: 'fallback';
      field: Field;
      value: Value;
      reason: string;
    }
  | {
      kind: 'skip';
      field: Field;
      reason: string;
    }
  | {
      kind: 'fail';
      field: Field;
      code: string;
      message: string;
      reason: string;
    };

export function resolveExpectedInputRefusal<
  Field extends string,
  Value,
>(
  policy: ExpectedInputPolicy<Field, Value>,
  userText: string
): ExpectedInputResolution<Field, Value> | null {
  if (!matchesAnyNormalized(userText, policy.refusalPatterns ?? [])) {
    return null;
  }

  switch (policy.recovery.kind) {
    case 'retry':
      return {
        kind: 'retry',
        field: policy.field,
        prompt: policy.prompt,
        reason: policy.recovery.reason,
      };
    case 'fallback':
      return {
        kind: 'fallback',
        field: policy.field,
        value: policy.recovery.value,
        reason: policy.recovery.reason,
      };
    case 'skip':
      return {
        kind: 'skip',
        field: policy.field,
        reason: policy.recovery.reason,
      };
    case 'fail':
      return {
        kind: 'fail',
        field: policy.field,
        code: policy.recovery.code,
        message: policy.recovery.message,
        reason: policy.recovery.reason,
      };
  }
}

export function shouldAppendExpectedInputPrompt(
  policy: ExpectedInputPolicy,
  assistantText: string
): boolean {
  const patterns = policy.promptedPatterns ?? [];
  if (patterns.length === 0) return true;
  return !matchesAnyNormalized(assistantText, patterns);
}

export function normalizeExpectedInputText(text: string): string {
  return text.trim().replace(/\s+/g, '');
}

function matchesAnyNormalized(text: string, patterns: RegExp[]): boolean {
  const normalized = normalizeExpectedInputText(text);
  if (!normalized) return false;
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(normalized);
  });
}
