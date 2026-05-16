export const DEEPSEEK_THINKING_DISABLED = {
  thinking: { type: 'disabled' as const },
};

export type DeepSeekThinkingDisabled = typeof DEEPSEEK_THINKING_DISABLED;

export function isDeepSeekBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false;
  try {
    return new URL(baseURL).hostname === 'api.deepseek.com';
  } catch {
    return baseURL.includes('api.deepseek.com');
  }
}
