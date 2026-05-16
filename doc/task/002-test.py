#!/usr/bin/env python3
"""
002 — Onboarding 端到端 + Anthropic/OpenAI Provider 接入手工测试

与 doc/task/002-onboarding-end-to-end.md 中「手工测试 · 后端 API」一节
的 6 步 curl 命令等价。自动处理 TOKEN / CONV_ID / STREAM_ID 占位替换,
每步展示完整 输入 / 输出,然后等空格继续(任意其他键中止)。

依赖:仅 Python 标准库(urllib / http.client)。
前置:
  1. npm run dev  (后端跑在 :8787)
  2. .env 配 AI_PROVIDER + 对应 *_API_KEY(stub 也可,但 Step 5 会走 general-chat)
运行:
  python doc/task/002-test.py
  或在 Windows PowerShell:
  py doc/task/002-test.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8787"
HR = "=" * 72
SUB = "-" * 36


# —— 跨平台 getch ——————————————————————————————————————————————————————
def _make_wait_continue():
    try:
        import msvcrt  # type: ignore[import-not-found]

        def wait() -> None:
            print(
                "\n>>> 按 [空格] 继续 · 任意其他键中止 ...",
                end="",
                flush=True,
            )
            ch = msvcrt.getch()
            print()
            if ch not in (b" ",):
                print("\n用户中止。")
                sys.exit(0)

        return wait
    except ImportError:
        import termios
        import tty

        def wait() -> None:
            print(
                "\n>>> 按 [空格] 继续 · 任意其他键中止 ...",
                end="",
                flush=True,
            )
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
def http_request(
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    timeout: int = 30,
) -> tuple[int, dict[str, str], bytes]:
    url = BASE + path
    data = body.encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers=headers or {}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def pretty(b: bytes) -> str:
    if not b:
        return "(空响应体)"
    txt = b.decode("utf-8", errors="replace")
    try:
        return json.dumps(json.loads(txt), ensure_ascii=False, indent=2)
    except json.JSONDecodeError:
        return txt


def redact_token(headers: dict[str, str]) -> dict[str, str]:
    out = {}
    for k, v in headers.items():
        if k.lower() == "authorization" and v.startswith("Bearer "):
            tok = v[7:]
            out[k] = f"Bearer <TOKEN:{tok[:12]}...{tok[-8:] if len(tok) > 20 else ''}>"
        else:
            out[k] = v
    return out


def step(
    num: int,
    title: str,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: str | None = None,
    expect: int | None = None,
) -> tuple[int, bytes]:
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


# —— SSE step(单独处理流式)——————————————————————————————————————————
def sse_step(num: int, title: str, path_with_token: str, max_events: int = 30) -> None:
    print(f"\n{HR}\nStep {num}: {title}\n{HR}")
    # 在 URL 中遮掉 token 以便日志安全
    redacted_path = path_with_token
    if "token=" in redacted_path:
        idx = redacted_path.find("token=")
        end = redacted_path.find("&", idx)
        end = end if end != -1 else len(redacted_path)
        redacted_path = redacted_path[:idx + 6] + "<TOKEN>" + redacted_path[end:]

    print(f"\n--- 输入 ---")
    print(f"GET {BASE}{redacted_path}")
    print(f"\n--- 输出(读到 done/error 或最多 {max_events} 个事件)---")

    try:
        req = urllib.request.Request(BASE + path_with_token)
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"HTTP {resp.status}")
            ct = resp.headers.get("Content-Type", "")
            print(f"Content-Type: {ct}")
            print()
            event_count = 0
            for raw in resp:
                line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                if line == "":
                    continue
                if line.startswith(":"):
                    continue  # heartbeat
                print(line)
                if line.startswith("data:"):
                    event_count += 1
                    if '"type":"done"' in line or '"type":"error"' in line:
                        print(f"\n(读到 done/error,event_count={event_count})")
                        break
                    if event_count >= max_events:
                        print(f"\n(已读 {max_events} 事件,主动停止)")
                        break
    except Exception as e:
        print(f"\n⚠ SSE 异常: {type(e).__name__}: {e}")

    wait_continue()


# —— 流程 ——————————————————————————————————————————————————————————————
def main() -> None:
    print(f"{HR}")
    print("Echora 002 — Onboarding 端到端交互式手工测试")
    print(f"{HR}")
    print(f"Base URL: {BASE}")
    print()
    print("前置检查:")
    print("  1. 后端已启动 (npm run dev)")
    print("  2. .env 中已配 AI_PROVIDER + 对应 *_API_KEY")
    print("     (stub 时 Step 5 routes 到 general-chat,也可跑通后端链路)")
    print()
    print("说明:本脚本会自动注册一个新用户(test-<timestamp>@echora.dev),")
    print("      不影响已有数据。每步打印完整输入与响应,按空格继续。")
    wait_continue()

    # Step 1 — register(同事务 ensureProfile)
    email = f"test-{int(time.time())}@echora.dev"
    status, body = step(
        1,
        f"POST /api/auth/register  (email={email})",
        "POST",
        "/api/auth/register",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"email": email, "password": "echora-test-12345"}),
        expect=201,
    )
    if status != 201:
        print("\n⚠ register 失败,中止后续。")
        return
    data = json.loads(body)["data"]
    token = data["token"]
    user_id = data["user"]["id"]
    auth = {"Authorization": f"Bearer {token}"}
    print(f"\n  >> 已捕获 TOKEN({token[:18]}...) · user.id={user_id}")
    wait_continue()

    # Step 2 — GET /api/profile(应空)
    step(
        2,
        "GET /api/profile  (期望:空 profile,name/level=null)",
        "GET",
        "/api/profile",
        headers=auth,
        expect=200,
    )

    # Step 3 — GET /api/auth/me
    step(
        3,
        "GET /api/auth/me  (期望:onboardingCompleted=false)",
        "GET",
        "/api/auth/me",
        headers=auth,
        expect=200,
    )

    # Step 4 — POST /api/chat/conversations
    status, body = step(
        4,
        "POST /api/chat/conversations  (learningState=onboarding)",
        "POST",
        "/api/chat/conversations",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"learningState": "onboarding"}),
        expect=201,
    )
    conv_id = json.loads(body)["data"]["id"]
    print(f"\n  >> 已捕获 conv_id={conv_id}")
    wait_continue()

    # Step 5 — POST /api/chat/send(触发 router → onboarding skill)
    status, body = step(
        5,
        "POST /api/chat/send  (text='hi',触发 router → skill)",
        "POST",
        "/api/chat/send",
        headers={**auth, "Content-Type": "application/json"},
        body=json.dumps({"conversationId": conv_id, "text": "hi"}),
    )
    if status != 202:
        print(f"\n⚠ /send 返 {status} 而非 202,SSE 步跳过。")
        print("  常见原因:")
        print("    - 502 PROVIDER_ERROR:Provider 配置错误 / token 失效 / endpoint 不可达")
        print("    - 500 INTERNAL_ERROR:skill 内部异常,看后端日志")
        print("    - 401:token 失效或 middleware 拒绝")
        return
    send_data = json.loads(body)["data"]
    stream_id = send_data["streamId"]
    decision = send_data["decision"]
    print(f"\n  >> 已捕获 stream_id={stream_id}")
    print(
        f"  >> Router decision: skillName={decision['skillName']} "
        f"confidence={decision['confidence']:.2f}"
    )
    wait_continue()

    # Step 6 — SSE
    sse_step(
        6,
        "GET /api/chat/stream  (SSE,token 走 query)",
        f"/api/chat/stream?streamId={stream_id}&lastSeq=0&token={token}",
        max_events=30,
    )

    print(f"\n{HR}")
    print("✓ 6 步全部完成")
    print(f"{HR}")
    print(f"用户 email: {email}  user.id={user_id}  conv.id={conv_id}")
    print("\n下次跑可以(可选):")
    print("  - PUT /api/profile 设 name+level → /me 应返 onboardingCompleted=true")
    print("  - 在浏览器手动登录此账号验证 RouteGuard 跳转")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n用户中止 (Ctrl-C)。")
        sys.exit(0)
