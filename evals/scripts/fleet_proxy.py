#!/usr/bin/env python3
"""Claim a Cua Fleet sandbox and proxy MCP / shell / screenshot to localhost."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
from typing import Any

from aiohttp import web

DEFAULT_IMAGE = (
    "public.ecr.aws/k5j5w0x5/cua-omarchy-workspace"
    "@sha256:d9b7be06beac425084eaa99eb912589b38b5cc86ae3e3ec45c9c5d59d4b3a7ab"
)


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


async def main() -> int:
    from cua_sandbox import Image, Pool

    pool_name = os.environ.get("CUA_POOL_NAME") or "opensky-evals"
    image_ref = os.environ.get("CUA_EVAL_IMAGE") or DEFAULT_IMAGE
    os_type = os.environ.get("CUA_EVAL_OS") or "linux"
    delete_pool = os.environ.get("EVAL_DELETE_POOL") == "1"

    image = Image.from_registry(image_ref, os_type=os_type, kind="vm")
    pool = await Pool.apply(
        image,
        name=pool_name,
        replicas=1,
        cpu=4,
        memory_mb=6144,
        services={"server": 8000, "mcp": 3000},
        ttl_seconds_after_created=21600,
    )

    sandbox_box: dict[str, Any] = {}
    shutdown = asyncio.Event()

    async def handle_mcp(request: web.Request) -> web.Response:
        sandbox = sandbox_box["sandbox"]
        body = await request.read()
        headers = {
            "content-type": request.headers.get("content-type", "application/json"),
            "accept": request.headers.get("accept", "application/json, text/event-stream"),
        }
        session_id = request.headers.get("mcp-session-id")
        if session_id:
            headers["mcp-session-id"] = session_id
        response = await sandbox.services.request(
            "mcp",
            method="POST",
            path="/mcp",
            headers=headers,
            data=body,
        )
        out_headers = {}
        for key in ("mcp-session-id", "content-type"):
            value = response.headers.get(key)
            if value:
                out_headers[key] = value
        return web.Response(body=await response.read(), status=response.status, headers=out_headers)

    async def handle_shell(request: web.Request) -> web.Response:
        sandbox = sandbox_box["sandbox"]
        payload = await request.json()
        command = payload.get("command")
        if not isinstance(command, str) or not command.strip():
            return web.json_response({"error": "command is required"}, status=400)
        result = await sandbox.shell.run(command)
        return web.json_response(
            {
                "success": bool(getattr(result, "success", False)),
                "stdout": getattr(result, "stdout", "") or "",
                "stderr": getattr(result, "stderr", "") or "",
            }
        )

    async def handle_screenshot(_request: web.Request) -> web.Response:
        sandbox = sandbox_box["sandbox"]
        png = await sandbox.screenshot()
        return web.Response(body=png, content_type="image/png")

    async def handle_info(_request: web.Request) -> web.Response:
        sandbox = sandbox_box["sandbox"]
        return web.json_response({"name": getattr(sandbox, "name", None), "os": os_type})

    async def handle_shutdown(_request: web.Request) -> web.Response:
        shutdown.set()
        return web.json_response({"ok": True})

    app = web.Application()
    app.router.add_post("/mcp", handle_mcp)
    app.router.add_post("/shell", handle_shell)
    app.router.add_get("/screenshot", handle_screenshot)
    app.router.add_get("/info", handle_info)
    app.router.add_post("/shutdown", handle_shutdown)

    runner = web.AppRunner(app)
    await runner.setup()
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    site = web.TCPSite(runner, "127.0.0.1", port)
    try:
        async with pool.claim(service="server", time_to_start=1800) as sandbox:
            sandbox_box["sandbox"] = sandbox
            await site.start()
            print(json.dumps({"ready": True, "port": port, "name": getattr(sandbox, "name", None), "os": os_type}), flush=True)

            async def wait_stdin() -> None:
                await asyncio.to_thread(sys.stdin.read)
                shutdown.set()

            stdin_task = asyncio.create_task(wait_stdin())
            await shutdown.wait()
            stdin_task.cancel()
    finally:
        await runner.cleanup()
        if delete_pool:
            await pool.delete()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as error:
        log(str(error))
        raise
