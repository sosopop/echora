# Repository Guidelines

## Required Workflow

Before changing code or docs, read `doc/knowledge/task-handoff.md`. Any code or documentation change must end with a new `doc/task/<NNN>-<slug>.md` execution log using the next 3-digit sequence from `doc/task/`. The log must contain: `任务背景`, `执行摘要`, `手工测试`, `遗留 TODO`, and `下一阶段建议`.

The `手工测试` section is mandatory. Record copy-pasteable commands and observed output separately, include at least one negative case, and redact secrets as `<TOKEN>` or `<API_KEY>`. If a task log contains 3 or more curl steps, also create `doc/task/<NNN>-test.py` using only the Python standard library; keep it synchronized with the curl flow.

Use `doc/prd.md` as the product source of truth, `doc/esd.md` as the engineering convention, `DESIGN.md` for visual tokens, and `doc/knowledge/` for architecture references. Update the relevant knowledge doc whenever public behavior, API contracts, shared types, test entry points, or build/release paths change.

## Project Structure & Module Organization

Echora is a Node 20+ TypeScript app with a Vite/React frontend and Express backend. Frontend code lives in `src/`: views in `src/views/`, state in `src/stores/`, API clients in `src/api/`, and global CSS in `src/styles/`. Backend code lives in `server/`, organized by `routes/`, `services/`, `middleware/`, `skills/`, `ai/`, `config/`, and `db/`. Cross-layer DTOs and skill/widget types belong in `shared/`; do not import backend-only dependencies there. SQL migrations are in `migrations/`; smoke tests are in `tests/smoke/`; project documents are in `doc/`. Generated outputs go to `dist-server/`, `dist-web/`, and `release/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies. Requires Node `>=20.10.0`.
- `copy .env.example .env`: create local config on Windows; use `cp` on POSIX.
- `npm run migrate`: apply `migrations/*.sql` and create `db/echora.db` if needed.
- `npm run dev`: start the backend dev server on port `8787`.
- `npm run dev:web`: start Vite on port `5173`, proxying `/api` to `8787`.
- `npm run build`: compile the server and build the web bundle.
- `npm test`: run Jest, Vitest, stub smoke, and onboarding smoke gates.
- `npm run test:unit`: run Jest and Vitest without smoke tests.
- `npm run test:server`: run backend Jest/Supertest tests.
- `npm run test:web`: run frontend Vitest/jsdom tests.
- `npm run test:smoke`: run stub-provider E2E smoke flow.
- `npm run test:smoke:onboarding`: run deterministic onboarding E2E scenarios.
- `npm run test:smoke:ai`: run strict Anthropic + OpenAI E2E checks; requires both API keys.
- `npm run release`: create the clean `release/` output.

Run a single backend test with `node --experimental-vm-modules ./node_modules/jest/bin/jest.js path/to.test.ts -t "name"`. Run a single frontend test with `npx vitest run path/to.test.tsx -t "name"`.

## Architecture & Runtime Boundaries

The chat pipeline is `POST /api/chat/send` -> `AIRouter.decide` -> `skill.handler(ctx)` -> `SkillEvent` stream -> DB append and `streamBus` broadcast -> `GET /api/chat/stream` SSE replay -> `useChatStore`. Message and stream-event persistence belongs in the chat route; skills should yield valid events and use service helpers for validated side effects such as profile updates.

`AI_PROVIDER` accepts `stub`, `anthropic`, or `openai`; `stub` is the zero-config default. Real providers require their matching API keys and must fail visibly when misconfigured. Do not reintroduce silent fallback from provider/router errors to stub or `general-chat`.

SQLite schema changes must be append-only `NNNN_<slug>.sql` migrations. JSON columns such as `stream_events` and `payload` are stored as strings; parse/stringify in services. SSE currently authenticates with `?token=` because `EventSource` cannot set headers; keep `req.on('close', unsubscribe)` behavior when touching streaming code.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, semicolons, and single quotes. React components and views use PascalCase; Zustand stores follow `useXStore`; tests end in `.test.ts` or `.test.tsx`. Prefer `@/*` for frontend imports and `@shared/*` for frontend/shared test imports. In backend runtime code, use relative imports for shared modules because NodeNext does not resolve TS path aliases at runtime.

Every server-side relative import must include `.js` even when the source file is `.ts`, for example `import { connectDb } from './db/connect.js';`. Do not assume ESLint, Prettier, Tailwind, CSS-in-JS, ECharts, voice/audio, Docker, CI, nginx, or systemd are part of V1 unless a task explicitly adds them.

## Testing Guidelines

Backend unit/integration tests use Jest, `ts-jest`, and Supertest under `server/__tests__/**/*.test.ts`. Frontend tests use Vitest with jsdom and Testing Library under `src/**/*.{test,spec}.{ts,tsx}`. Smoke tests live in `tests/smoke/` and cover cross-layer flows. Add focused tests for changed routing, state, skill, provider, API, migration, or SSE behavior before relying on manual verification.

## Commit & Pull Request Guidelines

Use ESD commit prefixes where practical: `feat:`, `fix:`, `refactor:`, `docs:`, and `test:`. Recent history also uses concise Chinese summaries with action verbs such as `新增`, `修复`, `更新`, and `重构`; keep commits scoped and mention the main behavior changed. Pull requests should include purpose, test results (`npm test` or narrower commands), linked task/issue when available, and screenshots for visible UI changes. Do not include secrets from `.env`; update `.env.example` when adding required configuration.
