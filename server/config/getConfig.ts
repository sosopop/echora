/**
 * 三层优先级配置:env > 配置文件 (SERVER_CONFIG_PATH) > 内置默认值
 *
 * 路径在边界处 path.resolve(process.cwd(), ...) 归一化,
 * 后续模块拿到的都是绝对路径,避免 cwd 漂移。
 */

import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

dotenv.config(); // 加载 .env(若存在),不覆盖已存在的 process.env

export type AIProviderKind = 'stub' | 'anthropic';

export interface Config {
  port: number;
  databasePath: string;
  jwtSecret: string;
  aiProvider: AIProviderKind;
  anthropicApiKey: string | null;
  anthropicBaseURL: string;
  anthropicModel: string;
  corsOrigin: string[];
  nodeEnv: string;
}

const DEFAULTS: Config = {
  port: 8787,
  databasePath: './db/echora.db',
  jwtSecret: 'echora-dev-secret-change-me',
  aiProvider: 'stub',
  anthropicApiKey: null,
  anthropicBaseURL: 'https://api.anthropic.com',
  anthropicModel: 'claude-sonnet-4-6',
  corsOrigin: ['http://localhost:5173'],
  nodeEnv: 'development',
};

interface RawConfig {
  [key: string]: unknown;
}

/**
 * 同时识别 UPPER_SNAKE_CASE 与 camelCase 两种键名。
 */
function pick(raw: RawConfig, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== '') return raw[k];
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function asNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function loadFile(filePath: string | undefined): RawConfig {
  if (!filePath) return {};
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) return {};
  try {
    const text = fs.readFileSync(abs, 'utf8');
    return JSON.parse(text) as RawConfig;
  } catch (e) {
    console.warn(`[getConfig] 配置文件解析失败 ${abs}:`, e);
    return {};
  }
}

let cached: Config | null = null;

export function getConfig(opts?: { reload?: boolean }): Config {
  if (cached && !opts?.reload) return cached;

  const file = loadFile(process.env.SERVER_CONFIG_PATH);
  const env = process.env as RawConfig;

  // 优先级:env > file > defaults
  const merged = (...layers: RawConfig[]): RawConfig =>
    layers.reduce<RawConfig>((acc, layer) => ({ ...acc, ...layer }), {});
  const src = merged(file, env);

  const port =
    asNumber(pick(src, 'SERVER_PORT', 'serverPort', 'PORT', 'port')) ??
    DEFAULTS.port;

  const databasePathRaw =
    asString(pick(src, 'DATABASE_PATH', 'databasePath')) ?? DEFAULTS.databasePath;
  const databasePath = path.resolve(process.cwd(), databasePathRaw);

  const jwtSecret =
    asString(pick(src, 'JWT_SECRET', 'jwtSecret')) ?? DEFAULTS.jwtSecret;

  const providerRaw =
    asString(pick(src, 'AI_PROVIDER', 'aiProvider'))?.toLowerCase() ??
    DEFAULTS.aiProvider;
  const aiProvider: AIProviderKind =
    providerRaw === 'anthropic' ? 'anthropic' : 'stub';

  const anthropicApiKey =
    asString(pick(src, 'ANTHROPIC_API_KEY', 'anthropicApiKey')) ?? null;

  const anthropicBaseURL = (
    asString(pick(src, 'ANTHROPIC_BASE_URL', 'anthropicBaseURL')) ??
    DEFAULTS.anthropicBaseURL
  ).replace(/\/+$/, '');

  const anthropicModel =
    asString(pick(src, 'ANTHROPIC_MODEL', 'anthropicModel')) ??
    DEFAULTS.anthropicModel;

  const corsOrigin =
    asStringArray(pick(src, 'CORS_ORIGIN', 'corsOrigin')) ?? DEFAULTS.corsOrigin;

  const nodeEnv =
    asString(pick(src, 'NODE_ENV', 'nodeEnv')) ?? DEFAULTS.nodeEnv;

  // 生产环境默认密钥告警(不阻断启动)
  if (nodeEnv === 'production' && jwtSecret === DEFAULTS.jwtSecret) {
    console.warn(
      '[getConfig] WARNING: JWT_SECRET 仍为开发默认值,生产环境必须显式设置'
    );
  }

  // 选 anthropic 但缺 key
  if (aiProvider === 'anthropic' && !anthropicApiKey) {
    console.warn(
      '[getConfig] WARNING: AI_PROVIDER=anthropic 但 ANTHROPIC_API_KEY 未设置,运行时将抛错'
    );
  }

  cached = {
    port,
    databasePath,
    jwtSecret,
    aiProvider,
    anthropicApiKey,
    anthropicBaseURL,
    anthropicModel,
    corsOrigin,
    nodeEnv,
  };
  return cached;
}

/** 测试用:重置缓存 */
export function resetConfigCache(): void {
  cached = null;
}
