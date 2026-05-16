# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Starting Any Task

Read `doc/knowledge/task-handoff.md` first — it's a permanent workflow contract. **Every task that changes code or docs must end by producing a `doc/task/<NNN>-<slug>.md` execution log** with five fixed sections: 任务背景 / 执行摘要 / **手工测试** / 遗留 TODO / 下一阶段建议. Filename uses a 0-padded 3-digit serial starting from `001`; before creating a new one, list `doc/task/` and take `max + 1`.

The **手工测试** section is mandatory (002+ convention). Record actual commands + outputs (curl for backend, browser steps for UI), include at least one negative case, redact secrets to `<TOKEN>` / `<API_KEY>`, and document any diagnostic findings (现象 → 诊断 → 根因 → 处置) even when the issue is external (network, config, third-party endpoint). **Commands must be directly copy-pasteable** — never prefix with `$ `, `> `, or `PS> ` shell prompts; put the command alone in one code block and the output in a separate block.

If the manual-test section contains **≥ 3 curl steps**, also produce a paired Python script `doc/task/<NNN>-test.py` that runs the equivalent flow end-to-end, auto-substituting placeholders (TOKEN / CONV_ID / STREAM_ID), printing full input + output for each step, and waiting for spacebar to continue (any other key aborts). Use stdlib only (`urllib` / `http.client`), Windows + POSIX cross-compatible. The script must stay in sync with the curl steps in the markdown — change one, change both.

The authoritative product spec is `doc/prd.md` (V1 MVP), the authoritative engineering convention is `doc/esd.md`, and the design tokens are in `DESIGN.md` (with a live HTML prototype under `doc/design/`).

## Common Commands

```bash
npm install                  # First time / after dep changes
copy .env.example .env       # Windows; cp on POSIX

npm run migrate              # Apply migrations/*.sql (creates db/echora.db on first run)
npm run dev                  # Backend tsx watch on :8787 (NODE_ENV=development)
npm run dev:web              # Frontend Vite on :5173 (proxies /api → :8787)

npm test                     # Full gate: server + web + smoke + smoke:onboarding
npm run test:server          # Jest + supertest (backend)
npm run test:web             # Vitest + jsdom (frontend)
npm run test:smoke           # E2E with stub provider: register → send → consume SSE
npm run test:smoke:onboarding # E2E with ScriptedProvider: 10 onboarding scenarios (deterministic)
npm run test:smoke:ai        # Strict E2E against real Anthropic + OpenAI (needs both keys)

npm run build                # tsc -p tsconfig.server.json && vite build
npm run release              # Build + stage clean release/ directory
```

Run a single backend test: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js path/to.test.ts` or `-t "name"`.
Run a single frontend test: `npx vitest run path/to.test.tsx` or `-t "name"`.

Commit prefixes (ESD §11.2): `feat:` / `fix:` / `refactor:` / `docs:` / `test:`.

## Architecture: The Skill Event Loop

The runtime hinges on one async pipeline that's worth understanding before touching anything:

```
user input
  → POST /api/chat/send (server/routes/chat.ts)
  → AIRouter.decide (server/ai/router.ts)
       → provider.route() returns { skillName, params, confidence }
       → second pass: validate skill exists + learningState ∈ skill.allowedStates
       → fallback to general-chat on any validation failure
  → background task runs skill.handler(ctx) — an async generator yielding SkillEventInput
  → each yielded event gets seq/streamId/timestamp added, gets appended to
       messages.stream_events (JSON array) AND broadcast via streamBus
  → GET /api/chat/stream (SSE) subscribes; replays buffered events past lastSeq on reconnect
  → frontend useChatStore consumes events, accumulates text-chunk into streamBuffer,
       tracks widget-* into activeWidgets keyed by widget.id
