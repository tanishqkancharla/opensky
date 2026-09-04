import { createHash } from "node:crypto";
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

async function stateResult(
  state: AppState,
  includeScreenshot = false,
  emittedImageHashes?: Map<string, string>,
) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" }
  > = [{ type: "text", text: state.text }];
  let screenshotWarning: string | undefined;
  if (includeScreenshot && state.screenshot) {
    try {
      const bytes = await readFile(fileURLToPath(state.screenshot.url));
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (emittedImageHashes?.get(state.app) === hash) {
        content.push({ type: "text", text: "Screenshot unchanged from the previous attached image." });
      } else {
        content.push({
          type: "image",
          data: bytes.toString("base64"),
          mimeType: state.screenshot.format === "jpeg" ? "image/jpeg" : "image/png",
        });
        emittedImageHashes?.set(state.app, hash);
      }
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
  emittedImageHashes?: Map<string, string>,
) {
  await action();
  if (options.observe === false) return textResult({ ok: true });
  try {
    return await stateResult(
      await opensky.get_app_state({ app, includeScreenshot: options.includeScreenshot === true }),
      options.includeScreenshot === true,
      emittedImageHashes,
    );
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
  const emittedImageHashes = new Map<string, string>();
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
        "Open one or more file paths or URLs with a named app, bind the resulting window/tab, then return its settled AX state. Use this as the first call for task-supplied documents/folders/URLs. For a browser URL it performs the open itself; do not create a blank tab or observe the browser first. app in get_app_state is an application identifier, not a document path.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String({ description: "Application display name or bundle id" }),
        targets: Type.Array(Type.String(), { minItems: 1, maxItems: 20 }),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        return stateResult(
          await opensky.open_target({
            app: params.app,
            targets: params.targets,
            includeScreenshot: params.include_screenshot === true,
          }),
          params.include_screenshot === true,
          emittedImageHashes,
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
        include_app_chrome: Type.Optional(Type.Boolean({ description: "Exit URL page scope and return full browser app chrome" })),
      }),
      async execute(_id, params) {
        const { include_screenshot, include_app_chrome, ...stateArgs } = params;
        return stateResult(
          await opensky.get_app_state({
            ...stateArgs,
            includeScreenshot: include_screenshot === true,
            includeAppChrome: include_app_chrome === true,
          }),
          include_screenshot === true,
          emittedImageHashes,
        );
      },
    }),
    defineTool({
      name: "bring_to_front",
      label: "bring_to_front",
      description:
        "Bring the app's exact bound ordinary window onto the current desktop and make it frontmost. Use after an off-desktop input refusal; then observe before addressing elements.",
      executionMode: "sequential",
      parameters: Type.Object({ app: Type.String() }),
      async execute(_id, params) {
        return actionResult(opensky, params.app, () => opensky.bring_to_front(params), {
          observe: true,
          includeScreenshot: false,
        }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "perform_actions",
      label: "perform_actions",
      description:
        "Dispatch a short deterministic sequence in one app, then settle and observe once. Batch only steps that do not require an intermediate result to choose the next target. Focus-changing input may not precede ambient typing or paste in the same batch; observe first or use stale-checked element-targeted typing. A failed prefix is never retried automatically.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        actions: Type.Array(Type.Object({
          type: Type.Union([
            Type.Literal("click"), Type.Literal("drag"), Type.Literal("paste"),
            Type.Literal("perform_secondary_action"), Type.Literal("press_key"),
            Type.Literal("scroll"), Type.Literal("select_text"), Type.Literal("set_value"),
            Type.Literal("type_text"),
          ]),
          element_index: Type.Optional(Type.Number()),
          x: Type.Optional(Type.Number()),
          y: Type.Optional(Type.Number()),
          mouse_button: Type.Optional(Type.Union([Type.String(), Type.Number()])),
          click_count: Type.Optional(Type.Number()),
          from_x: Type.Optional(Type.Number()),
          from_y: Type.Optional(Type.Number()),
          to_x: Type.Optional(Type.Number()),
          to_y: Type.Optional(Type.Number()),
          key: Type.Optional(Type.String()),
          text: Type.Optional(Type.String()),
          format: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("md"), Type.Literal("html")])),
          action: Type.Optional(Type.String()),
          direction: Type.Optional(Type.String()),
          pages: Type.Optional(Type.Number()),
          prefix: Type.Optional(Type.String()),
          suffix: Type.Optional(Type.String()),
          selection_type: Type.Optional(Type.String()),
          value: Type.Optional(Type.String()),
        }), { minItems: 1, maxItems: 20 }),
        observation: Type.Optional(Type.Union([
          Type.Literal("ax"), Type.Literal("ax+screenshot"), Type.Literal("none"),
        ])),
      }),
      async execute(_id, params) {
        validateBatchActions(params.actions);
        const batch = await dispatchBatchActions(opensky, params.app, params.actions);
        const completed = batch.completed;
        if (batch.error !== undefined) {
          const failure = batch.error;
          const stop = {
            dispatched_actions: completed,
            requested_actions: params.actions.length,
            stopped_before_action: completed + 1,
            error: failure,
          };
          if (params.observation === "none") {
            return textResult({
              ...stop,
              verification: "not_requested",
              guidance: "The completed prefix was not retried. Observe before choosing the next action.",
            });
          }
          const withScreenshot = params.observation === "ax+screenshot";
          try {
            const result = await stateResult(
              await opensky.get_app_state({ app: params.app, includeScreenshot: withScreenshot }),
              withScreenshot,
              emittedImageHashes,
            );
            result.content.unshift({
              type: "text",
              text:
                `Batch stopped safely after ${completed}/${params.actions.length} dispatched actions; ` +
                `action ${completed + 1} was not sent: ${failure}\n` +
                "The completed prefix was not retried. Fresh settled state follows; derive new element indices from it.",
            });
            result.details = { ...result.details, batch: stop };
            return result;
          } catch (observationError) {
            return textResult({
              ...stop,
              observation_error: observationError instanceof Error ? observationError.message : String(observationError),
              guidance: "The completed prefix was not retried. Refresh state before choosing the next action.",
            });
          }
        }
        if (params.observation === "none") {
          return textResult({ dispatched_actions: completed, verification: "not_requested" });
        }
        const withScreenshot = params.observation === "ax+screenshot";
        const result = await stateResult(
          await opensky.get_app_state({ app: params.app, includeScreenshot: withScreenshot }),
          withScreenshot,
          emittedImageHashes,
        );
        result.content.unshift({
          type: "text",
          text: `Dispatched ${completed}/${params.actions.length} actions; settled post-action state follows. Verify requested effects in that state.`,
        });
        return result;
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
        }, emittedImageHashes);
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
        return actionResult(opensky, params.app, () => opensky.drag(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "paste",
      label: "paste",
      description: "Paste into the app. format defaults to plain text; use md or html when needed. Clipboard is restored afterwards.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
        format: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("md"), Type.Literal("html")])),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.paste(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
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
        return actionResult(opensky, params.app, () => opensky.perform_secondary_action(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "press_key",
      label: "press_key",
      description:
        "Press an xdotool-style key, e.g. Return, super+a, Up. Prefer element_index for atomic focus+key on controls such as sliders; x/y is available for canvas surfaces.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        key: Type.String(),
        element_index: Type.Optional(Type.Number()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.press_key(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
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
        }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "select_text",
      label: "select_text",
      description:
        "Select exact text in an element. prefix/suffix disambiguate repeats. selection_type defaults to text; exact is an alias, and cursor_before/cursor_after place the caret.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        element_index: Type.Number(),
        text: Type.String(),
        prefix: Type.Optional(Type.String()),
        suffix: Type.Optional(Type.String()),
        selection_type: Type.Optional(Type.Union([
          Type.Literal("text"), Type.Literal("exact"),
          Type.Literal("cursor_before"), Type.Literal("cursor_after"),
        ])),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.select_text(action as Parameters<typeof opensky.select_text>[0]), {
          observe,
          includeScreenshot: include_screenshot,
        }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "set_value",
      label: "set_value",
      description:
        "Set a native element's AX value directly. Prefer this for sliders, steppers, date pickers, and other controls with reliable value semantics. For web text fields/areas/comboboxes, prefer type_text so input events fire.",
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
        return actionResult(opensky, params.app, () => opensky.set_value(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
      },
    }),
    defineTool({
      name: "type_text",
      label: "type_text",
      description:
        "Type text. For an AXTextField, AXTextArea, or AXComboBox, call this directly with element_index—do not click it first; targeted typing atomically focuses and types. x/y is available for canvas surfaces. Omit both only when focus was already verified. Newlines may submit.",
      executionMode: "sequential",
      parameters: Type.Object({
        app: Type.String(),
        text: Type.String(),
        element_index: Type.Optional(Type.Number()),
        x: Type.Optional(Type.Number()),
        y: Type.Optional(Type.Number()),
        observe: Type.Optional(Type.Boolean()),
        include_screenshot: Type.Optional(Type.Boolean()),
      }),
      async execute(_id, params) {
        const { observe, include_screenshot, ...action } = params;
        return actionResult(opensky, params.app, () => opensky.type_text(action), { observe, includeScreenshot: include_screenshot }, emittedImageHashes);
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
  "bring_to_front",
  "perform_actions",
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

export function validateBatchActions(
  actions: Array<Record<string, unknown> & { type: string }>,
): void {
  const unverifiedFocusTypes = new Set([
    "click", "drag", "perform_secondary_action", "press_key", "scroll",
  ]);
  for (let index = 1; index < actions.length; index += 1) {
    const action = actions[index];
    const ambientType = action.type === "type_text" && typeof action.element_index !== "number";
    const ambientContent = action.type === "paste" || ambientType;
    if (
      ambientContent &&
      actions.slice(0, index).some((prior) => unverifiedFocusTypes.has(prior.type))
    ) {
      throw new Error(
        `Unsafe batch: ${action.type} follows unverified focus-changing input. ` +
          "Dispatch the focus/shortcut action separately and observe first, or use an atomic element/coordinate target when supported.",
      );
    }
  }
}

async function runBatchAction(
  opensky: ReturnType<typeof createOpenSky>,
  app: string,
  action: Record<string, unknown> & { type: string },
) {
  const { type, ...args } = action;
  const payload = { app, ...args };
  switch (type) {
    case "click": return opensky.click(payload as Parameters<typeof opensky.click>[0]);
    case "drag": return opensky.drag(payload as Parameters<typeof opensky.drag>[0]);
    case "paste": return opensky.paste(payload as Parameters<typeof opensky.paste>[0]);
    case "perform_secondary_action": return opensky.perform_secondary_action(payload as Parameters<typeof opensky.perform_secondary_action>[0]);
    case "press_key": return opensky.press_key(payload as Parameters<typeof opensky.press_key>[0]);
    case "scroll": return opensky.scroll(payload as Parameters<typeof opensky.scroll>[0]);
    case "select_text": return opensky.select_text(payload as Parameters<typeof opensky.select_text>[0]);
    case "set_value": return opensky.set_value(payload as Parameters<typeof opensky.set_value>[0]);
    case "type_text": return opensky.type_text(payload as Parameters<typeof opensky.type_text>[0]);
    default: throw new Error(`Unsupported action type: ${type}`);
  }
}

export async function dispatchBatchActions(
  opensky: ReturnType<typeof createOpenSky>,
  app: string,
  actions: Array<Record<string, unknown> & { type: string }>,
): Promise<{ completed: number; error?: string }> {
  let completed = 0;
  try {
    for (const action of actions) {
      await runBatchAction(opensky, app, action);
      completed += 1;
    }
    return { completed };
  } catch (error) {
    return { completed, error: error instanceof Error ? error.message : String(error) };
  }
}

export const CUA_DRIVER_TOOL_NAMES = ["cua_driver_call"] as const;
