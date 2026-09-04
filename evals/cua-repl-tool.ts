import { createHash } from "node:crypto";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { AsyncRepl } from "../src/async-repl.js";
import { createCua, type App, type Tab } from "../src/cua.js";
import { createOpenSky } from "../src/opensky.js";
import type { DriverClient, OpenSkyOptions, OpenSkyTarget } from "../src/types.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };

export const CUA_REPL_TOOL_NAMES = ["cua_repl"] as const;

export function createCuaReplToolRuntime(
  driver: DriverClient,
  target: OpenSkyTarget,
  options: Omit<OpenSkyOptions, "driver" | "target"> = {},
) {
  let activeEmissions: unknown[] | undefined;
  const opensky = createOpenSky({ ...options, driver, target, autoLaunch: options.autoLaunch ?? true });
  const cua = createCua(opensky, { emit: (value) => activeEmissions?.push(value) });
  const targets = new Map<string, App | Tab>();
  const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
  installSafeCuaBridge(repl, async (request) => {
    const parsed = JSON.parse(request) as { op?: string; args?: unknown[] };
    const args = Array.isArray(parsed.args) ? parsed.args : [];
    return JSON.stringify(encodeBridgeValue(await dispatch(parsed.op ?? "", args, cua, targets)));
  });

  const emittedImages = new Set<string>();
  const tools = [defineTool({
    name: "cua_repl",
    label: "cua_repl",
    description:
      "Run JavaScript in a persistent, sandboxed native-style Computer Use session. The `cua` object is preloaded. " +
      "Use `await cua.getApp(name)` for native apps or `await cua.createBrowserTab('chrome', url)` for a new exact owned tab. " +
      "Bindings persist across calls. Batch deterministic target actions and finish with getAXState(); action methods do not observe automatically. " +
      "The sandbox has no process, require, filesystem, dynamic import, eval/Function code generation, or network API.",
    executionMode: "sequential",
    parameters: Type.Object({
      code: Type.String({ minLength: 1, description: "Async JavaScript using the preloaded cua object" }),
      title: Type.Optional(Type.String({ description: "Short human-readable action label" })),
    }),
    async execute(_id, params) {
      activeEmissions = [];
      try {
        const result = await repl.evaluate(params.code, "cua-repl");
        const values = [...activeEmissions, ...result.logs];
        if (!isBindingDescriptor(result.value) && !activeEmissions.some((value) => equivalentOutput(value, result.value))) {
          values.push(result.value);
        }
        return {
          content: values.flatMap((value) => renderValue(value, emittedImages)),
          details: {
            title: params.title,
            code: params.code,
            emissions: activeEmissions.length,
            result: encodeBridgeValue(result.value),
            logs: result.logs,
          },
        };
      } finally {
        activeEmissions = undefined;
      }
    },
  })];

  return { tools, close: () => opensky.close(), cua };
}

