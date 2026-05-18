/**
 * /api/chat 路由
 *
 *   GET  /conversations                      列出当前用户会话
 *   POST /conversations                      新建空会话
 *   GET  /conversations/:id/messages         历史消息
 *   POST /send                               发送消息(同步) → { messageId, streamId, decision }
 *   POST /streams/:streamId/abort            停止正在生成的 Skill 流
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
  archiveConversation,
  createConversation,
  getConversation,
  listConversations,
  updateInputMode,
  updateLearningState,
} from '../services/conversation.js';
import {
  appendMessage,
  appendStreamEvent,
  getBranchMessages,
  getMessage,
  getMessageStreamEvents,
  getMessages,
} from '../services/message.js';
import {
  createBranchThread,
  getBranchThread,
  listBranchThreads,
} from '../services/branchThread.js';
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
  RouterDecision,
  LearningWidgetInstance,
} from '../../shared/skill.js';
import { ALL_LEARNING_STATES } from '../../shared/skill.js';
import {
  describeChatAction,
  type BranchThreadDTO,
  type ChatAction,
  type ConversationDTO,
  type MessageDTO,
  type ChatSendResp,
} from '../../shared/api.js';
import { getDevErrorDetails } from '../utils/devError.js';
import {
  findLatestAttempt,
  type ExerciseAttemptDTO,
} from '../services/exerciseAttempt.js';
import { getGradingByAttempt } from '../services/gradingResult.js';
import {
  ensureErrorTagEvents,
  normalizeErrorTags,
} from '../services/errorTagEvent.js';
import { applyMasteryUpdate } from '../services/masteryRecord.js';
import {
  adjustProfileLevel,
  type DifficultyFeedbackDirection,
} from '../services/profile.js';
import type { GradingResultDTO } from '../services/gradingResult.js';
import type { ErrorTagEventDTO } from '../services/errorTagEvent.js';

const chatActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('select-scene'),
    payload: z.object({
      sceneId: z.string().min(1).max(64),
      title: z.string().min(1).max(80).optional(),
      description: z.string().min(1).max(200).optional(),
      knowledgePoint: z.string().min(1).max(120).optional(),
      difficulty: z
        .enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
        .optional(),
      topic: z.string().min(1).max(120).optional(),
    }),
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

type ChatSendBody = z.infer<typeof sendSchema>;

const LOW_CONFIDENCE_THRESHOLD = 0.5;

const createConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  learningState: z
    .enum(ALL_LEARNING_STATES as [LearningState, ...LearningState[]])
    .optional(),
});

const createBranchThreadSchema = z.object({
  sourceMessageId: z.number().int().positive(),
  sourceRef: z.unknown().optional(),
});

const sendBranchMessageSchema = z.object({
  text: z.string().min(1).max(4000),
});

const streamIdSchema = z.string().min(1).max(160);

interface ActiveSkillRun {
  streamId: string;
  runId: string;
  userId: number;
  conversationId: number;
  messageId: number;
  controller: AbortController;
  startedAt: number;
  seq: number;
  aborted: boolean;
  terminalSent: boolean;
}

const activeSkillRuns = new Map<string, ActiveSkillRun>();

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

  // —— 辅助追问支线 ————————————————————————————————————————
  router.get('/conversations/:id/branch-threads', auth, (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      assertConversationOwner(db, id, req.user!.id);
      res.json({ data: listBranchThreads(db, id, req.user!.id) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/conversations/:id/branch-threads', auth, (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      assertConversationOwner(db, id, req.user!.id);
      const body = createBranchThreadSchema.parse(req.body ?? {});
      const source = getMessage(db, body.sourceMessageId);
      if (!source || source.conversationId !== id) {
        throw new HttpError(
          404,
          ERROR_CODES.NOT_FOUND ?? ERROR_CODES.VALIDATION_FAILED,
          '支线来源消息不存在或不属于当前会话'
        );
      }

      const thread = createBranchThread(db, {
        userId: req.user!.id,
        conversationId: id,
        sourceMessageId: body.sourceMessageId,
        sourceRef: body.sourceRef,
      });
      res.status(201).json({ data: thread });
    } catch (e) {
      next(e);
    }
  });

  router.get('/branch-threads/:threadId/messages', auth, (req, res, next) => {
    try {
      const threadId = parsePositiveId(req.params.threadId);
      const thread = requireBranchThread(db, threadId, req.user!.id);
      res.json({ data: getBranchMessages(db, thread.id) });
    } catch (e) {
      next(e);
    }
  });

  router.post('/branch-threads/:threadId/messages', auth, async (req, res, next) => {
    try {
      const threadId = parsePositiveId(req.params.threadId);
      const thread = requireBranchThread(db, threadId, req.user!.id);
      const conv = assertConversationOwner(
        db,
        thread.conversationId,
        req.user!.id
      );
      const body = sendBranchMessageSchema.parse(req.body ?? {});
      const text = body.text.trim();
      if (!text) {
        throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, '内容不能为空');
      }
      const source = getMessage(db, thread.sourceMessageId);
      const branchHistory = getBranchMessages(db, thread.id, 20);
      const assistantText = await buildBranchAssistantText(
        provider,
        text,
        source,
        shouldLockHistory(conv),
        branchHistory
      );

      const userMessage = appendMessage(db, {
        conversationId: thread.conversationId,
        branchThreadId: thread.id,
        type: 'text',
        role: 'user',
        content: text,
      });
      const assistantMessage = appendMessage(db, {
        conversationId: thread.conversationId,
        branchThreadId: thread.id,
        type: 'text',
        role: 'assistant',
        skillName: 'explain',
        content: assistantText,
      });

      res.status(201).json({ data: { userMessage, assistantMessage } });
    } catch (e) {
      next(e);
    }
  });

  router.post('/branch-threads/:threadId/review', auth, (req, res, next) => {
    try {
      const threadId = parsePositiveId(req.params.threadId);
      const thread = requireBranchThread(db, threadId, req.user!.id);
      assertConversationOwner(db, thread.conversationId, req.user!.id);
      const source = getMessage(db, thread.sourceMessageId);
      if (!source) {
        throw new HttpError(
          404,
          ERROR_CODES.NOT_FOUND,
          '辅助追问来源消息不存在'
        );
      }
      const attemptId = extractReviewAttemptId(source);
      if (attemptId == null) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          '当前支线来源不是已批改题目,不能加入复盘'
        );
      }
      const grading = getGradingByAttempt(db, attemptId);
      if (!grading) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          '当前来源题还没有批改结果,不能加入复盘'
        );
      }

      const tags = normalizeErrorTags(grading.corrections.tags ?? []);
      if (tags.length === 0) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          '当前批改没有可加入复盘的错误标签'
        );
      }
      const result = ensureErrorTagEvents(db, {
        attemptId,
        gradingId: grading.id,
        userId: req.user!.id,
        score: grading.score,
        tags,
      });
      const masteriesUpdatedCount = updateBranchReviewMasteries(
        db,
        req.user!.id,
        grading,
        result.created
      );

      res.json({
        data: {
          threadId,
          sourceMessageId: source.id,
          attemptId,
          gradingId: grading.id,
          tags,
          createdEventsCount: result.created.length,
          existingEventsCount: result.existingCount,
          masteriesUpdatedCount,
          message: formatBranchReviewMessage(
            result.created.length,
            result.existingCount,
            masteriesUpdatedCount
          ),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // —— 历史消息 ————————————————————————————————————————————
  router.get('/conversations/:id/messages', auth, (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      const conv = assertConversationOwner(db, id, req.user!.id);
      const list = sanitizeMessagesForLock(getMessages(db, id), conv);
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
        const id = parsePositiveId(req.params.id);
        assertConversationOwner(db, id, req.user!.id);
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
      if (isArchivedConversation(conv) && !isArchivedReviewRequest(body)) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          '该会话已归档,只能查看复盘;如需继续练习,请开启新的会话。'
        );
      }

      const normalizedInput = normalizeChatSendInput(db, userId, conv, body);
      const archivedConversationId = shouldStartNewRound(
        conv,
        normalizedInput
      )
        ? conv.id
        : null;
      if (archivedConversationId != null) {
        archiveConversation(db, archivedConversationId);
        conv = createConversation(db, userId, {
          learningState: 'scene_selecting',
        });
      }

      // 2. 持久化用户消息
      //    text 直接落 content;action 落自然文案;submit-answer 落用户真实答案。
      const userMsg = appendMessage(db, {
        conversationId: conv.id,
        type: 'text',
        role: 'user',
        content: normalizedInput.userMessageContent,
      });

      // 3. 调度决策
      //    结构化 action 走确定性路由;自由文本才交给 AI Router。
      let decision: RouterDecision;
      if (normalizedInput.decision) {
        decision = normalizedInput.decision;
      } else if (normalizedInput.action) {
        decision = createActionDecision(normalizedInput.action, conv);
      } else {
        const routerInput: RouterInput = {
          userText: normalizedInput.text ?? '',
          profile: null,
          currentLearningState: conv.learningState,
          conversationId: conv.id,
          availableSkills: skillRegistry.names(),
        };
        try {
          decision = await aiRouter.decide(routerInput);
          decision = normalizeRouterDecision(
            conv,
            normalizedInput.text ?? '',
            decision
          );
        } catch (e) {
          if (e instanceof HttpError) throw e;
          const reason = e instanceof Error ? e.message : String(e);
          const details = getDevErrorDetails(e);
          throw new HttpError(
            502,
            ERROR_CODES.PROVIDER_ERROR,
            `AI 路由失败: ${reason}`,
            details ? { upstream: details } : undefined
          );
        }
      }
      const skill = skillRegistry.get(decision.skillName);
      if (!skill) {
        throw new HttpError(
          500,
          ERROR_CODES.SKILL_NOT_FOUND,
          `Skill 不存在: ${decision.skillName}`
        );
      }
      if (!isSkillAllowedInState(skill.allowedStates, conv.learningState)) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          `当前状态 ${conv.learningState} 不能执行 ${describeChatAction(normalizedInput.action)}`
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
        ...(archivedConversationId != null
          ? { archivedConversationId }
          : {}),
      };
      res.status(202).json({ data: respBody });
    } catch (e) {
      next(e);
    }
  });

  // —— 停止生成 ————————————————————————————————————————————
  router.post('/streams/:streamId/abort', auth, (req, res, next) => {
    try {
      const streamId = streamIdSchema.parse(req.params.streamId);
      const run = activeSkillRuns.get(streamId);
      if (!run || run.userId !== req.user!.id) {
        throw new HttpError(
          404,
          ERROR_CODES.NOT_FOUND,
          '没有可停止的生成任务'
        );
      }
      run.aborted = true;
      run.controller.abort();
      publishAbortDone(db, run);
      markAgentRunStatus(
        db,
        run.runId,
        'aborted',
        Date.now() - run.startedAt,
        'AbortError'
      );
      res.json({ data: { streamId, aborted: true } });
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
    let lastSentSeq = lastSeq;
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

    const persistedEvents = replayPersistedStreamEvents(db, streamId, lastSentSeq);
    for (const event of persistedEvents) {
      send(event);
      lastSentSeq = Math.max(lastSentSeq, event.seq);
      if (ended) break;
    }

    const unsubscribe = ended
      ? () => {}
      : streamBus.subscribe(streamId, lastSentSeq, send);

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

function replayPersistedStreamEvents(
  db: Db,
  streamId: string,
  lastSeq: number
): SkillEvent[] {
  const messageId = extractStreamMessageId(streamId);
  if (!messageId) return [];
  return getMessageStreamEvents(db, messageId).filter((event) => event.seq > lastSeq);
}

function extractStreamMessageId(streamId: string): number | null {
  const match = /^stream-(\d+)-[A-Za-z0-9]+$/.exec(streamId);
  if (!match) return null;
  const messageId = Number(match[1]);
  return Number.isInteger(messageId) && messageId > 0 ? messageId : null;
}

function parsePositiveId(raw: string | string[] | undefined): number {
  if (Array.isArray(raw)) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, '非法 id');
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, '非法 id');
  }
  return id;
}

function assertConversationOwner(
  db: Db,
  conversationId: number,
  userId: number
): ConversationDTO {
  const conv = getConversation(db, conversationId, userId);
  if (!conv) {
    throw new HttpError(
      404,
      ERROR_CODES.CONVERSATION_NOT_FOUND,
      '会话不存在或无权访问'
    );
  }
  return conv;
}

function requireBranchThread(
  db: Db,
  threadId: number,
  userId: number
): BranchThreadDTO {
  const thread = getBranchThread(db, threadId, userId);
  if (!thread) {
    throw new HttpError(
      404,
      ERROR_CODES.NOT_FOUND,
      '辅助追问支线不存在或无权访问'
    );
  }
  return thread;
}

function extractReviewAttemptId(source: MessageDTO): number | null {
  for (const widget of widgetSnapshotToArray(source.widgetSnapshot)) {
    if (widget.type === 'grading-result') {
      const attemptId = widget.data?.attemptId;
      if (typeof attemptId === 'number') return attemptId;
    }
    if (widget.type === 'follow-up-source') {
      const context = widget.data?.reviewContext;
      if (
        typeof context === 'object' &&
        context !== null &&
        typeof (context as { attemptId?: unknown }).attemptId === 'number'
      ) {
        return (context as { attemptId: number }).attemptId;
      }
    }
  }
  return null;
}

function updateBranchReviewMasteries(
  db: Db,
  userId: number,
  grading: GradingResultDTO,
  createdEvents: ErrorTagEventDTO[]
): number {
  for (const event of createdEvents) {
    applyMasteryUpdate(db, {
      userId,
      tag: event.tag,
      score: grading.score,
      isCorrect: grading.isCorrect,
    });
  }
  return createdEvents.length;
}

function formatBranchReviewMessage(
  createdCount: number,
  existingCount: number,
  masteriesUpdatedCount: number
): string {
  if (createdCount > 0) {
    return `已加入复盘:新增 ${createdCount} 条错因记录,同步更新 ${masteriesUpdatedCount} 个掌握度。`;
  }
  if (existingCount > 0) {
    return '这条追问关联的错因已经在复盘统计中,不会重复计入。';
  }
  return '这条追问已检查过,暂时没有可新增的复盘记录。';
}

async function buildBranchAssistantText(
  provider: AIProvider,
  question: string,
  source: MessageDTO | null,
  hideSourceContent: boolean,
  branchHistory: MessageDTO[]
): Promise<string> {
  if (provider.chat) {
    let text = '';
    try {
      for await (const ev of provider.chat({
        system: buildBranchSystemPrompt(hideSourceContent),
        messages: buildBranchProviderMessages(
          question,
          source,
          hideSourceContent,
          branchHistory
        ),
        maxTokens: 700,
        signal: new AbortController().signal,
      })) {
        if (ev.type === 'text-delta' && ev.text) {
          text += ev.text;
        }
      }
    } catch (e) {
      const details = getDevErrorDetails(e);
      throw new HttpError(
        502,
        ERROR_CODES.PROVIDER_ERROR,
        `辅助追问生成失败: ${e instanceof Error ? e.message : String(e)}`,
        details ? { upstream: details } : undefined
      );
    }
    if (text.trim()) return text.trim();
  }

  return buildBranchFallbackText(question, source, hideSourceContent);
}

function buildBranchSystemPrompt(hideSourceContent: boolean): string {
  return [
    '你是 Echora 的英语学习辅助追问教练。',
    '你正在右侧支线里回答,不能改变主学习流状态,不能生成下一题,不能替用户提交答案。',
    '用中文回答,简洁、具体,优先解释英语表达、语法、词汇、语气和场景用法。',
    hideSourceContent
      ? '当前主线处于锁定态,来源正文已隐藏。不要泄露、猜测或补全标准答案、参考表达、完整翻译或等价答案;只给概念提示和解题思路。'
      : '如果引用来源内容,只围绕用户追问解释,不要声称已经把任何内容加入统计或复盘。',
  ].join('\n');
}

function buildBranchProviderMessages(
  question: string,
  source: MessageDTO | null,
  hideSourceContent: boolean,
  branchHistory: MessageDTO[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    {
      role: 'user',
      content: [
        `来源:${summarizeBranchSource(source, hideSourceContent)}`,
        source && !hideSourceContent
          ? `来源角色:${source.role};来源技能:${source.skillName ?? 'unknown'};来源正文:${source.content ?? '(无正文)'}`
          : '来源正文:已隐藏。',
      ].join('\n'),
    },
  ];
  for (const msg of branchHistory) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const content = msg.content?.trim();
    if (!content) continue;
    messages.push({ role: msg.role, content });
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

function buildBranchFallbackText(
  question: string,
  source: MessageDTO | null,
  hideSourceContent: boolean
): string {
  const sourceSummary = summarizeBranchSource(source, hideSourceContent);
  const lower = question.toLowerCase();
  const guidance =
    /为什么|为啥|why|explain|解释|怎么/.test(lower)
      ? '可以先看这句话在当前语境里的功能,再看词义、搭配和语法位置。'
      : '我会围绕你选中的内容回答,不改变主学习进度。';

  return [
    `${sourceSummary}`,
    '如果来源是还没提交的题目,这里只给提示和概念解释,不会泄露标准答案或完整翻译。',
    `关于“${question}”:${guidance}`,
  ].join('\n');
}

function summarizeBranchSource(
  source: MessageDTO | null,
  hideSourceContent: boolean
): string {
  if (!source) return '我没有找到原始来源,先按这条支线的问题解释。';
  const content = source.content?.trim();
  if (hideSourceContent) return `我会基于第 ${source.seq} 条消息继续解释。`;
  if (!content) return `我会基于第 ${source.seq} 条消息继续解释。`;
  return `我会基于第 ${source.seq} 条消息继续解释:“${truncateText(content, 80)}”。`;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 1)}…`;
}

const LOCKED_USER_ANSWER_TEXT = '完成当前题后查看完整答案';
const LOCKED_GRADING_TEXT = '参考表达与批改详情已暂时隐藏。';

function sanitizeMessagesForLock(
  messages: MessageDTO[],
  conv: ConversationDTO
): MessageDTO[] {
  if (!shouldLockHistory(conv)) return messages;

  return messages.map((msg, index) => {
    if (isLockedUserAnswer(messages, index)) {
      return {
        ...msg,
        content: LOCKED_USER_ANSWER_TEXT,
        widgetSnapshot: null,
      };
    }

    if (isLockedGradingMessage(msg)) {
      return {
        ...msg,
        content: '',
        widgetSnapshot: sanitizeLockedWidgetSnapshot(
          msg.widgetSnapshot,
          msg.id,
          conv.learningState === 'grading' ? 'grading' : 'practicing'
        ),
      };
    }

    return msg;
  });
}

function shouldLockHistory(conv: ConversationDTO): boolean {
  return (
    conv.status === 'active' &&
    (conv.lockPolicy === 'locked' ||
      conv.learningState === 'practicing' ||
      conv.learningState === 'grading')
  );
}

function isLockedUserAnswer(messages: MessageDTO[], index: number): boolean {
  const msg = messages[index];
  const next = messages[index + 1];
  return (
    msg.role === 'user' &&
    next?.role === 'assistant' &&
    next.skillName === 'grade'
  );
}

function isLockedGradingMessage(msg: MessageDTO): boolean {
  return msg.role === 'assistant' && (
    msg.skillName === 'grade' ||
    widgetSnapshotToArray(msg.widgetSnapshot).some(
      (widget) => widget.type === 'grading-result'
    )
  );
}

function sanitizeLockedWidgetSnapshot(
  snapshot: unknown,
  messageId: number,
  variant: 'practicing' | 'grading'
): LearningWidgetInstance | LearningWidgetInstance[] {
  const widgets = widgetSnapshotToArray(snapshot);
  if (widgets.length === 0) {
    return makeLockWidget(messageId, variant);
  }

  const sanitized = widgets.map((widget, index) =>
    widget.type === 'grading-result'
      ? makeLockWidget(messageId, variant, index)
      : widget
  );
  return sanitized.length === 1 ? sanitized[0] : sanitized;
}

function widgetSnapshotToArray(snapshot: unknown): LearningWidgetInstance[] {
  if (Array.isArray(snapshot)) {
    return snapshot.filter(isWidgetInstance);
  }
  return isWidgetInstance(snapshot) ? [snapshot] : [];
}

function isWidgetInstance(value: unknown): value is LearningWidgetInstance {
  if (typeof value !== 'object' || value === null) return false;
  const widget = value as Partial<LearningWidgetInstance>;
  return typeof widget.id === 'string' && typeof widget.type === 'string';
}

function makeLockWidget(
  messageId: number,
  variant: 'practicing' | 'grading',
  index = 0
): LearningWidgetInstance {
  const title =
    variant === 'grading'
      ? '批改中 · 历史详情暂时隐藏'
      : '练习中 · 历史答案暂时隐藏';
  return {
    id: `conversation-lock-${messageId}-${index}`,
    type: 'conversation-lock',
    status: 'ready',
    data: {
      variant,
      title,
      description: LOCKED_GRADING_TEXT,
    },
    version: 1,
  };
}

interface NormalizedChatSendInput {
  text?: string;
  action?: ChatAction;
  decision?: RouterDecision;
  userMessageContent: string;
}

function normalizeChatSendInput(
  db: Db,
  userId: number,
  conv: ConversationDTO,
  body: ChatSendBody
): NormalizedChatSendInput {
  if (body.action) {
    return {
      action: body.action,
      userMessageContent: describeUserMessageForAction(body.action),
    };
  }

  const text = body.text?.trim() ?? '';
  const reviewDecision = createTextReviewDecision(conv, text);
  if (reviewDecision) {
    return {
      text,
      decision: reviewDecision,
      userMessageContent: text,
    };
  }

  const retryDecision = createTextRetryDecision(conv, text);
  if (retryDecision) {
    return {
      text,
      decision: retryDecision,
      userMessageContent: text,
    };
  }

  const difficultyDecision = createDifficultyFeedbackDecision(
    db,
    userId,
    conv,
    text
  );
  if (difficultyDecision) {
    return {
      text,
      decision: difficultyDecision,
      userMessageContent: text,
    };
  }

  const controlAction = createTextControlAction(conv, text);
  if (controlAction) {
    return {
      action: controlAction,
      userMessageContent: text,
    };
  }

  const explainDecision = createTextExplainDecision(conv, text);
  if (explainDecision) {
    return {
      text,
      decision: explainDecision,
      userMessageContent: text,
    };
  }

  const answerAction = createTextAnswerAction(db, conv, text);
  if (answerAction) {
    return {
      action: answerAction,
      userMessageContent: text,
    };
  }

  return {
    text,
    userMessageContent: text,
  };
}

function shouldStartNewRound(
  conv: ConversationDTO,
  input: NormalizedChatSendInput
): boolean {
  if (
    conv.status !== 'active' ||
    (conv.learningState !== 'awaiting_next' &&
      conv.learningState !== 'reviewing')
  ) {
    return false;
  }
  const action = input.action ?? (input.decision?.params?.action as
    | ChatAction
    | undefined);
  return action?.type === 'request-new-scenes';
}

function createDifficultyFeedbackDecision(
  db: Db,
  userId: number,
  conv: ConversationDTO,
  text: string
): RouterDecision | null {
  if (
    ![
      'scene_selecting',
      'practicing',
      'awaiting_next',
      'reviewing',
    ].includes(conv.learningState)
  ) {
    return null;
  }
  const direction = detectDifficultyFeedback(text);
  if (!direction) return null;
  const adjustment = adjustProfileLevel(db, userId, direction);
  return {
    skillName: 'scene-select',
    params: {
      action: { type: 'request-new-scenes' },
      difficultyFeedback: adjustment,
    },
    confidence: 1,
    rationale: `deterministic difficulty feedback:${direction}`,
  };
}

function describeUserMessageForAction(action: ChatAction): string {
  return action.type === 'submit-answer'
    ? action.payload.answer
    : describeChatAction(action);
}

function createTextReviewDecision(
  conv: ConversationDTO,
  text: string
): RouterDecision | null {
  if (
    conv.learningState !== 'awaiting_next' &&
    conv.learningState !== 'reviewing' &&
    conv.learningState !== 'archived'
  ) {
    return null;
  }
  if (!isReviewRequestText(text)) return null;
  return {
    skillName: 'review',
    params: { source: 'deterministic-text' },
    confidence: 1,
    rationale: 'deterministic text route:review',
  };
}

function createTextRetryDecision(
  conv: ConversationDTO,
  text: string
): RouterDecision | null {
  if (
    conv.learningState !== 'awaiting_next' &&
    conv.learningState !== 'reviewing' &&
    conv.learningState !== 'scene_selecting' &&
    conv.learningState !== 'practicing'
  ) {
    return null;
  }
  const targetTag = extractRetryTargetTag(text);
  if (targetTag == null) return null;
  return {
    skillName: 'retry',
    params: targetTag ? { targetTag } : {},
    confidence: 1,
    rationale: 'deterministic text route:retry',
  };
}

function createTextExplainDecision(
  conv: ConversationDTO,
  text: string
): RouterDecision | null {
  if (
    ![
      'practicing',
      'grading',
      'awaiting_next',
      'reviewing',
      'scene_selecting',
    ].includes(conv.learningState)
  ) {
    return null;
  }
  if (!isExplainRequestText(text)) return null;
  return {
    skillName: 'explain',
    params: { source: 'deterministic-text' },
    confidence: 1,
    rationale: 'deterministic text route:explain',
  };
}

function createTextControlAction(
  conv: ConversationDTO,
  text: string
): ChatAction | null {
  const isNext = isNextPracticeText(text);
  const isScene = isSceneRequestText(text);
  if (isNext || isScene) {
    if (conv.learningState === 'practicing') {
      return isScene
        ? { type: 'request-new-scenes' }
        : { type: 'next-question' };
    }
    if (
      conv.learningState === 'awaiting_next' ||
      conv.learningState === 'scene_selecting' ||
      conv.learningState === 'reviewing'
    ) {
      return { type: 'request-new-scenes' };
    }
  }
  return null;
}

function createTextAnswerAction(
  db: Db,
  conv: ConversationDTO,
  text: string
): ChatAction | null {
  if (conv.learningState !== 'practicing') return null;
  if (isPracticeControlText(text)) return null;
  const dialogue = getActiveSceneDialogue(db, conv.id);
  const attempt = findLatestAttempt(db, conv.id, dialogue?.sceneId);
  if (!attempt || !isAttemptAnswerable(db, attempt)) return null;
  return {
    type: 'submit-answer',
    payload: { attemptId: attempt.id, answer: text },
  };
}

function isContinuePracticeText(text: string): boolean {
  return isNextPracticeText(text) || isSceneRequestText(text);
}

function isNextPracticeText(text: string): boolean {
  const normalized = normalizeControlText(text);
  if (!normalized) return false;
  return [
    '出题',
    '开始',
    '开始练习',
    '继续',
    '下一题',
    '下一个',
    'go',
    'next',
    'start',
    'continue',
  ].includes(normalized);
}

function isSceneRequestText(text: string): boolean {
  const normalized = normalizeControlText(text);
  if (!normalized) return false;
  return ['换场景', '换一批', '重新生成场景'].includes(normalized);
}

function isReviewRequestText(text: string): boolean {
  const normalized = normalizeControlText(text);
  if (!normalized) return false;
  return ['复盘', '总结', '学习报告', '报告', 'review'].includes(normalized);
}

function isExplainRequestText(text: string): boolean {
  const normalized = normalizeControlText(text);
  if (!normalized) return false;
  if (
    [
      '为什么',
      '为啥',
      '解释',
      '讲讲',
      '怎么改',
      '哪里错',
      '错在哪',
      'why',
      'explain',
      'howtofix',
    ].includes(normalized)
  ) {
    return true;
  }
  return /为什么|为啥|解释|怎么改|哪里错|错在哪|why|explain/i.test(text);
}

function extractRetryTargetTag(text: string): string | null {
  const trimmed = text.trim();
  const normalized = normalizeControlText(trimmed);
  if (!normalized) return null;
  if (
    ['重练', '重练错题', '错题重练', '开始重练', '专项重练', 'retry'].includes(
      normalized
    )
  ) {
    return '';
  }
  const match = trimmed.match(/^(?:重练|专项重练|retry)[:：\s]+([a-zA-Z_]+)$/i);
  return match?.[1] ?? null;
}

function detectDifficultyFeedback(
  text: string
): DifficultyFeedbackDirection | null {
  const normalized = normalizeControlText(text);
  if (!normalized) return null;
  if (
    normalized.includes('太难') ||
    normalized.includes('太難') ||
    normalized.includes('简单一点') ||
    normalized.includes('簡單一點') ||
    normalized.includes('简单点') ||
    normalized.includes('簡單點') ||
    /too(hard|difficult)|easier|simpler/i.test(text)
  ) {
    return 'down';
  }
  if (
    normalized.includes('太简单') ||
    normalized.includes('太簡單') ||
    normalized.includes('太容易') ||
    normalized.includes('难一点') ||
    normalized.includes('難一點') ||
    /too easy|harder|more difficult|more challenging/i.test(text)
  ) {
    return 'up';
  }
  return null;
}

function isPracticeControlText(text: string): boolean {
  const normalized = normalizeControlText(text);
  if (!normalized) return false;
  return isContinuePracticeText(text);
}

function normalizeControlText(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?。！？\s]+/g, '');
}

function isArchivedConversation(conv: ConversationDTO): boolean {
  return conv.status === 'archived' || conv.learningState === 'archived';
}

function isArchivedReviewRequest(body: ChatSendBody): boolean {
  return typeof body.text === 'string' && isReviewRequestText(body.text);
}

function isAttemptAnswerable(db: Db, attempt: ExerciseAttemptDTO): boolean {
  if (attempt.status === 'pending' || attempt.status === 'submitted') {
    return true;
  }
  if (attempt.status !== 'graded' || attempt.retryCount >= 2) {
    return false;
  }
  const grading = getGradingByAttempt(db, attempt.id);
  return grading?.isCorrect === false;
}

function createActionDecision(
  action: ChatAction,
  conv?: ConversationDTO
): RouterDecision {
  const skillName =
    action.type === 'request-new-scenes' || action.type === 'select-scene'
      ? 'scene-select'
      : action.type === 'next-question' && conv?.activeSkill === 'retry'
      ? 'retry'
      : action.type === 'submit-answer'
      ? 'grade'
      : 'practice';
  return {
    skillName,
    params: { action },
    confidence: 1,
    rationale: `deterministic action route:${action.type}`,
  };
}

function normalizeRouterDecision(
  conv: ConversationDTO,
  userText: string,
  decision: RouterDecision
): RouterDecision {
  if (
    (conv.learningState === 'practicing' ||
      conv.learningState === 'grading') &&
    decision.skillName === 'general-chat'
  ) {
    throw new HttpError(
      400,
      ERROR_CODES.VALIDATION_FAILED,
      `当前状态 ${conv.learningState} 不能降级到闲聊。请先完成当前题,或输入"换场景"。`
    );
  }

  if (
    decision.confidence < LOW_CONFIDENCE_THRESHOLD &&
    shouldShowIntentConfirm(conv.learningState)
  ) {
    return {
      skillName: 'general-chat',
      params: {
        intentConfirm: buildIntentConfirmPayload(
          conv.learningState,
          userText,
          decision
        ),
      },
      confidence: 1,
      rationale: `low confidence intent-confirm:${decision.rationale}`,
    };
  }

  if (decision.skillName === 'general-chat') {
    return {
      ...decision,
      params: {
        ...decision.params,
        userText,
      },
    };
  }

  return decision;
}

function shouldShowIntentConfirm(state: LearningState): boolean {
  return (
    state === 'scene_selecting' ||
    state === 'awaiting_next' ||
    state === 'reviewing'
  );
}

function buildIntentConfirmPayload(
  state: LearningState,
  userText: string,
  originalDecision: RouterDecision
): Record<string, unknown> {
  return {
    question: '你想让我怎么处理?',
    prompt: userText,
    risk: 'medium',
    originalDecision,
    choices: intentChoicesForState(state),
  };
}

function intentChoicesForState(
  state: LearningState
): Array<{ id: string; title: string; desc: string; action: string }> {
  if (state === 'scene_selecting') {
    return [
      {
        id: 'new-scenes',
        title: '换一批场景',
        desc: '重新生成可练习的场景卡片',
        action: 'action:request-new-scenes',
      },
      {
        id: 'custom-topic',
        title: '按我这句话找场景',
        desc: '把刚才输入当作想练的主题',
        action: 'text:换场景',
      },
    ];
  }
  return [
    {
      id: 'review',
      title: '看本轮复盘',
      desc: '查看平均分、薄弱点和下一步建议',
      action: 'text:复盘',
    },
    {
      id: 'retry',
      title: '重练薄弱点',
      desc: '基于最近错因生成专项题',
      action: 'text:重练',
    },
    {
      id: 'new-scenes',
      title: '换一个场景',
      desc: '进入新的场景练习',
      action: 'action:request-new-scenes',
    },
  ];
}

function isSkillAllowedInState(
  allowedStates: LearningState[],
  current: LearningState
): boolean {
  return allowedStates.length === 0 || allowedStates.includes(current);
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
  const activeRun: ActiveSkillRun = {
    streamId,
    runId,
    userId,
    conversationId,
    messageId,
    controller,
    startedAt,
    seq,
    aborted: false,
    terminalSent: false,
  };
  activeSkillRuns.set(streamId, activeRun);

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
        if (activeRun.aborted || controller.signal.aborted) break;
        seq += 1;
        activeRun.seq = seq;
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
          activeRun.terminalSent = true;
        }
      }

      if (activeRun.aborted || controller.signal.aborted) {
        publishAbortDone(db, activeRun);
        markAgentRunStatus(
          db,
          runId,
          'aborted',
          Date.now() - startedAt,
          'AbortError'
        );
        return;
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
        activeRun.seq = lastEvent.seq;
        activeRun.terminalSent = true;
      }

      markAgentRunStatus(db, runId, 'done', Date.now() - startedAt, null);

      // grade skill 003 已自身 yield state-transition,不再需要兼容分支
    } catch (err) {
      if (activeRun.aborted || controller.signal.aborted) {
        publishAbortDone(db, activeRun);
        markAgentRunStatus(
          db,
          runId,
          'aborted',
          Date.now() - startedAt,
          'AbortError'
        );
        return;
      }
      const details = getDevErrorDetails(err);
      const errEvent: SkillEvent = {
        type: 'error',
        payload: {
          code: 'SKILL_HANDLER_FAILED',
          message: err instanceof Error ? err.message : String(err),
          ...(details ? { details } : {}),
        },
        seq: seq + 1,
        streamId,
        timestamp: Date.now(),
      };
      try {
        appendStreamEvent(db, messageId, errEvent);
      } catch {
        /* 落盘失败不阻塞 */
      }
      streamBus.publish(streamId, errEvent);
      markAgentRunStatus(
        db,
        runId,
        'failed',
        Date.now() - startedAt,
        err instanceof Error ? err.name : 'unknown'
      );
    } finally {
      activeSkillRuns.delete(streamId);
      // 不立即 close streamBus,让晚来的订阅者还能 replay
    }
  })().catch((e) => {
    console.error('[runSkill] 后台任务崩溃', e);
  });
}

function publishAbortDone(db: Db, run: ActiveSkillRun): void {
  if (run.terminalSent) return;
  const event: SkillEvent = {
    type: 'done',
    payload: { reason: 'aborted' } as Record<string, unknown>,
    seq: run.seq + 1,
    streamId: run.streamId,
    timestamp: Date.now(),
  };
  try {
    appendStreamEvent(db, run.messageId, event);
  } catch {
    /* 落盘失败不阻塞停止 */
  }
  run.seq = event.seq;
  run.terminalSent = true;
  streamBus.publish(run.streamId, event);
}

function markAgentRunStatus(
  db: Db,
  runId: string,
  status: 'done' | 'failed' | 'aborted',
  latencyMs: number,
  errorType: string | null
): void {
  db.prepare(
    `UPDATE agent_runs
     SET status = ?, latency_ms = ?, error_type = ?, finished_at = datetime('now')
     WHERE run_id = ?`
  ).run(status, latencyMs, errorType, runId);
}
