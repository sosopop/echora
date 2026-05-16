import { describe, expect, it } from '@jest/globals';
import { toAnthropicToolChoice } from '../ai/providers/anthropic.js';

describe('AnthropicProvider tool choice mapping', () => {
  it('maps internal auto tool choice to Anthropic object shape', () => {
    expect(toAnthropicToolChoice('auto')).toEqual({ type: 'auto' });
  });

  it('maps internal named tool choice to Anthropic tool shape', () => {
    expect(toAnthropicToolChoice({ type: 'tool', name: 'update_profile' })).toEqual({
      type: 'tool',
      name: 'update_profile',
    });
  });

  it('omits tool_choice when caller does not request one', () => {
    expect(toAnthropicToolChoice(undefined)).toBeUndefined();
  });
});
