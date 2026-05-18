> 日期: 2026-05-19
> 序号: 060
> 任务: 修复 onboarding 拒绝昵称后的重复追问

## 任务背景

`/onboarding` 中用户明确拒绝提供昵称后,模型已经开始问英语水平,但服务端兜底仍会追加“接下来先告诉我怎么称呼你”,导致工作流状态和用户感知混乱。

## 执行摘要

- `server/skills/onboarding.ts` — 增加昵称拒绝识别。用户输入包含“不告诉/不想说/保密/匿名/随便叫”等表达时,写入临时称呼 `小伙伴`,随后继续采集英语水平。
- `server/skills/onboarding.ts` — 兜底提示增加重复检测。若模型回复已经在追问昵称或英语水平,服务端不再追加同义兜底句。
- `server/skills/_helpers/onboardingFsm.ts` — 调整 prompt 缺失字段顺序为 `name → level → grade`,先追必填英语水平,避免选填年级插在必填项前。
- `server/__tests__/skill-onboarding.test.ts` — 增加拒绝昵称与“模型已问英语水平不重复追加”两个单测。
- `tests/smoke/run-smoke-onboarding.ts` — 增加 C2 场景,覆盖 HTTP/SSE 真实链路下拒绝昵称后继续问英语水平。
- `doc/knowledge/api-contract.md`、`doc/knowledge/skills.md` — 同步记录临时称呼策略与测试入口数量。

## 手工测试

### 命令

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js server/__tests__/skill-onboarding.test.ts --runInBand
```

### 观察输出

```text
PASS server/__tests__/skill-onboarding.test.ts
Tests: 9 passed, 9 total
```

```powershell
npm run test:smoke:onboarding
```

### 观察输出

```text
[smoke:onb] ✓ C2 拒绝昵称时用临时称呼并继续问英语水平
[smoke:onb] PASSED 12 / 12
```

```powershell
npx tsc -p tsconfig.server.json --noEmit
```

### 观察输出

```text
命令退出码 0,无 TypeScript 编译错误
```

### 负例

```text
C2 场景断言用户发送“不告诉你可以吗”后,assistant 文本包含“英语水平”,但不包含“接下来先告诉我怎么称呼你”。
同时断言 profile.name 写为临时称呼“小伙伴”,profile.level 仍为空,workflow 未提前转场。
```

## 遗留 TODO

- [后端] 临时称呼目前是固定值 `小伙伴`;后续如需要个性化,可增加更细的匿名称呼策略。
- [前端] 如果 UI 要显式提示“已使用临时称呼”,可在 onboarding 视图增加轻量状态提示,但当前不影响流程推进。

## 下一阶段建议

1. **完善拒答策略**(PRD §2.4) — 将 `grade/age` 等选填字段的拒答也纳入统一策略,避免未来出现类似重复追问。
2. **onboarding 文案约束**(PRD §2.5) — 收紧模型 prompt,要求拒绝昵称后直接用临时称呼并只问英语水平,减少依赖服务端兜底。
3. **前端回归截图**(PRD §4.4) — 为 `/onboarding` 增加浏览器级截图测试,覆盖拒绝昵称、多轮迷糊输入和完成转场。
