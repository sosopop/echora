/**
 * /api/chat 路由
 *
 *   GET  /conversations                      列出当前用户会话
 *   POST /conversations                      新建空会话
 *   GET  /conversations/:id/messages         历史消息
 *   POST /send                               发送消息(同步) → { messageId, streamId, decision }
 *   GET  /stream?streamId=...&lastSeq=...    SSE 端点(token 走 query)
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connect.js';
import type { Config } from '../config/getConfig.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { ERROR_CODES } from '../../shared/errors.js';
import {
  createConversation,
  getConversation,
  listConversations,
  updateInputMode,
  updateLearningState,
} from '../services/conversation.js';
import {
  appendMessage,
  appendStreamEvent,
  getMessages,
} from '../services/message.js';
import { getActiveSceneDialogue } from '../services/sceneDialogue.js';
import { streamBus } from '../services/streamBus.js';
import type { SkillRegistry } from '../skills/registry.js';
import type { AIRouter } from '../ai/router.js';
import type { AIProvider } from '../ai/types.js';
import type { ServerSkillContext } from '../skills/types.js';
import type {
  SkillEvent,
  RouterInput,
  LearningState,
} from '../../shared/skill.js';
import { ALL_LEARNING_STATES } from '../../shared/skill.js';
import type { ChatSendResp } from '../../shared/api.js';

const chatActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('select-scene'),
    payload: z.object({ sceneId: z.string().min(1).max(64) }),
  }),
  z.object({ type: z.literal('request-new-scenes') }),
  z.object({
    type: z.literal('submit-answer'),
    payload: z.object({
      attemptId: z.number().int().positive(),
      answer: z.string().min(1).max(4000),
    }),
  }),
  z.object({
    type: z.literal('skip-question'),
    payload: z.object({ attemptId: z.number().int().positive() }),
  }),
  z.object({ type: z.literal('next-question') }),
]);

const sendSchema = z
  .object({
    conversationId: z.number().int().positive().optional(),
    text: z.string().min(1).max(4000).optional(),
    action: chatActionSchema.optional(),
    mode: z.enum(['chat', 'fill', 'select', 'menu']).optional(),
  })
  .refine(
    (b) => (b.text != null) !== (b.action != null),
    { message: 'text 与 action 必须二选一(不能同时给也不能都缺)' }
  );

const createConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  learningState: z
    .enum(ALL_LEARNING_STATES as [LearningState, ...LearningState[]])
    .optional(),
});

export interface ChatRouterDeps {
  db: Db;
  config: Config;
  skillRegistry: SkillRegistry;
  aiRouter: AIRouter;
  provider: AIProvider;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();
  const { db, config, skillRegistry, aiRouter, provider } = deps;
  const auth = requireAuth(config);

  // —— 会话列表 ————————————————————————————————————————————
  router.get('/conversations', auth, (req, res) => {
    const list = listConversations(db, req.user!.id);
    res.json({ data: list });
  });

  // —— 新建空会话 ——————————————————————————————————————————
  router.post('/conversations', auth, (req, res, next) => {
    try {
      const body = createConversationSchema.parse(req.body ?? {});
      const conv = createConversation(db, req.user!.id, {
        title: body.title,
        learningState: body.learningState,
      });
      res.status(201).json({ data: conv });
    } catch (e) {
      next(e);
    }
  });

  // —— 历史消息 ————————————————————————————————————————————
  router.get('/conversations/:id/messages', auth, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, '非法 id');
      }
      const conv = getConversation(db, id, req.user!.id);
      if (!conv) {
        throw new HttpError(
          404,
          ERROR_CODES.CONVERSATION_NOT_FOUND,
          '会话不存在或无权访问'
        );
      }
      const list = getMessages(db, id);
      res.json({ data: list });
    } catch (e) {
      next(e);
    }
  });

  // —— 场景对话(scene_dialogues 的当前活跃一条) ————————————
  router.get(
    '/conversations/:id/scene-dialogue',
    auth,
    (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, '非法 id');
        }
        const conv = getConversation(db, id, req.user!.id);
        if (!conv) {
          throw new HttpError(
            404,
            ERROR_CODES.CONVERSATION_NOT_FOUND,
            '会话不存在或无权访问'
          );
        }
        const dialogue = getActiveSceneDialogue(db, id);
        if (!dialogue) {
          res.status(404).json({
            error: {
              code: ERROR_CODES.NOT_FOUND ?? 'NOT_FOUND',
              message: '当前会话没有活跃场景对话',
            },
          });
          return;
        }
        res.json({ data: dialogue });
      } catch (e) {
        next(e);
      }
    }
  );

  // —— 发送消息 ————————————————————————————————————————————
  router.post('/send', auth, async (req, res, next) => {
    try {
      const body = sendSchema.parse(req.body);
      const userId = req.user!.id;

      // 1. 解析或新建会话
      let conv = body.conversationId
        ? getConversation(db, body.conversationId, userId)
        : null;
      if (body.conversationId && !conv) {
        throw new HttpError(
          404,
          ERROR_CODES.CONVERSATION_NOT_FOUND,
          '会话不存在或无权访问'
        );
      }
      if (!conv) {
        conv = createConversation(db, userId);
      }

      // 2. 持久化用户消息
      //    text 直接落 content;action 则把 JSON 字符串化进 content 便于历史回看
      const messageContent = body.text
        ? body.text
        : `[action] ${JSON.stringify(body.action)}`;
      const userMsg = appendMessage(db, {
        conversationId: conv.id,
        type: 'text',
        role: 'user',
        content: messageContent,
      });

      // 3. AI Router 决策
      //    失败不做 fallback,直接抛错让客户端看到具体原因
      //    action 优先体现为路由 userText 提示(skill 内部从 decision.params.action 拿)
      const routerInput: RouterInput = {
        userText: body.text ?? `[action:${body.action?.type}]`,
        profile: null,
        currentLearningState: conv.learningState,
        conversationId: conv.id,
        availableSkills: skillRegistry.names(),
      };
      let decision;
      try {
        decision = await aiRouter.decide(routerInput);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        throw new HttpError(
          502,
          ERROR_CODES.PROVIDER_ERROR,
          `AI 路由失败: ${reason}`
        );
      }
      // 把 action 注入 decision.params,供 skill 读取
      if (body.action) {
        decision = {
          ...decision,
          params: { ...decision.params, action: body.action },
        };
      }
      const skill = skillRegistry.get(decision.skillName);
      if (!skill) {
        throw new HttpError(
          500,
          ERROR_CODES.SKILL_NOT_FOUND,
          `Skill 不存在: ${decision.skillName}`
        );
      }

      // 4. 创建 assistant 消息(空内容,后续由流事件填充)
      const assistantMsg = appendMessage(db, {
        conversationId: conv.id,
        type: 'text',
        role: 'assistant',
        skillName: decision.skillName,
      });

      // 5. 记录 agent_run
      const runId = randomUUID();
      const runStmt = db.prepare(
        `INSERT INTO agent_runs
         (run_id, user_id, conversation_id, message_id, skill_name, status, payload)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      );
      runStmt.run(
        runId,
        userId,
        conv.id,
        assistantMsg.id,
        decision.skillName,
        JSON.stringify({ decision })
      );

      // 6. 启动背景任务执行 Skill handler
      const streamId = `stream-${assistantMsg.id}-${randomUUID().slice(0, 8)}`;
      runSkillInBackground({
        db,
        provider,
        skill,
        decision,
        streamId,
        runId,
        userId,
        userEmail: req.user!.email,
        conversationId: conv.id,
        messageId: assistantMsg.id,
        learningState: conv.learningState,
      });

      // 7. 同步返回
      const respBody: ChatSendResp = {
        conversationId: conv.id,
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        streamId,
        decision,
      };
      res.status(202).json({ data: respBody });
    } catch (e) {
      next(e);
    }
  });

  // —— SSE 流 ————————————————————————————————————————————
  router.get('/stream', auth, (req, res) => {
    const streamId =
      typeof req.query.streamId === 'string' ? req.query.streamId : '';
    const lastSeqRaw = req.query.lastSeq;
    const lastSeq =
      typeof lastSeqRaw === 'string' && /^\d+$/.test(lastSeqRaw)
        ? Number(lastSeqRaw)
        : 0;

    if (!streamId) {
      res.status(400).json({
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: '缺少 streamId',
        },
      });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 关闭 nginx 缓冲(若部署在 nginx 后)
    res.flushHeaders?.();

    let ended = false;
    const send = (event: SkillEvent): void => {
      if (ended) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        ended = true;
        return;
      }
      if (event.type === 'done' || event.type === 'error') {
        ended = true;
        try {
          res.end();
        } catch {
          /* already closed */
        }
      }
    };

    const unsubscribe = streamBus.subscribe(streamId, lastSeq, send);

    // 心跳:每 15s 发注释行,防止反向代理断开
    const heartbeat = setInterval(() => {
      if (ended) {
        clearInterval(heartbeat);
        return;
      }
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      ended = true;
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}

/* ============================================================
 * 背景执行 Skill handler
 * ========================================================== */
interface RunSkillArgs {
  db: Db;
  provider: AIProvider;
  skill: import('../../shared/skill.js').Skill;
  decision: import('../../shared/skill.js').RouterDecision;
  streamId: string;
  runId: string;
  userId: number;
  userEmail: string;
  conversationId: number;
  messageId: number;
  learningState: import('../../shared/skill.js').LearningState;
}

function runSkillInBackground(args: RunSkillArgs): void {
  const {
    db,
    provider,
    skill,
    decision,
    streamId,
    runId,
    userId,
    userEmail,
    conversationId,
    messageId,
    learningState,
  } = args;

  const startedAt = Date.now();
  let seq = 0;
  const controller = new AbortController();

  const ctx: ServerSkillContext = {
    user: { id: userId, email: userEmail },
    conversationId,
    messageId,
    streamId,
    params: decision.params,
    learningState,
    signal: controller.signal,
    provider,
    db,
    emit() {
      // 占位:Skill 通过 yield 产事件,emit 接口暂不使用
    },
    makeWidgetId(prefix) {
      return `${prefix}-${randomUUID().slice(0, 8)}`;
    },
  };

  const runUpdate = db.prepare(
    `UPDATE agent_runs
     SET status = ?, latency_ms = ?, error_type = ?, finished_at = datetime('now')
     WHERE run_id = ?`
  );

  // 处理 mode-switch / state-transition / widget-* 副作用
  const handleSideEffects = (event: SkillEvent): void => {
    if (event.type === 'mode-switch') {
      try {
        updateInputMode(db, conversationId, event.payload.mode);
      } catch (e) {
        console.warn('[runSkill] updateInputMode 失败', e);
      }
    } else if (event.type === 'state-transition') {
      try {
        updateLearningState(
          db,
          conversationId,
          event.payload.nextLearningState,
          event.payload.activeSkill
        );
      } catch (e) {
        console.warn('[runSkill] updateLearningState 失败', e);
      }
    }
  };

  (async () => {
    let sawTerminal = false;
    try {
      for await (const partial of skill.handler(ctx)) {
        seq += 1;
        const fullEvent: SkillEvent = {
          ...partial,
          seq,
          streamId,
          timestamp: Date.now(),
        } as SkillEvent;

        // 落盘
        try {
          appendStreamEvent(db, messageId, fullEvent);
        } catch (e) {
          console.warn('[runSkill] appendStreamEvent 失败', e);
        }
        // 副作用
        handleSideEffects(fullEvent);
        // 推流
        streamBus.publish(streamId, fullEvent);

        if (fullEvent.type === 'done' || fullEvent.type === 'error') {
          sawTerminal = true;
        }
      }

      // 兜底:若 Skill 没产 done/error,补一条 done
      if (!sawTerminal) {
        const lastEvent: SkillEvent = {
          type: 'done',
          payload: {} as Record<string, unknown>,
          seq: seq + 1,
          streamId,
          timestamp: Date.now(),
        };
        try {
          appendStreamEvent(db, messageId, lastEvent);
        } catch {
          /* 落盘失败不阻塞 */
        }
        streamBus.publish(streamId, lastEvent);
      }

      runUpdate.run('done', Date.now() - startedAt, null, runId);

      // grade skill 003 已自身 yield state-transition,不再需要兼容分支
    } catch (err) {
      const errEvent: SkillEvent = {
        type: 'error',
        payload: {
          code: 'SKILL_HANDLER_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
        seq: seq + 1,
        streamId,
        timestamp: Date.now(),
      };
      streamBus.publish(streamId, errEvent);
      runUpdate.run(
        'failed',
        Date.now() - startedAt,
        err instanceof Error ? err.name : 'unknown',
        runId
      );
    } finally {
      // 不立即 close streamBus,让晚来的订阅者还能 replay
    }
  })().catch((e) => {
    console.error('[runSkill] 后台任务崩溃', e);
  });
}