```

**The invariant: SkillEvents are the single source of truth.** Skill handlers never write to the DB directly — the chat route consumes yielded events and persists them. To add a new skill, only yield correct events; persistence, SSE plumbing, and `agent_runs` accounting are free.

The 8 stub skills in `server/skills/` are minimal templates: 1–2 `text-chunk` + (optional) `mode-switch` + `widget-init` → `widget-ready` + `done`. See `doc/knowledge/skills.md` for the full skill ↔ widget ↔ allowedStates mapping.

## Architecture: Provider Abstraction

`AI_PROVIDER` env (`stub` | `anthropic` | `openai`) selects the implementation via `server/ai/providers/index.ts`. **Stub is the default** for zero-config dev.

- `AnthropicProvider` (002): `route()` uses `tool_use` to force JSON; `chat()` streams via `messages.stream`. Configure with `ANTHROPIC_API_KEY` + optional `ANTHROPIC_BASE_URL` (default `https://api.anthropic.com`, supports third-party relays) + `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`).
- `OpenAIProvider` (002 patch): `route()` uses function calling; `chat()` streams via `chat.completions.create({stream:true})`. Configure with `OPENAI_API_KEY` + optional `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) + `OPENAI_MODEL` (default `gpt-4o-mini`).

**No fallback** (002 patch): when Provider is misconfigured or fails, `createProvider` and `AIRouter.decide` both throw — the chat route maps the error to `502 PROVIDER_ERROR` so the frontend sees the real cause. This is intentional: silent degradation hides upstream issues. To diagnose without going through the chat flow, use `scripts/diag-anthropic.ts` / `scripts/diag-openai.ts`. To exercise both providers' real route+chat path, run `npm run test:smoke:ai` (strict mode — fails if any provider's API key is missing).

## Shared Code Boundaries (`shared/`)

Imported by both server and src. Strict rules:

- **No backend deps** (`better-sqlite3`, `express`, `jsonwebtoken`) — these crash Vitest jsdom. Only `zod` and pure TS.
- **`@shared/*` alias is frontend-only** (Vite resolves at bundle time). Backend uses relative imports `../../shared/skill.js` because NodeNext doesn't resolve tsconfig paths at runtime.
- **`.js` extension required on every server-side relative import** even when the source is `.ts`. `import { connect } from './db/connect.js'` is correct; omitting `.js` fails at runtime with `ERR_MODULE_NOT_FOUND`.
- **`ServerSkillContext`** (server/skills/types.ts) extends shared `SkillContext` with `provider` + `db`. Server-side skills accept this expanded ctx; the registry stores the base `Skill` interface and TS's method-signature bivariance allows the assignment.

## Frontend State

5 Zustand stores in `src/stores/`:
- `auth` — token + user, persists to `localStorage.echora_token`, `hydrated` flag for RouteGuard, registers itself as the token getter for `api/client.ts`. hydrate/login/register all chain `useProfileStore.load()`.
- `chat` — conversations, messages, `streamingMessageId`, `streamBuffer` keyed by messageId, `activeWidgets` keyed by widgetId, current `inputMode`. Consumes `state-transition` events (→ setState + reload profile).
- `learningState` — 7-state mirror; illegal transitions `console.warn` only (server is the truth)
- `profile` — backed by `/api/profile` (002). Exports `selectIsOnboardingComplete` for RouteGuard.
- `theme` — writes `data-theme` to `<html>`, shares `localStorage.echora-theme` key with the design prototype

`src/main.tsx` startup order: import styles → `theme.apply()` → register 401 callback → `auth.hydrate()` → render `<RouterProvider />`. `<RouteGuard>` wraps every route and gates on `(hydrated, user, profileLoaded, isOnboardingComplete, pathname)`.

## Database

10 tables created upfront by `migrations/0001_init.sql`. New schema changes go in `NNNN_<slug>.sql` files — migrations are append-only, run inside a transaction by `server/db/migrate.ts`, and idempotent via `schema_migrations`. JSON fields (`weakness_tags`, `widget_snapshot`, `stream_events`, `payload`) are stored as strings; services do parse/stringify.

## SSE Caveats

- `EventSource` cannot set custom headers, so V1 SSE auth uses `?token=` query param. Production should migrate to `fetch + ReadableStream`. Noted in `doc/knowledge/api-contract.md`.
- `req.on('close', unsubscribe)` is mandatory in `/api/chat/stream`; without it, streamBus subscribers leak.
- The `ended` flag in the SSE `send` callback short-circuits writes after `done`/`error`, preventing `ERR_STREAM_WRITE_AFTER_END` when buffered events arrive late.

## Configuration

`server/config/getConfig.ts` resolves `env > SERVER_CONFIG_PATH JSON file > defaults`. It accepts both `UPPER_SNAKE` and `camelCase` keys. Paths are normalized with `path.resolve(process.cwd(), ...)` at the boundary so cwd drift doesn't affect runtime. `JWT_SECRET` defaults to a dev value and warns (but doesn't block) when `NODE_ENV=production`.

## Knowledge Base

`doc/knowledge/` is the engineering reference. Each topic doc uses the same 4 H2s: 入口 / 关键源码 / 约束与失败点 / 测试入口. **Update the relevant doc whenever changing public behavior, API contracts, shared types, test entries, or build/release paths** — not just code.

## Out of Scope for V1 (PRD §4.10, ESD §4)

Don't add or assume:
- ESLint / Prettier / lint scripts — ESD explicitly says don't assume they exist
- ECharts / voice / audio (text-only product)
- Tailwind / CSS-in-JS (sticks with `tokens.css` + `components.css`)
- JWT refresh tokens (re-login on 7-day expiry)
- Guest mode / user-typed slash commands / custom theme colors
- Docker / CI / nginx / systemd configs
