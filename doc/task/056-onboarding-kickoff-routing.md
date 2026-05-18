> 日期: 2026-05-18
> 序号: 056
> 任务: 修复 onboarding 首轮被 general-chat 兜底的问题

## 任务背景

进入 `/onboarding` 时前端会自动发送 `hi` 启动首轮对话，但默认 stub provider 会把 `hi` 路由到 `general-chat`，导致页面显示“想先练口语、看复盘,还是换个新场景?”，与 onboarding 画像采集流程不符。本次修复将 onboarding 首轮启动改为确定性动作，并给服务端/前端补回归测试。

## 执行摘要

- `shared/api.ts` - 新增内部 `ChatAction { type: 'start-onboarding' }`，用于 onboarding 首轮启动。
- `server/routes/chat.ts` - `start-onboarding` 直接路由到 `onboarding` skill，并以 `system` 消息落库；`learningState='onboarding'` 下的自由文本也确定性路由到 `onboarding`，不再经过 AI Router。
- `server/skills/onboarding.ts` - stub provider 下返回确定性 onboarding 引导文案，避免复用 stub 的通用闲聊回复。
- `src/views/Onboarding/index.tsx` - 空 onboarding 会话自动发送 `start-onboarding` action，不再发送可见的 `hi` 文本。
- `src/stores/chat.ts` - `start-onboarding` 的乐观消息按 `system` 角色处理，避免 UI 闪出用户气泡。
- `server/__tests__/chat-route.test.ts`、`server/__tests__/skill-onboarding.test.ts`、`src/__tests__/stores/chat.test.ts`、`src/__tests__/views/Onboarding.test.tsx` - 增加覆盖服务端路由、stub onboarding 文案、store 乐观消息和页面自动启动的回归测试。
- `doc/knowledge/api-contract.md` - 补充 `start-onboarding` 内部动作与 onboarding 路由规则。

## 手工测试

### 后端类型检查

命令:

```bash
npx tsc -p tsconfig.server.json --noEmit
```

实测输出:

```text
无输出，退出码 0。
```

### 服务端聚焦测试

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/chat-route.test.ts server/__tests__/skill-onboarding.test.ts --runInBand
```

实测输出:

```text
PASS server/__tests__/chat-route.test.ts
PASS server/__tests__/skill-onboarding.test.ts