async function dispatch(
  op: string,
  args: unknown[],
  cua: ReturnType<typeof createCua>,
  targets: Map<string, App | Tab>,
): Promise<unknown> {
  switch (op) {
    case "getState": return cua.getState(asObject(args[0]));
    case "listApps": return cua.listApps(asObject(args[0]));
    case "listBrowsers": return cua.listBrowsers(asObject(args[0]));
    case "listTabs": return cua.listTabs(asObject(args[0]));
    case "getBrowser": {
      const browser = await cua.getBrowser(asObject(args[0]));
      return { __cuaBinding: "browser", browserId: browser.browserId };
    }
    case "getApp": {
      const target = await cua.getApp(String(args[0] ?? ""));
      const descriptor = (target as App & { toJSON(): unknown }).toJSON() as { targetHandle: string };
      targets.set(descriptor.targetHandle, target);
      return { __cuaBinding: "app", handle: descriptor.targetHandle };
    }
    case "createBrowserTab": {
      const target = await cua.createBrowserTab(String(args[0] ?? ""), optionalString(args[1]), asObject(args[2]));
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "getTab": {
      const target = await cua.getTab(String(args[0] ?? ""), asObject(args[1]));
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "browser.documentation": {
      const browser = await cua.getBrowser({ id: String(args[0] ?? "") });
      return browser.documentation();
    }
  }
  if (!op.startsWith("target.")) throw new Error(`Unsupported cua bridge operation ${JSON.stringify(op)}`);
  const target = targets.get(String(args[0] ?? ""));
  if (!target) throw new Error(`Unknown exact cua target ${JSON.stringify(args[0])}; no input was sent`);
  const rest = args.slice(1);
  switch (op.slice("target.".length)) {
    case "getAXState": return target.getAXState(asObject(rest[0]));
    case "getScreenshot": return target.getScreenshot(asObject(rest[0]));
    case "getAXStateAndScreenshot": return target.getAXStateAndScreenshot(asObject(rest[0]));
    case "paste": return target.paste(String(rest[0] ?? ""), asObject(rest[1]));
    case "click": return target.click(rest[0] as number | [number, number], asObject(rest[1]));
    case "drag": return target.drag(rest[0] as [number, number], rest[1] as [number, number]);
    case "pressKey": return target.pressKey(String(rest[0] ?? ""));
    case "scroll": return target.scroll(rest[0] as number | [number, number], String(rest[1]) as never, rest[2] as number | undefined);
    case "selectText": return target.selectText(Number(rest[0]), String(rest[1] ?? ""), asObject(rest[2]));
    case "setValue": return target.setValue(Number(rest[0]), String(rest[1] ?? ""));
    case "typeText": return target.typeText(String(rest[0] ?? ""));
    case "performSecondaryAction": return target.performSecondaryAction(Number(rest[0]), String(rest[1] ?? ""));
    case "goto": return requireTab(target).goto(String(rest[0] ?? ""));
    case "back": return requireTab(target).back();
    case "forward": return requireTab(target).forward();
    case "reload": return requireTab(target).reload();
    case "close": return requireTab(target).close();
    case "markDeliverable": return requireTab(target).markDeliverable();
    case "markHandoff": return requireTab(target).markHandoff();
    default: throw new Error(`Unsupported target operation ${JSON.stringify(op)}; no input was sent`);
  }
}

function installSafeCuaBridge(repl: AsyncRepl, dispatch: (request: string) => Promise<string>): void {
  repl.installContextFactory("cua", `
    const decodeBase64 = (text) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const clean = text.replace(/=+$/, "");
      const bytes = [];
      let bits = 0, bitCount = 0;
      for (const char of clean) {
        const value = alphabet.indexOf(char);
        if (value < 0) throw new Error("Invalid bridge byte encoding");
        bits = (bits << 6) | value;
        bitCount += 6;
        if (bitCount >= 8) { bitCount -= 8; bytes.push((bits >> bitCount) & 255); }
      }
      return new Uint8Array(bytes);
    };
    const revive = (value) => {
      if (!value || typeof value !== "object") return value;
      if (typeof value.__cuaBytes === "string") return decodeBase64(value.__cuaBytes);
      if (Array.isArray(value)) return value.map(revive);
      for (const key of Object.keys(value)) value[key] = revive(value[key]);
      return value;
    };
    const call = async (op, args = []) => revive(JSON.parse(await __dispatch(JSON.stringify({ op, args }))));
    const target = (descriptor) => {
      const handle = descriptor.handle;
      const result = {
        targetHandle: handle,
        getAXState: (options) => call("target.getAXState", [handle, options]),
        getScreenshot: (options) => call("target.getScreenshot", [handle, options]),
        getAXStateAndScreenshot: (options) => call("target.getAXStateAndScreenshot", [handle, options]),
        paste: (text, options) => call("target.paste", [handle, text, options]),
        click: (where, options) => call("target.click", [handle, where, options]),
        drag: (from, to) => call("target.drag", [handle, from, to]),
        pressKey: (key) => call("target.pressKey", [handle, key]),
        scroll: (where, direction, pages) => call("target.scroll", [handle, where, direction, pages]),
        selectText: (index, text, options) => call("target.selectText", [handle, index, text, options]),
        setValue: (index, value) => call("target.setValue", [handle, index, value]),
        typeText: (text) => call("target.typeText", [handle, text]),
        performSecondaryAction: (index, action) => call("target.performSecondaryAction", [handle, index, action]),
        toJSON: () => ({ targetHandle: handle, kind: descriptor.__cuaBinding }),
      };
      if (descriptor.__cuaBinding === "tab") Object.assign(result, {
        id: handle,
        browserId: descriptor.browserId,
        goto: (url) => call("target.goto", [handle, url]),
        back: () => call("target.back", [handle]),
        forward: () => call("target.forward", [handle]),
        reload: () => call("target.reload", [handle]),
        close: () => call("target.close", [handle]),
        markDeliverable: () => call("target.markDeliverable", [handle]),
        markHandoff: () => call("target.markHandoff", [handle]),
      });
      return result;
    };
    const browser = (descriptor) => ({
      browserId: descriptor.browserId,
      documentation: () => call("browser.documentation", [descriptor.browserId]),
      toJSON: () => ({ browserId: descriptor.browserId }),
    });
    return Object.freeze({
      getState: (options) => call("getState", [options]),
      listApps: (options) => call("listApps", [options]),
      getApp: async (name) => target(await call("getApp", [name])),
      listBrowsers: (options) => call("listBrowsers", [options]),
      listTabs: (options) => call("listTabs", [options]),
      getBrowser: async (options) => browser(await call("getBrowser", [options])),
      createBrowserTab: async (id, url, options) => target(await call("createBrowserTab", [id, url, options])),
      getTab: async (id, options) => target(await call("getTab", [id, options])),
    });
  `, { __dispatch: dispatch });
}

function encodeBridgeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { __cuaBytes: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(encodeBridgeValue);
  if (value && typeof value === "object") {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return encodeBridgeValue((value as { toJSON(): unknown }).toJSON());
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeBridgeValue(child)]));
  }
  return value;
}

function renderValue(value: unknown, imageHashes: Set<string>): Content[] {
  if (value === undefined) return [];
  if (isBytes(value)) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (imageHashes.has(hash)) return [{ type: "text", text: "Screenshot unchanged from a previously attached image." }];
    imageHashes.add(hash);
    return [{ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }];
  }
  if (value && typeof value === "object" && "state" in value) {
    const pair = value as { state?: unknown; screenshot?: unknown };
    return [
      ...(typeof pair.state === "string" ? [{ type: "text" as const, text: pair.state }] : []),
      ...(pair.screenshot ? renderValue(pair.screenshot, imageHashes) : []),
    ];
  }
  return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }];
}

function isBytes(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function isBindingDescriptor(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && ("targetHandle" in value || "browserId" in value));
}

function equivalentOutput(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(encodeBridgeValue(left)) === JSON.stringify(encodeBridgeValue(right)); }
  catch { return left === right; }
}

function asObject(value: unknown): Record<string, never> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, never> : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requireTab(target: App | Tab): Tab {
  if (!("close" in target)) throw new Error("This exact target is an App, not a Tab; no browser operation was sent");
  return target;
}
