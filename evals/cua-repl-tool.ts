import { createHash } from "node:crypto";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { AsyncLifecycle } from "./async-lifecycle.js";
import { AsyncRepl, AsyncReplError } from "../src/async-repl.js";
import { createCua, type App, type Browser, type Tab } from "../src/cua.js";
import { createOpenSky } from "../src/opensky.js";
import type { DriverClient, OpenSkyOptions, OpenSkyTarget } from "../src/types.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: "image/png" };

export const CUA_REPL_TOOL_NAMES = ["cua_repl"] as const;

type BridgeCallTrace = {
  op: string;
  args: unknown[];
  durationMs: number;
  status: "completed" | "failed";
  error?: string;
};

export function createCuaReplToolRuntime(
  driver: DriverClient,
  target: OpenSkyTarget,
  options: Omit<OpenSkyOptions, "driver" | "target"> = {},
) {
  let activeEmissions: unknown[] | undefined;
  let activeBridgeCalls: BridgeCallTrace[] | undefined;
  const opensky = createOpenSky({ ...options, driver, target, autoLaunch: options.autoLaunch ?? true });
  const cua = createCua(opensky, { emit: (value) => activeEmissions?.push(value) });
  const targets = new Map<string, App | Tab>();
  const browsers = new Map<string, Browser>();
  const repl = new AsyncRepl({ allowNodeApis: false, strictSandbox: true });
  const lifecycle = new AsyncLifecycle("CUA REPL runtime", () => opensky.close());
  let executionQueue: Promise<void> = Promise.resolve();
  installSafeCuaBridge(repl, async (request) => {
    return lifecycle.run("bridge dispatch", async () => {
      const parsed = JSON.parse(request) as { op?: string; args?: unknown[] };
      const args = Array.isArray(parsed.args) ? parsed.args : [];
      const op = parsed.op ?? "";
      const begun = performance.now();
      const trace: BridgeCallTrace = { op, args, durationMs: 0, status: "completed" };
      activeBridgeCalls?.push(trace);
      try {
        const value = encodeBridgeValue(await dispatch(op, args, cua, targets, browsers));
        return JSON.stringify(value === undefined ? { __cuaUndefined: true } : value);
      } catch (error) {
        trace.status = "failed";
        trace.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        trace.durationMs = Math.max(0, performance.now() - begun);
      }
    });
  });

  const emittedImages = new Set<string>();
  const tools = [defineTool({
    name: "cua_repl",
    label: "cua_repl",
    description:
      "Run JavaScript in a persistent, sandboxed native-style Computer Use session. The `cua` object is preloaded. " +
      "Bind once with `let app = await cua.getApp(name)` or `let tab = await cua.createBrowserTab('chrome', url)`; reuse that binding in later calls. " +
      "Browser signatures: cua.getBrowser({id?, url?}) returns a Browser provider, NOT a Tab or Target; it neither navigates nor provides target actions. " +
      "cua.getTab(id, {browser?, emit?}) retrieves an existing exact owned Tab; cua.listTabs({browser?, emit?}) lists owned tab IDs. browser.tabs.new() takes no arguments and opens about:blank; " +
      "browser.tabs.get(id), browser.tabs.list(), browser.tabs.selected(), browser.nameSession(name), browser.documentation(). " +
      "To open a URL use cua.createBrowserTab(id, url, {visible?, sessionName?}) or tab.goto(url). " +
      "Tab inventories include only this facade's owned tabs. An empty list does not establish that the user has no other tabs or windows. " +
      "Bindings persist across calls. Batch deterministic target actions and finish with getAXState(); action methods do not observe automatically. " +
      "Target methods: getAXState({disableDiffing?, query?, emit?}), getScreenshot({emit?}), getAXStateAndScreenshot({emit?}), " +
      "click(indexOrCoordinates), typeText(text), pressKey(key), scroll(indexOrCoordinates, direction, pages?), " +
      "setValue(index, value), selectText(index, text, options?), drag(fromCoordinates, toCoordinates), performSecondaryAction(index, action). " +
      "Tabs additionally expose goto(url), back(), forward(), reload(), close(). Use numeric indices from fresh AX state; there are no Playwright locators. " +
      "For a browser field that exposes type but not click, use setValue(index, text) to replace its contents directly; do not click a non-clickable field. " +
      "Creation and observation methods emit their results automatically; do not console.log them or repeat getAXState after creation. " +
      "Observations wait for settled state; timers such as setTimeout are unavailable and unnecessary. " +
      "If an actionable item is omitted from a large page, getAXState({query: 'relevant text'}) returns fresh matching controls. " +
      "Long link destinations are marked urlPreview; use the element index, not a truncated URL. " +
      "The sandbox has no process, require, filesystem, dynamic import, eval/Function code generation, or network API.",
    executionMode: "sequential",
    parameters: Type.Object({
      code: Type.String({ minLength: 1, description: "Async JavaScript using the preloaded cua object" }),
      title: Type.Optional(Type.String({ description: "Short human-readable action label" })),
    }),
    execute(_id, params) {
      return lifecycle.run("tool execution", () => {
        const execution = executionQueue.then(async () => {
          activeEmissions = [];
          activeBridgeCalls = [];
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
                cuaCalls: activeBridgeCalls,
                result: encodeBridgeValue(result.value),
                logs: result.logs,
                runtimeError: undefined as string | undefined,
              },
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const logs = error instanceof AsyncReplError ? error.logs : [];
            return {
              isError: true,
              content: [
                ...[...activeEmissions, ...logs].flatMap((value) => renderValue(value, emittedImages)),
                { type: "text" as const, text: `Error: ${message}\nEarlier actions in this cell may have completed. Existing bindings remain available; use the emitted state before retrying.` },
              ],
              details: {
                title: params.title,
                code: params.code,
                emissions: activeEmissions.length,
                cuaCalls: activeBridgeCalls,
                result: undefined,
                logs,
                runtimeError: message,
              },
            };
          } finally {
            activeEmissions = undefined;
            activeBridgeCalls = undefined;
          }
        });
        executionQueue = execution.then(
          () => undefined,
          () => undefined,
        );
        return execution;
      });
    },
  })];

  return { tools, close: () => lifecycle.close() };
}

