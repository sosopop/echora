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
import { streamBus } from '../services/streamBus.js';
import type { SkillRegistry } from '../skills/registry.js';
import type { AIRouter } from '../ai/router.js';
import type {
  SkillContext,
  SkillEvent,
  RouterInput,
} from '../../shared/skill.js';
import type { ChatSendResp } from '../../shared/api.js';

const sendSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  text: z.string().min(1).max(4000),
  mode: z.enum(['chat', 'fill', 'select', 'menu']).optional(),
});

export interface ChatRouterDeps {
  db: Db;
  config: Config;
  skillRegistry: SkillRegistry;
  aiRouter: AIRouter;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();
  const { db, config, skillRegistry, aiRouter } = deps;
  const auth = requireAuth(config);

  // —— 会话列表 ————————————————————————————————————————————
  router.get('/conversations', auth, (req, res) => {
    const list = listConversations(db, req.user!.id);
    res.json({ data: list });
  });

  // —— 新建空会话 ——————————————————————————————————————————
  router.post('/conversations', auth, (req, res) => {
    const conv = createConversation(db, req.user!.id);
    res.status(201).json({ data: conv });
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
      const userMsg = appendMessage(db, {
        conversationId: conv.id,
        type: 'text',
        role: 'user',
        content: body.text,
      });

      // 3. AI Router 决策
      const routerInput: RouterInput = {
        userText: body.text,
        profile: null,
        currentLearningState: conv.learningState,
        conversationId: conv.id,
        availableSkills: skillRegistry.names(),
      };
      const decision = await aiRouter.decide(routerInput);
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

  const ctx: SkillContext = {
    user: { id: userId, email: userEmail },
    conversationId,
    messageId,
    streamId,
    params: decision.params,
    learningState,
    signal: controller.signal,
    emit() {
      // 这里仅占位:Skill 不直接调,是通过 yield 产事件给外部循环。
      // 为符合接口,提供一个无效实现。
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

  // 处理 mode-switch / widget-* 副作用(更新 conversations.input_mode)
  const handleSideEffects = (event: SkillEvent): void => {
    if (event.type === 'mode-switch') {
      try {
        updateInputMode(db, conversationId, event.payload.mode);
      } catch (e) {
        console.warn('[runSkill] updateInputMode 失败', e);
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

      // 切学习态(简化:仅 grade → awaiting_next,其他保持)
      if (skill.name === 'grade') {
        updateLearningState(db, conversationId, 'awaiting_next', null);
      }
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
