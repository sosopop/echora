/**
 * Skill 接口 + SkillEvent 8 联合 + SkillContext + RouterDecision
 *
 * 此文件由前后端共享。禁止导入任何后端依赖(better-sqlite3 / express)。
 * 仅依赖标准 JS / TS 类型与可选的 zod。
 */

/* ============================================================
 * Learning State Machine (与 PRD §2.4 对齐)
 * ========================================================== */
export type LearningState =
  | 'onboarding'
  | 'scene_selecting'
  | 'practicing'
  | 'grading'
  | 'awaiting_next'
  | 'reviewing'
  | 'archived';

export const ALL_LEARNING_STATES: LearningState[] = [
  'onboarding',
  'scene_selecting',
  'practicing',
  'grading',
  'awaiting_next',
  'reviewing',
  'archived',
];

/* ============================================================
 * Input Mode (PRD §4.6)
 * ========================================================== */
export type InputMode = 'chat' | 'fill' | 'select' | 'menu';

/* ============================================================
 * SkillEvent 8 类型联合 (PRD §2.7)
 *
 * SkillEventInput:Skill handler 产出的 raw 事件,无元数据
 * SkillEvent:    chat 路由层补 seq / streamId / timestamp 后的完整事件
 * ========================================================== */
export interface SkillEventMeta {
  seq: number;
  streamId: string;
  timestamp: number;
}

export type SkillEventInput =
  | { type: 'text-chunk'; payload: { text: string } }
  | { type: 'widget-init'; payload: { widget: LearningWidgetInstance } }
  | {
      type: 'widget-update';
      payload: { widgetId: string; patch: Partial<LearningWidgetInstance> };
    }
  | {
      type: 'widget-ready';
      payload: { widgetId: string; patch: Partial<LearningWidgetInstance> };
    }
  | { type: 'mode-switch'; payload: { mode: InputMode } }
  | { type: 'quick-actions'; payload: { actions: QuickAction[] } }
  | {
      type: 'state-transition';
      payload: {
        nextLearningState: LearningState;
        activeSkill: string | null;
      };
    }
  | { type: 'done'; payload?: Record<string, unknown> }
  | { type: 'error'; payload: { code: string; message: string } };

export type SkillEvent = SkillEventInput & SkillEventMeta;

export type SkillEventType = SkillEventInput['type'];

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  action: string; // 结构化 action 字符串,前端转给后端
}

/* ============================================================
 * LearningWidget 实例(运行时) — schema 在 ./widget.ts
 * 这里只保留 SkillEvent 引用必需的最小协议字段。
 * ========================================================== */
export interface LearningWidgetInstance {
  id: string;
  type: string; // Widget 类型字符串,完整列表见 ./widget.ts
  status: 'loading' | 'ready' | 'disabled' | 'submitted' | 'expired' | 'error';
  data: Record<string, unknown>;
  version: number;
}

/* ============================================================
 * Router Decision
 * ========================================================== */
export interface RouterInput {
  userText: string;
  profile: Record<string, unknown> | null;
  currentLearningState: LearningState;
  conversationId: number;
  availableSkills: string[];
  recentMessagesSummary?: string;
}

export interface RouterDecision {
  skillName: string;
  params: Record<string, unknown>;
  confidence: number; // 0-1
  rationale: string;
}

/* ============================================================
 * Skill Context — Skill handler 接收的上下文
 *
 * 后端在调用 handler 前装配 ctx,包含:
 *   - 当前用户 / 会话 / 消息引用
 *   - 已解析的 params(经 zod 校验)
 *   - emit:推送 SkillEvent 的方法
 *   - signal:取消信号(用户停止生成时 abort)
 *   - makeEvent / makeWidgetId:辅助构造器
 * ========================================================== */
export interface SkillContext {
  user: { id: number; email: string };
  conversationId: number;
  messageId: number;
  streamId: string;
  params: Record<string, unknown>;
  learningState: LearningState;
  signal: AbortSignal;

  emit(event: SkillEventInput): void;
  makeWidgetId(prefix: string): string;
}

/* ============================================================
 * Skill 接口
 *
 * 所有 Skill 通过 skillRegistry 注册。
 * handler 是 async generator,产出 SkillEvent 流(无需自填 meta)。
 * ========================================================== */
export interface Skill {
  name: string;
  description: string;
  /** 允许在哪些 learningState 下被调用;空数组表示任意态 */
  allowedStates: LearningState[];
  /** 主 Widget 类型(用于联想与文档,非强约束) */
  primaryWidget?: string;
  handler(ctx: SkillContext): AsyncIterable<SkillEventInput>;
}

/* ============================================================
 * Skill 名字常量(避免拼写漂移)
 * ========================================================== */
export const SKILL_NAMES = {
  onboarding: 'onboarding',
  sceneSelect: 'scene-select',
  practice: 'practice',
  grade: 'grade',
  explain: 'explain',
  review: 'review',
  retry: 'retry',
  generalChat: 'general-chat',
} as const;

export type SkillName = (typeof SKILL_NAMES)[keyof typeof SKILL_NAMES];