async function dispatch(
  op: string,
  args: unknown[],
  cua: ReturnType<typeof createCua>,
  targets: Map<string, App | Tab>,
  browsers: Map<string, Browser>,
): Promise<unknown> {
  switch (op) {
    case "getState": return cua.getState(asObject(args[0]));
    case "listApps": return cua.listApps(asObject(args[0]));
    case "listBrowsers": return cua.listBrowsers(asObject(args[0]));
    case "listTabs": return cua.listTabs(asObject(args[0]));
    case "getBrowser": {
      const browser = await cua.getBrowser(...args as Parameters<typeof cua.getBrowser>);
      browsers.set(browser.browserId, browser);
      return { __cuaBinding: "browser", browserId: browser.browserId };
    }
    case "getApp": {
      const target = await cua.getApp(String(args[0] ?? ""));
      const descriptor = (target as App & { toJSON(): unknown }).toJSON() as { targetHandle: string };
      targets.set(descriptor.targetHandle, target);
      return { __cuaBinding: "app", handle: descriptor.targetHandle };
    }
    case "createBrowserTab": {
      const target = await cua.createBrowserTab(...args as Parameters<typeof cua.createBrowserTab>);
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "getTab": {
      const target = await cua.getTab(String(args[0] ?? ""), asObject(args[1]));
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "browser.documentation": {
      return requireBrowser(browsers, args[0]).documentation();
    }
    case "browser.nameSession": {
      return requireBrowser(browsers, args[0]).nameSession(String(args[1] ?? ""));
    }
    case "browser.tabs.list": {
      return requireBrowser(browsers, args[0]).tabs.list();
    }
    case "browser.tabs.new": {
      if (args.length !== 1) throw new Error("Invalid params: browser.tabs.new() takes no arguments and opens about:blank; use cua.createBrowserTab(id, url) or tab.goto(url)");
      const target = await requireBrowser(browsers, args[0]).tabs.new();
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "browser.tabs.get": {
      const target = await requireBrowser(browsers, args[0]).tabs.get(String(args[1] ?? ""));
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
    }
    case "browser.tabs.selected": {
      const target = await requireBrowser(browsers, args[0]).tabs.selected();
      if (!target) return undefined;
      targets.set(target.id, target);
      return { __cuaBinding: "tab", handle: target.id, browserId: target.browserId };
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
      if (value.__cuaUndefined === true) return undefined;
      if (typeof value.__cuaBytes === "string") return decodeBase64(value.__cuaBytes);
      if (Array.isArray(value)) return value.map(revive);
      for (const key of Object.keys(value)) value[key] = revive(value[key]);
      return value;
    };
    const call = async (op, args = []) => revive(JSON.parse(await __dispatch(JSON.stringify({ op, args }))));
    const browserOptions = (value, fields, signature) => {
      if (value === undefined) return {};
      if (value === null || typeof value !== "object" || Object.prototype.toString.call(value) !== "[object Object]") throw new Error("Invalid params: use " + signature + "; options must be an object");
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(fields, key)) throw new Error("Invalid params: " + signature + " does not support option " + JSON.stringify(key));
        if (value[key] !== undefined && typeof value[key] !== fields[key]) throw new Error("Invalid params: " + signature + " option " + key + " must be " + fields[key]);
      }
      return value;
    };
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
    const browser = (descriptor) => {
      const browserId = descriptor.browserId;
      return {
        browserId,
        tabs: {
          get: async (id) => target(await call("browser.tabs.get", [browserId, id])),
          list: () => call("browser.tabs.list", [browserId]),
          new: async (...args) => {
            if (args.length !== 0) throw new Error("Invalid params: browser.tabs.new() takes no arguments and opens about:blank; use cua.createBrowserTab(id, url) or tab.goto(url)");
            return target(await call("browser.tabs.new", [browserId]));
          },
          selected: async () => {
            const selected = await call("browser.tabs.selected", [browserId]);
            return selected === undefined ? undefined : target(selected);
          },
        },
        documentation: () => call("browser.documentation", [browserId]),
        nameSession: (name) => call("browser.nameSession", [browserId, name]),
        toJSON: () => ({ browserId }),
      };
    };
    return Object.freeze({
      getState: (options) => call("getState", [options]),
      listApps: (options) => call("listApps", [options]),
      getApp: async (name) => target(await call("getApp", [name])),
      listBrowsers: (options) => call("listBrowsers", [options]),
      listTabs: (options) => call("listTabs", [options]),
      getBrowser: async (...args) => {
        if (args.length > 1) throw new Error("Invalid params: use cua.getBrowser({id?, url?}) with at most one options object");
        return browser(await call("getBrowser", [browserOptions(args[0], {id:"string", url:"string"}, "cua.getBrowser({id?, url?})")]));
      },
      createBrowserTab: async (...args) => {
        if (args.length > 3) throw new Error("Invalid params: use cua.createBrowserTab(id, url, {visible?, sessionName?})");
        const options = browserOptions(args[2], {visible:"boolean", sessionName:"string"}, "cua.createBrowserTab(id, url, {visible?, sessionName?})");
        return target(await call("createBrowserTab", [args[0], args[1], options]));
      },
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
  return Boolean(value && typeof value === "object" && (
    "targetHandle" in value ||
    ("browserId" in value && typeof (value as { documentation?: unknown }).documentation === "function")
  ));
}

function equivalentOutput(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(encodeBridgeValue(left)) === JSON.stringify(encodeBridgeValue(right)); }
  catch { return left === right; }
}

function asObject(value: unknown): Record<string, never> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, never> : {};
}

function requireTab(target: App | Tab): Tab {
  if (!("close" in target)) throw new Error("This exact target is an App, not a Tab; no browser operation was sent");
  return target;
}

function requireBrowser(browsers: Map<string, Browser>, value: unknown): Browser {
  const browser = browsers.get(String(value ?? ""));
  if (!browser) throw new Error(`Unknown cua browser binding ${JSON.stringify(value)}; no browser operation was sent`);
  return browser;
}
