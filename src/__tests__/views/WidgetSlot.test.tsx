import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WidgetSlot from '../../views/Chat/WidgetSlot';
import type { LearningWidgetInstance } from '@shared/skill';

describe('WidgetSlot', () => {
  it('隐藏 loading exercise-card,避免半成品题卡占位', () => {
    const widget: LearningWidgetInstance = {
      id: 'exercise-loading',
      type: 'exercise-card',
      status: 'loading',
      data: {},
      version: 1,
    };

    const { container } = render(<WidgetSlot widget={widget} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/阶段/)).not.toBeInTheDocument();
  });

  it('隐藏数据不完整的 ready exercise-card,避免空 widget 槽位', () => {
    const widget: LearningWidgetInstance = {
      id: 'exercise-invalid',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 1,
        stage: 1,
        questionNo: 1,
        questionType: 'fill_word',
      },
      version: 1,
    };

    const { container } = render(<WidgetSlot widget={widget} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ready exercise-card 数据完整时渲染题卡', () => {
    const widget: LearningWidgetInstance = {
      id: 'exercise-ready',
      type: 'exercise-card',
      status: 'ready',
      data: {
        attemptId: 1,
        stage: 1,
        questionNo: 1,
        questionType: 'fill_word',
        contextZh: '打扰一下,请问火车站在哪里?',
        contextEn: '______ me, where is the train station?',
      },
      version: 1,
    };

    render(<WidgetSlot widget={widget} />);

    expect(screen.getByText(/阶段 1/)).toBeInTheDocument();
    expect(screen.getByText(/第 1 题/)).toBeInTheDocument();
  });
});
