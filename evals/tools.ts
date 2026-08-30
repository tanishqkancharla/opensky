import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { createOpenSky } from "../src/opensky.js";
import type { DriverClient } from "../src/types.js";
import type { OpenSkyTarget } from "../src/types.js";

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: stringify(value) }],
    details: {},
  };
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function openskyTools(driver: DriverClient, target: OpenSkyTarget) {
  const opensky = createOpenSky({
    driver,
    target,
    autoLaunch: true,
    session: "opensky-eval",
  });

  return [
    defineTool({
      name: "list_apps",
      label: "list_apps",
      description: "List installed/running desktop apps. Returns id, displayName, isRunning.",
      promptSnippet: "list_apps: discover apps by display name, bundle id, or path.",
      parameters: Type.Object({}),
      async execute() {
        return textResult(await opensky.list_apps());
      },
    }),
    defineTool({
      name: "get_app_state",
      label: "get_app_state",
      description:
        "Launch the app if needed and return the accessibility tree plus screenshot URL. Always refresh after an action. disableDiff:true returns the full tree.",
      promptSnippet: "get_app_state({ app, disableDiff? }): snapshot an app window.",
      parameters: Type.Object({
        app: Type.String({ description: "Display name, bundle id, or path" }),
        disableDiff: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        return textResult(await opensky.get_app_state(params));
      },
    }),
    defineTool({
      name: "click",
      label: "click",
      description: "Click an element_index from the latest get_app_state, or x/y for canvas surfaces.",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Optional(Type.Number()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        mouse_button: Type.Optional(Type.Union([Type.String(), Type.Number()])),
        click_count: Type.Optional(Type.Number()),
      }),
      async execute(_id, params) {
        await opensky.click(params as Parameters<typeof opensky.click>[0]);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "drag",
      label: "drag",
      description: "Drag from one point to another in the app window.",
      parameters: Type.Object({
        app: Type.String(),
        from_x: Type.Number(),
        from_y: Type.Number(),
        to_x: Type.Number(),
        to_y: Type.Number(),
      }),
      async execute(_id, params) {
        await opensky.drag(params);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "paste",
      label: "paste",
      description: "Paste text/md/html into the app. Clipboard is restored afterwards.",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
        format: Type.Union([Type.Literal("text"), Type.Literal("md"), Type.Literal("html")]),
      }),
      async execute(_id, params) {
        await opensky.paste(params);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "perform_secondary_action",
      label: "perform_secondary_action",
      description: "Run a named AX action from the latest tree (Raise, Show Menu, ...).",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        action: Type.String(),
      }),
      async execute(_id, params) {
        await opensky.perform_secondary_action(params);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "press_key",
      label: "press_key",
      description: "Press an xdotool-style key, e.g. Return, super+a, Up.",
      parameters: Type.Object({
        app: Type.String(),
        key: Type.String(),
      }),
      async execute(_id, params) {
        await opensky.press_key(params);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "scroll",
      label: "scroll",
      description: "Scroll an element. direction: up|down|left|right or u|d|l|r.",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        direction: Type.String(),
        pages: Type.Optional(Type.Number()),
      }),
      async execute(_id, params) {
        await opensky.scroll(params as Parameters<typeof opensky.scroll>[0]);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "select_text",
      label: "select_text",
      description: "Select text in an element. prefix/suffix disambiguate repeats.",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        text: Type.String(),
        prefix: Type.Optional(Type.String()),
        suffix: Type.Optional(Type.String()),
        selection_type: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        await opensky.select_text(params as Parameters<typeof opensky.select_text>[0]);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "set_value",
      label: "set_value",
      description: "Replace the entire AX value of an element. Prefer this over type_text for exact replacement.",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        value: Type.String(),
      }),
      async execute(_id, params) {
        await opensky.set_value(params);
        return textResult({ ok: true });
      },
    }),
    defineTool({
      name: "type_text",
      label: "type_text",
      description: "Type into the focused field. Newlines may submit.",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
      }),
      async execute(_id, params) {
        await opensky.type_text(params);
        return textResult({ ok: true });
      },
    }),
  ];
}

export function cuaDriverTools(driver: DriverClient) {
  return [
    defineTool({
      name: "cua_driver_call",
      label: "cua_driver_call",
      description:
        "Call a Cua Driver tool the same way as `cua-driver call --raw TOOL JSON`. Tools include list_apps, launch_app, list_windows, get_window_state, click, double_click, drag, type_text, press_key, hotkey, scroll, set_value, clipboard_read, clipboard_write, bring_to_front. Window actions need pid and window_id from launch_app or list_windows.",
      promptSnippet: "cua_driver_call({ tool, arguments }): raw cua-driver CLI.",
      parameters: Type.Object({
        tool: Type.String(),
        arguments: Type.Optional(Type.Any()),
      }),
      async execute(_id, params) {
        const result = await driver.call(params.tool, params.arguments ?? {});
        return textResult(result);
      },
    }),
  ];
}

export const OPENSKY_TOOL_NAMES = [
  "list_apps",
  "get_app_state",
  "click",
  "drag",
  "paste",
  "perform_secondary_action",
  "press_key",
  "scroll",
  "select_text",
  "set_value",
  "type_text",
] as const;

export const CUA_DRIVER_TOOL_NAMES = ["cua_driver_call"] as const;
