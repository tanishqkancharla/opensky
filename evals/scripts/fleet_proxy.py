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

DEFAULT_LINUX_IMAGE = (
    "public.ecr.aws/k5j5w0x5/cua-omarchy-workspace"
    "@sha256:d9b7be06beac425084eaa99eb912589b38b5cc86ae3e3ec45c9c5d59d4b3a7ab"
)
DEFAULT_MACOS_IMAGE = "ghcr.io/trycua/macos-tahoe-cua:latest"


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def _response_body(response: Any) -> bytes:
    content = getattr(response, "content", None)
    if isinstance(content, (bytes, bytearray)):
        return bytes(content)
    read = getattr(response, "read", None)
    if read is None:
        return b""
    result = read()
    if isinstance(result, (bytes, bytearray)):
        return bytes(result)
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text.encode("utf-8")
    return b""


def _response_status(response: Any) -> int:
    for attr in ("status_code", "status", "code"):
        value = getattr(response, attr, None)
        if isinstance(value, int):
            return value
    return 500


def _header_items(headers: Any) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    if headers is None:
        return items
    mapping = getattr(headers, "items", None)
    if callable(mapping):
        try:
            for key, value in mapping():
                if key is not None and value is not None:
                    items.append((str(key), str(value)))
            return items
        except Exception:
            items = []
    if isinstance(headers, (list, tuple)):
        for item in headers:
            name = getattr(item, "name", None)
            value = getattr(item, "value", None)
            if name is None and isinstance(item, dict):
                name = item.get("name")
                value = item.get("value")
            if name is not None and value is not None:
                items.append((str(name), str(value)))
    return items


def _response_header(response: Any, name: str) -> str | None:
    wanted = name.lower()
    for key, value in _header_items(getattr(response, "headers", None)):
        if key.lower() == wanted and value:
            return value
    return None


def _patch_macos_runtime() -> None:
    """Pool.apply defaults to KubeVirt. Fleet also has a macOS runtime (Lume)."""
    from cua_sandbox.transport.fleet_cloud import FleetCloudTransport
    from fleet_sdk import Firmware, RuntimeKind

    original = FleetCloudTransport._template_request

    def patched(self):  # type: ignore[no-untyped-def]
        request = original(self)
        if getattr(self._image, "os_type", None) != "macos":
            return request
        vm = request.spec.vm_template
        vm.runtime = RuntimeKind.MACOS
        if getattr(vm, "firmware", None) is None:
            vm.firmware = Firmware.EFI
        log("patched Fleet template runtime=MACOS firmware=EFI")
        return request

    FleetCloudTransport._template_request = patched  # type: ignore[method-assign]


async def main() -> int:
    from cua_sandbox import Image, Pool

    os_type = (os.environ.get("CUA_EVAL_OS") or "linux").strip().lower()
    if os_type in {"mac", "darwin"}:
        os_type = "macos"
    default_image = DEFAULT_MACOS_IMAGE if os_type == "macos" else DEFAULT_LINUX_IMAGE
    pool_name = os.environ.get("CUA_POOL_NAME") or (
        "opensky-macos-evals" if os_type == "macos" else "opensky-evals"
    )
    image_ref = os.environ.get("CUA_EVAL_IMAGE") or default_image
    delete_pool = os.environ.get("EVAL_DELETE_POOL") == "1"
    cpu = int(os.environ.get("CUA_EVAL_CPU") or ("4" if os_type == "macos" else "4"))
    memory_mb = int(os.environ.get("CUA_EVAL_MEMORY_MB") or ("8192" if os_type == "macos" else "6144"))

    log(f"claiming Fleet pool={pool_name} os={os_type} image={image_ref} cpu={cpu} memory_mb={memory_mb}")
    if os_type == "macos":
        _patch_macos_runtime()
    image = Image.from_registry(image_ref, os_type=os_type, kind="vm")
    pool = await Pool.apply(
        image,
        name=pool_name,
        replicas=1,
        cpu=cpu,
        memory_mb=memory_mb,
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
        try:
            payload = json.loads(body.decode("utf-8") or "null")
        except json.JSONDecodeError as error:
            return web.Response(text=f"invalid MCP JSON: {error}", status=400)
        response = await sandbox.services.request(
            "mcp",
            method="POST",
            path="/mcp",
            headers=headers,
            json=payload,
        )
        out_headers = {}
        for key in ("mcp-session-id", "content-type"):
            value = _response_header(response, key)
            if value:
                out_headers[key] = value
        status = _response_status(response)
        method = payload.get("method") if isinstance(payload, dict) else None
        if method in {"initialize", "notifications/initialized"} or status >= 400:
            log(f"mcp method={method} status={status} session={out_headers.get('mcp-session-id')!r}")
        return web.Response(body=_response_body(response), status=status, headers=out_headers)

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
