import type { ChatAction } from '@shared/api';

interface WidgetActionDeps {
  sendMessage(text: string): void | Promise<void>;
  sendAction(action: ChatAction): void | Promise<void>;
  onLocalSaveProgress?: () => void;
}

export function runWidgetAction(
  action: string | undefined,
  deps: WidgetActionDeps
): void {
  const value = action?.trim();
  if (!value) return;

  if (value === 'action:request-new-scenes') {
    void deps.sendAction({ type: 'request-new-scenes' });
    return;
  }
  if (value === 'action:next-question') {
    void deps.sendAction({ type: 'next-question' });
    return;
  }
  if (value === 'local:save-progress') {
    deps.onLocalSaveProgress?.();
    return;
  }
  if (value.startsWith('text:')) {
    void deps.sendMessage(value.slice('text:'.length));
    return;
  }
  if (value.startsWith('retry:')) {
    void deps.sendMessage(`重练 ${value.slice('retry:'.length)}`);
    return;
  }

  void deps.sendMessage(value);
}
