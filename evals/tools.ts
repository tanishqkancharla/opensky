import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { createOpenSky } from "../src/opensky.js";
import type { AppState, DriverClient } from "../src/types.js";
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

async function stateResult(state: AppState, includeScreenshot = false) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" }
  > = [{ type: "text", text: state.text }];
  let screenshotWarning: string | undefined;
  if (includeScreenshot && state.screenshot) {
    try {
      const bytes = await readFile(fileURLToPath(state.screenshot.url));
      content.push({
        type: "image",
        data: bytes.toString("base64"),
        mimeType: state.screenshot.format === "jpeg" ? "image/jpeg" : "image/png",
      });
    } catch (error) {
      screenshotWarning = `Screenshot could not be attached: ${error instanceof Error ? error.message : String(error)}`;
      content.push({ type: "text", text: screenshotWarning });
    }
  }
  return {
    content,
    details: { app: state.app, screenshot: state.screenshot, screenshotWarning },
  };
}

async function actionResult(
  opensky: ReturnType<typeof createOpenSky>,
  app: string,
  action: () => Promise<void>,
  options: { observe?: boolean; includeScreenshot?: boolean },
) {
  await action();
  if (options.observe === false) return textResult({ ok: true });
  try {
    return await stateResult(await opensky.get_app_state({ app }), options.includeScreenshot === true);
  } catch (error) {
    return textResult({
      ok: true,
      action_completed: true,
      observation_error: error instanceof Error ? error.message : String(error),
      guidance: "The action completed, but its post-action state was unavailable. Refresh state before deciding whether to retry.",
    });
  }
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
      description:
        "Fallback discovery when a supplied app name cannot be resolved, or when the task asks which apps exist. Do not call before get_app_state for a known app.",
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: "Case-insensitive display-name/id filter" })),
        running_only: Type.Optional(Type.Boolean()),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
      }),
      async execute(_id, params) {
        let apps = await opensky.list_apps();
        if (params.query) {
          const query = params.query.toLowerCase();
          apps = apps.filter((app) =>
            `${app.displayName ?? ""}\n${app.id}`.toLowerCase().includes(query),
          );
        }
        if (params.running_only) apps = apps.filter((app) => app.isRunning);
        if (params.limit !== undefined) apps = apps.slice(0, params.limit);
        return textResult(apps);
      },
    }),
    defineTool({
      name: "open_target",
      label: "open_target",
      description:
        "Open one or more file paths or URLs with a named app, then return its settled AX state. Use this for task-supplied documents/folders/URLs; app in get_app_state is an application identifier, not a document path.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String({ description: "Application display name or bundle id" }),
        targets: Type.Array(Type.String(), { minItems: 1, maxItems: 20 }),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const launchKey = params.app.includes(".") && !params.app.includes(" ")
          ? { bundle_id: params.app }
          : { name: params.app };
        await driver.call("launch_app", { ...launchKey, urls: params.targets });
        return stateResult(
          await opensky.get_app_state({ app: params.app, disableDiff: true }),
          params.include_screenshot === true,
        );
      },
    }),
    defineTool({
      name: "get_app_state",
      label: "get_app_state",
      description:
        "Resolve/launch an app and return fresh accessibility state. First state is full; later states are compact diffs unless disableDiff is true. Set include_screenshot only when pixels are needed.",
      promptSnippet: "get_app_state: initial/recovery observation for a known app; actions observe by default.",
      parameters: Type.Object({
        app: Type.String({ description: "Display name, bundle id, or path" }),
        disableDiff: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { include_screenshot, ...stateArgs } = params;
        return stateResult(await opensky.get_app_state(stateArgs), include_screenshot === true);
      },
    }),
    defineTool({
      name: "click",
      label: "click",
      description:
        "Click an element_index from fresh state, or x/y for canvas surfaces. Returns settled post-action AX state by default.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Optional(Type.Number()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        mouse_button: Type.Optional(Type.Union([Type.String(), Type.Number()])),
        click_count: Type.Optional(Type.Number()),
        observe: Type.Optional(Type.Boolean({ description: "Return post-action state; defaults true" })),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.click(action as Parameters<typeof opensky.click>[0]), {
          observe,
          includeScreenshot: include_screenshot,
        });
      },
    }),
    defineTool({
      name: "drag",
      label: "drag",
      description: "Drag from one point to another in the app window.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        from_x: Type.Number(),
        from_y: Type.Number(),
        to_x: Type.Number(),
        to_y: Type.Number(),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.drag(action), { observe, includeScreenshot: include_screenshot });
      },
    }),
    defineTool({
      name: "paste",
      label: "paste",
      description: "Paste text/md/html into the app. Clipboard is restored afterwards.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
        format: Type.Union([Type.Literal("text"), Type.Literal("md"), Type.Literal("html")]),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.paste(action), { observe, includeScreenshot: include_screenshot });
      },
    }),
    defineTool({
      name: "perform_secondary_action",
      label: "perform_secondary_action",
      description: "Run a named AX action from the latest tree (Raise, Show Menu, ...).",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        action: Type.String(),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.perform_secondary_action(action), { observe, includeScreenshot: include_screenshot });
      },
    }),
    defineTool({
      name: "press_key",
      label: "press_key",
      description: "Press an xdotool-style key, e.g. Return, super+a, Up.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        key: Type.String(),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.press_key(action), { observe, includeScreenshot: include_screenshot });
      },
    }),
    defineTool({
      name: "scroll",
      label: "scroll",
      description: "Scroll. Prefer element_index; omit it or pass x/y to scroll the window.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Optional(Type.Number()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        direction: Type.String(),
        pages: Type.Optional(Type.Number()),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.scroll(action as Parameters<typeof opensky.scroll>[0]), {
          observe,
          includeScreenshot: include_screenshot,
        });
      },
    }),
    defineTool({
      name: "select_text",
      label: "select_text",
      description: "Select text in an element. prefix/suffix disambiguate repeats.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        text: Type.String(),
        prefix: Type.Optional(Type.String()),
        suffix: Type.Optional(Type.String()),
        selection_type: Type.Optional(Type.String()),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.select_text(action as Parameters<typeof opensky.select_text>[0]), {
          observe,
          includeScreenshot: include_screenshot,
        });
      },
    }),
    defineTool({
      name: "set_value",
      label: "set_value",
      description: "Replace the entire AX value of an element. Prefer this over type_text for exact replacement.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        value: Type.String(),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.set_value(action), { observe, includeScreenshot: include_screenshot });
      },
    }),
    defineTool({
      name: "type_text",
      label: "type_text",
      description: "Type into the focused field. Newlines may submit.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.type_text(action), { observe, includeScreenshot: include_screenshot });
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
  "open_target",
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