Test Suites: 2 passed, 2 total
Tests:       50 passed, 50 total
```

### 前端聚焦测试

命令:

```bash
npx vitest run src/__tests__/stores/chat.test.ts src/__tests__/views/Onboarding.test.tsx
```

实测输出:

```text
Test Files  2 passed (2)
Tests       15 passed (15)
```

### 真实 API 链路检查

命令:

```powershell
$env:DATABASE_PATH = 'D:\tmp\echora-onboarding-route-check.db'
$env:JWT_SECRET = 'route-check-secret'
Remove-Item 'D:\tmp\echora-onboarding-route-check.db', 'D:\tmp\echora-onboarding-route-check.db-shm', 'D:\tmp\echora-onboarding-route-check.db-wal' -Force -ErrorAction SilentlyContinue
node --import tsx -e "import { connect, closeDb } from './server/db/connect.ts'; import { migrate } from './server/db/migrate.ts'; import { createApp } from './server/createApp.ts'; import { registerAllSkills } from './server/skills/registry.ts'; import { createProvider } from './server/ai/providers/index.ts'; import { createAIRouter } from './server/ai/router.ts'; import { getConfig, resetConfigCache } from './server/config/getConfig.ts'; resetConfigCache(); const config=getConfig({reload:true}); const db=connect(config.databasePath); migrate(db); const skills=await registerAllSkills(); const provider=createProvider(config); const aiRouter=createAIRouter(provider, skills); const app=createApp({config:{...config, port:0}, db, skillRegistry:skills, aiRouter, provider}); const server=app.listen(0); const port=server.address().port; const base='http://127.0.0.1:'+port; try { const email='onboarding-'+Date.now()+'@test.local'; const reg=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'password123'})}); const regBody=await reg.json(); const token=regBody.data.token; const convRes=await fetch(base+'/api/chat/conversations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({learningState:'onboarding'})}); const conv=await convRes.json(); const sendRes=await fetch(base+'/api/chat/send',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({conversationId:conv.data.id,action:{type:'start-onboarding'}})}); const send=await sendRes.json(); await new Promise(r=>setTimeout(r,400)); const messagesRes=await fetch(base+'/api/chat/conversations/'+conv.data.id+'/messages',{headers:{'Authorization':'Bearer '+token}}); const messages=await messagesRes.json(); console.log(JSON.stringify({status:sendRes.status, decision:send.data.decision, messages:messages.data.map(m=>({role:m.role,type:m.type,skillName:m.skillName,content:m.content}))}, null, 2)); } finally { await new Promise(resolve=>server.close(resolve)); closeDb(db); }"
Remove-Item Env:\DATABASE_PATH -ErrorAction SilentlyContinue
Remove-Item Env:\JWT_SECRET -ErrorAction SilentlyContinue
```

实测输出:

```json
{
  "status": 202,
  "decision": {
    "skillName": "onboarding",
    "params": {
      "action": {
        "type": "start-onboarding"
      }
    },
    "confidence": 1,
    "rationale": "deterministic action route:start-onboarding"
  },
  "messages": [
    {
      "role": "system",
      "type": "system",
      "skillName": null,
      "content": "开始画像采集"
    },
    {
      "role": "assistant",
      "type": "text",
      "skillName": "onboarding",
      "content": "在的，我是 Echo。先告诉我怎么称呼你吧。"
    }
  ]
}
```

### 负向用例: onboarding 不再出现 general-chat 闲聊兜底

命令:

```bash
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-onboarding.test.ts -t "stub provider uses deterministic onboarding prompt"
```

实测输出:

```text
PASS server/__tests__/skill-onboarding.test.ts
```

该测试断言 stub onboarding 文案包含 `Echo` 与 `称呼`，且不包含 `复盘` 或 `换个新场景`。

### 诊断记录

- 现象: `/onboarding` 首轮显示通用闲聊话术。
- 诊断: 前端自动 `sendMessage('hi')`，服务端默认 stub route 走 `general-chat`，stub chat 对 `hi` 返回通用菜单式回复。
- 根因: onboarding 首轮启动没有结构化动作，依赖自由文本和 AI Router。
- 处置: 增加内部 `start-onboarding` action，并在服务端对 onboarding 文本建立确定性路由。

### 总结

已跑过 5 / 5 步，4 个正向验证通过，1 个负向验证通过。当前默认 stub provider 下，进入 onboarding 后不再显示用户 `hi` 气泡，也不会显示“练口语/复盘/换个新场景”的 general-chat 兜底文案。

## 遗留 TODO

- [前端] 可追加浏览器级截图回归，验证 `/onboarding` 首屏只显示 assistant 画像采集话术，不显示 system 启动消息。
- [后端] 当前真实 provider 下 onboarding 仍依赖 LLM 工具调用质量，后续可增加更强的字段提取兜底。
- [测试] `npx tsc -p tsconfig.json --noEmit` 仍受既有 `src/api/sse.test.ts` fetch mock 类型问题阻塞，非本次改动引入。

## 下一阶段建议

1. **Onboarding 浏览器回归**(PRD §2.1 / §2.2) - 用浏览器自动化覆盖注册后进入 `/onboarding` 的首屏，确认画像采集问题、进度条和输入框状态一致。
2. **画像字段兜底解析**(PRD §2.2) - 为用户输入“我叫…/四级左右”等常见文本补确定性解析，降低真实 provider 工具调用失败时的体验波动。
3. **Provider 错误提示分层**(PRD §3.5) - onboarding 中真实 provider 配置错误时，给出面向开发者的明确错误，同时避免用户看到与画像无关的闲聊兜底。
4. **前端类型检查清理**(PRD §5.1) - 修复 `src/api/sse.test.ts` 的 fetch mock 类型问题，让前端 `tsc --noEmit` 重新成为可用发布门禁。
