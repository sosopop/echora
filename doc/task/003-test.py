#!/usr/bin/env python3
"""
003 — 学习闭环 MVP 交互式手工测试

与 doc/task/003-learning-loop-mvp.md 中「手工测试 · 后端 API curl 串联」等价。
自动处理 TOKEN / CONV_ID / ATTEMPT_ID / STREAM_ID / SCENE_ID 占位替换。
每步展示完整 输入 / 输出 后等空格继续(任意其他键中止)。

依赖:Python 标准库(urllib / http.client)。
前置:
  1. npm run dev  (后端 :8787)
  2. .env 配 AI_PROVIDER + 对应 *_API_KEY(stub 时 scene-select 会路由到 general-chat,
     无法走完整闭环;推荐 anthropic 或 openai)
运行:
  python doc/task/003-test.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8787"
HR = "=" * 72


# —— 跨平台 getch ——————————————————————————————————————————————————————
def _make_wait_continue():
    try:
        import msvcrt  # type: ignore

        def wait() -> None:
            print("\n>>> 按 [空格] 继续 · 任意其他键中止 ...", end="", flush=True)
            ch = msvcrt.getch()
            print()
            if ch != b" ":
                print("\n用户中止。")
                sys.exit(0)

        return wait
    except ImportError:
        import termios
        import tty

        def wait() -> None:
            print("\n>>> 按 [空格] 继续 · 任意其他键中止 ...", end="", flush=True)
            fd = sys.stdin.fileno()
            old = termios.tcgetattr(fd)
            try:
                tty.setcbreak(fd)
                ch = sys.stdin.read(1)
            finally:
                termios.tcsetattr(fd, termios.TCSADRAIN, old)
            print()
            if ch != " ":
                print("\n用户中止。")
                sys.exit(0)

        return wait


wait_continue = _make_wait_continue()


# —— HTTP helper ———————————————————————————————————————————————————————
def http_request(method, path, headers=None, body=None, timeout=60):
    url = BASE + path
    data = body.encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def pretty(b):
    if not b:
        return "(空响应体)"
    txt = b.decode("utf-8", errors="replace")
    try:
        return json.dumps(json.loads(txt), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return txt


def redact_token(headers):
    out = {}
    for k, v in headers.items():
        if k.lower() == "authorization" and v.startswith("Bearer "):
            tok = v[7:]
            out[k] = f"Bearer <TOKEN:{tok[:12]}...{tok[-8:] if len(tok) > 20 else ''}>"
        else:
            out[k] = v
    return out


def step(num, title, method, path, headers=None, body=None, expect=None):
    print(f"\n{HR}\nStep {num}: {title}\n{HR}")
    print(f"\n--- 输入 ---")
    print(f"{method} {BASE}{path}")
    for k, v in (redact_token(headers) if headers else {}).items():
        print(f"{k}: {v}")
    if body:
        print()
        print(body)
    status, resp_headers, resp_body = http_request(method, path, headers, body)
    print(f"\n--- 输出 ---")
    print(f"HTTP {status}")
    ct = resp_headers.get("Content-Type") or resp_headers.get("content-type") or ""
    if ct:
        print(f"Content-Type: {ct}")
    print()
    print(pretty(resp_body))
    if expect is not None and status != expect:
        print(f"\n⚠ 预期 HTTP {expect},实际 HTTP {status}")
    wait_continue()
    return status, resp_body


def sse_step(num, title, stream_id, token, max_events=30):
    print(f"\n{HR}\nStep {num}: {title}\n{HR}")
    path = f"/api/chat/stream?streamId={stream_id}&lastSeq=0&token={token}"
    print(f"\n--- 输入 ---")
    print(f"GET {BASE}/api/chat/stream?streamId={stream_id}&lastSeq=0&token=<TOKEN>")
    print(f"\n--- 输出(读到 done/error 或最多 {max_events} 个事件) ---")
    try:
        req = urllib.request.Request(BASE + path)
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"HTTP {resp.status}")
            print(f"Content-Type: {resp.headers.get('Content-Type', '')}")
            print()
            count = 0
            collected_widget_data = None
            for raw in resp:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if not line or line.startswith(":"):
                    continue
                print(line)
                if line.startswith("data:"):
                    count += 1
                    # 提取 widget-ready 的 data 给后续 step 用
                    try:
                        evt = json.loads(line[5:].strip())
                        if evt.get("type") == "widget-ready":
                            collected_widget_data = evt.get("payload", {}).get("patch", {}).get("data", {})
                    except json.JSONDecodeError:
                        pass
                    if '"type":"done"' in line or '"type":"error"' in line:
                        break
                    if count >= max_events:
                        print(f"\n(已读 {max_events} 事件,主动停止)")
                        break
            print(f"\n(本次共 {count} 个事件)")
    except Exception as e:
        print(f"\n⚠ SSE 异常: {type(e).__name__}: {e}")
    wait_continue()
    return collected_widget_data


# —— 主流程 ——————————————————————————————————————————————————————————
def main():
    print(f"{HR}")
    print("Echora 003 — 学习闭环 MVP 交互式手工测试")
    print(f"{HR}")
    print(f"Base URL: {BASE}")
    print()
    print("前置:")
    print("  1. npm run dev (后端 :8787)")
    print("  2. .env 配 AI_PROVIDER (推荐 anthropic / openai;stub 时阶段 1+2 出题用确定数据,")
    print("     scene-select / grade 因依赖 LLM 会触发 error event)")
    wait_continue()

    # Step 1 · register + PUT profile(跳过 onboarding 采集)
    email = f"learn-{int(time.time())}@echora.dev"
    status, body = step(
        1,
        f"register (email={email})",
        "POST", "/api/auth/register",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"email": email, "password": "learn-pwd-12345"}),
        expect=201,
    )
    if status != 201:
        print("\n⚠ register 失败,中止")
        return
    token = json.loads(body)["data"]["token"]
    auth = {"Authorization": f"Bearer {token}"}
    print(f"\n  >> TOKEN({token[:18]}...) 已捕获")
    wait_continue()

    # Step 2 · PUT profile(跳过 onboarding)
    step(
        2,
        "PUT /api/profile (跳过 onboarding 采集,直接给 name+level)",
        "PUT", "/api/profile",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"name": "学习者", "level": "B1"}),
        expect=200,
    )

    # Step 3 · 新建 scene_selecting 会话
    status, body = step(
        3,
        "POST /api/chat/conversations (learningState=scene_selecting)",
        "POST", "/api/chat/conversations",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"learningState": "scene_selecting"}),
        expect=201,
    )
    conv_id = json.loads(body)["data"]["id"]
    print(f"\n  >> conv_id={conv_id}")
    wait_continue()

    # Step 4 · /send 触发 scene-select
    status, body = step(
        4,
        "POST /api/chat/send 'show me scenes' (触发 scene-select)",
        "POST", "/api/chat/send",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"conversationId": conv_id, "text": "我想看看场景"}),
        expect=202,
    )
    if status != 202:
        print(f"\n⚠ /send 返 {status},跳过后续")
        return
    stream_id = json.loads(body)["data"]["streamId"]

    # Step 5 · SSE 看 scene-cards
    widget_data = sse_step(
        5, "SSE: scene-select widget-ready (scene-cards)", stream_id, token,
    )
    cards = (widget_data or {}).get("cards", [])
    if not cards:
        print("\n⚠ 未拿到 scene-cards 候选,请检查 provider 配置")
        return
    print(f"\n  >> 收到 {len(cards)} 张候选场景")
    for c in cards:
        print(f"     - {c.get('id')} · {c.get('title')} ({c.get('difficulty', '?')})")
    scene_id = cards[0]["id"]
    print(f"\n  >> 自动选第 1 张场景: {scene_id}")
    wait_continue()

    # Step 6 · 选场景 → 生成 dialogue
    status, body = step(
        6,
        f"POST /api/chat/send action=select-scene (sceneId={scene_id})",
        "POST", "/api/chat/send",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({
            "conversationId": conv_id,
            "action": {"type": "select-scene", "payload": {"sceneId": scene_id}},
        }),
        expect=202,
    )
    stream_id = json.loads(body)["data"]["streamId"]

    # Step 7 · SSE 看 select-scene
    sse_step(
        7,
        "SSE: scene-select select-scene 分支 (dialogue 生成 + state-transition)",
        stream_id, token,
    )

    # Step 8 · 取 scene_dialogue 检查
    step(
        8,
        f"GET /api/chat/conversations/{conv_id}/scene-dialogue (检查 dialogue)",
        "GET", f"/api/chat/conversations/{conv_id}/scene-dialogue",
        headers=auth,
        expect=200,
    )

    # Step 9 · 触发 practice 出题
    status, body = step(
        9,
        "POST /api/chat/send '出题' (触发 practice 阶段 1)",
        "POST", "/api/chat/send",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"conversationId": conv_id, "text": "出题"}),
        expect=202,
    )
    stream_id = json.loads(body)["data"]["streamId"]

    # Step 10 · SSE 看 practice
    widget_data = sse_step(
        10,
        "SSE: practice widget-ready (exercise-card)",
        stream_id, token,
    )
    attempt_id = (widget_data or {}).get("attemptId")
    if not attempt_id:
        print("\n⚠ 未拿到 attemptId,跳过批改步骤")
        return
    print(f"\n  >> attempt_id={attempt_id} · 阶段 {widget_data.get('stage')} · 题号 {widget_data.get('questionNo')}")
    print(f"     reference (隐藏给 grade) 用户应在底部回答")
    wait_continue()

    # Step 11 · 提交答案
    user_answer = input("\n  >> 输入你的答案(然后回车): ").strip() or "正确"
    status, body = step(
        11,
        f"POST /api/chat/send action=submit-answer (attemptId={attempt_id}, answer='{user_answer}')",
        "POST", "/api/chat/send",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({
            "conversationId": conv_id,
            "action": {"type": "submit-answer", "payload": {"attemptId": attempt_id, "answer": user_answer}},
        }),
        expect=202,
    )
    stream_id = json.loads(body)["data"]["streamId"]

    # Step 12 · SSE 看 grade
    sse_step(
        12,
        "SSE: grade widget-ready (grading-result)",
        stream_id, token,
    )

    # Step 13 · 看 /me 与会话状态
    step(
        13,
        f"GET /api/chat/conversations (查 conv {conv_id} 当前状态)",
        "GET", "/api/chat/conversations",
        headers=auth,
        expect=200,
    )

    print(f"\n{HR}")
    print("✓ 13 步全部完成")
    print(f"{HR}")
    print(f"用户 email: {email}  conv.id={conv_id}  attempt.id={attempt_id}")
    print()
    print("继续测试:")
    print("  - 重复 Step 9+10+11+12,完成阶段 1 第 2 题")
    print("  - 阶段 1 两题全过后,Step 10 应看到 stage=2 与 mode-switch chat")
    print("  - 阶段 2 两题全过后,Step 12 应看到 state-transition awaiting_next")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n中止 (Ctrl-C)")
        sys.exit(0)
