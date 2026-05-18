/**
 * 场景对话(scene_dialogues 表)服务
 *
 * 一个 conversation 在某场景下只保留一份 active dialogue;若用户「换场景」
 * 再生成,则上一份 dialogue 仍在表中(用 conversation_id + sceneId 区分)。
 * MVP 简化:`getActiveSceneDialogue` 返回该 conversation 最新一条。
 */

import type { Db } from '../db/connect.js';
import type {
  SceneDialogueDTO,
  SceneDialogueTurn,
  CefrLevel,
} from '../../shared/api.js';

interface SceneDialogueRow {
  id: number;
  user_id: number;
  conversation_id: number;
  scene_id: string;
  title: string;
  difficulty: string;
  roles_json: string;
  turns_json: string;
  created_at: string;
}

const ALLOWED_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function safeParseArray<T>(v: string | null): T[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function rowToDTO(row: SceneDialogueRow): SceneDialogueDTO {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sceneId: row.scene_id,
    title: row.title,
    difficulty: (ALLOWED_LEVELS as string[]).includes(row.difficulty)
      ? (row.difficulty as CefrLevel)
      : 'B1',
    roles: safeParseArray<string>(row.roles_json).map(String),
    turns: safeParseArray<SceneDialogueTurn>(row.turns_json),
    createdAt: row.created_at,
  };
}

export interface CreateSceneDialogueInput {
  userId: number;
  conversationId: number;
  sceneId: string;
  title: string;
  difficulty: CefrLevel;
  roles: string[];
  turns: SceneDialogueTurn[];
}

export function createSceneDialogue(
  db: Db,
  input: CreateSceneDialogueInput
): SceneDialogueDTO {
  const result = db
    .prepare(
      `INSERT INTO scene_dialogues
       (user_id, conversation_id, scene_id, title, difficulty, roles_json, turns_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.userId,
      input.conversationId,
      input.sceneId,
      input.title,
      input.difficulty,
      JSON.stringify(input.roles),
      JSON.stringify(input.turns)
    );
  const row = db
    .prepare<[number], SceneDialogueRow>(
      'SELECT * FROM scene_dialogues WHERE id = ?'
    )
    .get(Number(result.lastInsertRowid));
  if (!row) throw new Error('createSceneDialogue 后查询失败');
  return rowToDTO(row);
}

/**
 * 该会话最新一条 scene_dialogue。
 * 若用户「换场景」会插入新行,getActive 总是返回最新的。
 */
export function getActiveSceneDialogue(
  db: Db,
  conversationId: number
): SceneDialogueDTO | null {
  const row = db
    .prepare<[number], SceneDialogueRow>(
      `SELECT * FROM scene_dialogues
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(conversationId);
  return row ? rowToDTO(row) : null;
}

export function copyActiveSceneDialogueToConversation(
  db: Db,
  sourceConversationId: number,
  targetConversationId: number,
  userId: number
): SceneDialogueDTO | null {
  const source = getActiveSceneDialogue(db, sourceConversationId);
  if (!source) return null;
  return createSceneDialogue(db, {
    userId,
    conversationId: targetConversationId,
    sceneId: source.sceneId,
    title: source.title,
    difficulty: source.difficulty,
    roles: source.roles,
    turns: source.turns,
  });
}
