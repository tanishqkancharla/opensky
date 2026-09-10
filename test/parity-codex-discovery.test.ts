import assert from "node:assert/strict";
import { test } from "node:test";
import { isBuiltinResourceDiscovery } from "../evals/parity/codex.js";

// Shape observed in interrupted native run 34531183179, events 44–45.
const discovery = {
  type: "mcpToolCall", server: "codex", tool: "list_mcp_resources",
  arguments: {}, pluginId: null, appContext: null, readOnlyHint: null,
};

test("Codex's built-in empty resource inventory is allowed", () => {
  assert.equal(isBuiltinResourceDiscovery(discovery), true);
});

test("resource template inventory permits only desktop and a pagination cursor", () => {
  assert.equal(isBuiltinResourceDiscovery({ ...discovery, tool: "list_mcp_resource_templates", arguments: { server: "desktop", cursor: "next-page" } }), true);
});

for (const [name, change] of [
  ["another server", { server: "external" }],
  ["an explicitly selected external server", { arguments: { server: "external" } }],
  ["resource content", { tool: "read_mcp_resource" }],
  ["arbitrary tool discovery", { tool: "search_tools" }],
  ["code execution", { tool: "js", arguments: { code: "doWork()" } }],
  ["desktop action", { tool: "click" }],
  ["plugin tool with the same name", { pluginId: "external-plugin" }],
  ["connector context", { appContext: {} }],
  ["unknown resource arguments", { arguments: { uri: "file:///task.xlsx" } }],
  ["invalid server type", { arguments: { server: null } }],
  ["invalid cursor type", { arguments: { cursor: {} } }],
  ["missing arguments", { arguments: undefined }],
  ["array arguments", { arguments: [] }],
  ["different event kind", { type: "dynamicToolCall" }],
] as const) {
  test(`built-in discovery exception refuses ${name}`, () => {
    assert.equal(isBuiltinResourceDiscovery({ ...discovery, ...change }), false);
  });
}
