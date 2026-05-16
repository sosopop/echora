import { describe, expect, it } from '@jest/globals';
import { toOpenAIToolChoice } from '../ai/providers/openai.js';
import {
  isDeepSeekBaseURL,
  shouldOmitDeepSeekToolChoice,
} from '../ai/providers/deepseek.js';

describe('OpenAIProvider tool choice mapping', () => {
  it('maps internal auto tool choice to OpenAI string shape', () => {
    expect(toOpenAIToolChoice('auto')).toBe('auto');
  });

  it('maps internal named tool choice to OpenAI function shape', () => {
    expect(toOpenAIToolChoice({ type: 'tool', name: 'update_profile' })).toEqual({
      type: 'function',
      function: { name: 'update_profile' },
    });
  });

  it('omits tool_choice when caller does not request one', () => {
    expect(toOpenAIToolChoice(undefined)).toBeUndefined();
  });

  it('omits tool_choice for DeepSeek-compatible endpoints', () => {
    expect(
      toOpenAIToolChoice({ type: 'tool', name: 'update_profile' }, {
        omitToolChoice: true,
      })
    ).toBeUndefined();
    expect(toOpenAIToolChoice('auto', { omitToolChoice: true })).toBeUndefined();
  });
});

describe('DeepSeek endpoint detection', () => {
  it('detects both OpenAI and Anthropic DeepSeek base URLs', () => {
    expect(isDeepSeekBaseURL('https://api.deepseek.com')).toBe(true);
    expect(isDeepSeekBaseURL('https://api.deepseek.com/anthropic')).toBe(true);
    expect(shouldOmitDeepSeekToolChoice('https://api.deepseek.com')).toBe(true);
  });

  it('does not relax tool_choice for other providers', () => {
    expect(isDeepSeekBaseURL('https://api.openai.com/v1')).toBe(false);
    expect(shouldOmitDeepSeekToolChoice('https://api.anthropic.com')).toBe(false);
  });
});
