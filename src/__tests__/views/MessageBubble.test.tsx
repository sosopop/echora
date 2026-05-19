import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from '../../views/Chat/MessageBubble';

describe('MessageBubble', () => {
  it('把历史 raw action 文本显示为自然文案', () => {
    render(
      <MessageBubble
        role="user"
        text='[action] {"type":"request-new-scenes"}'
      />
    );

    expect(screen.getByText('换一批场景')).toBeInTheDocument();
    expect(screen.queryByText(/\[action\]/)).not.toBeInTheDocument();
  });

  it('assistant 流式空内容时显示思考占位', () => {
    render(<MessageBubble role="assistant" text="" streaming />);

    expect(screen.getByText(/Echo 正在思考中/)).toBeInTheDocument();
  });

  it('assistant 消息按 Markdown 渲染', () => {
    render(<MessageBubble role="assistant" text={'**重点**\n- 固定搭配'} />);

    expect(screen.getByText('重点').tagName).toBe('STRONG');
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('固定搭配')).toBeInTheDocument();
  });
});
