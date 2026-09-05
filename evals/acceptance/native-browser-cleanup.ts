import { toolFailureReason } from "./evidence.js";

type Call = { id?: string | null; name: string; args: unknown; result?: unknown; error?: unknown; status?: string };
type Inventory = Map<string, Set<string>>;
type Surface = { provider: string; ids: Set<string> };

/** Prospective evidence only. Does not mutate or reclassify saved runs.
 * openTabIds is the provider's live session-controlled set (including claimed
 * tabs), not a creation receipt. Ownership therefore also requires a baseline.
 * Missing provider evidence is unknown, never an empty inventory.
 */
export function nativeBrowserCleanupEvidence(calls: readonly Call[]) {
  const fail = (reason: string) => ({ schemaVersion: 3, succeeded: false, reason });
  const native = calls.filter(isNative);
  if (native.length < 3) return fail("baseline, controlled-target observation, and final inventory are required");
  const baselineCall = native[0]!;
  const finalCall = calls.at(-1)!;
  if (!isNative(finalCall)) return fail("final call is not a verified native inventory observation");
  const baseline = inventory(baselineCall, false);
  const final = inventory(finalCall, true);
  if (!baseline || !final) return fail("complete trusted baseline/final getState inventories are missing");
  const observed = new Map<string, Set<string>>();
  for (const call of native) {
    const surface = controlledTabs(call);
    if (!surface) continue;
    if (!baseline.has(surface.provider)) return fail("controlled provider has no baseline identity");
    const owned = observed.get(surface.provider) ?? new Set<string>();
    for (const id of surface.ids) {
      if (baseline.get(surface.provider)!.has(id)) return fail("pre-existing tab was session-controlled; creation ownership is unproven");
      owned.add(id);
    }
    observed.set(surface.provider, owned);
  }
  const owned = [...observed].flatMap(([provider, ids]) => [...ids].map(id => ({ provider, id })));
  if (!owned.length) return fail("no new session-controlled target was observed");
  // Current public response metadata supplies only one provider. Do not infer
  // absence for other providers from a final getState result's selected scope.
  if (observed.size !== 1) return fail("multi-provider controlled-target cleanup is not proven");
  // getState can replace toolSurface with a provider selector that omits the
  // controlled set. Carry the latest explicit receipt only across complete,
  // successful, pure getState calls. Inspect ALL calls, not just native ones:
  // unknown tools, reset, failures, or mutations invalidate the carry-forward.
  let receiptCall: Call | undefined;
  let finalSurface: Surface | undefined;
  for (let index = calls.length - 1; index >= 0; index--) {
    const call = calls[index]!;
    if (!isNative(call) || !valid(call)) break;
    const surface = controlledTabs(call);
    if (surface) { finalSurface = surface; receiptCall = call; break; }
    const meta = record(record(record(call.result)?._meta)?.["codex/toolSurface"]);
    if (meta && ("openTabIds" in meta || "openTabs" in meta)) break;
    const readonlyInventory = inventory(call, false);
    if (!readonlyInventory || [...observed.keys()].some(key => !readonlyInventory.has(key))) break;
  }
  if (!finalSurface || !observed.has(finalSurface.provider) || finalSurface.ids.size !== 0) {
    return fail("final provider session-controlled inventory is missing or nonempty");
  }
  for (const [provider, siblings] of baseline) {
    const remaining = final.get(provider);
    if (!remaining) return fail("baseline provider is absent from final inventory");
    for (const id of siblings) if (!remaining.has(id)) return fail("a protected baseline sibling is absent");
  }
  for (const target of owned) {
    if (!final.has(target.provider) || final.get(target.provider)!.has(target.id)) {
      return fail("an observed owned target is still present or its provider is unavailable");
    }
  }
  return {
    schemaVersion: 3, succeeded: true,
    mechanism: "provider-controlled tab metadata plus baseline/final full inventory",
    baselineCallId: baselineCall.id, finalCallId: finalCall.id,
    controlledEmptyReceiptCallId: receiptCall!.id, ownedTargets: owned,
    postconditions: { workTargetAbsent: "verified", protectedSiblingRetained: "verified_for_baseline_inventory" },
    limitation: "Single-provider browser evidence only; not native-window or process cleanup proof.",
  };
}

function isNative(call: Call): boolean {
  return /(?:^|[._])cua_repl[._]js$/.test(call.name);
}
function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : undefined;
}
function valid(call: Call): boolean {
  return call.status === "completed" && !toolFailureReason(call);
}
function id(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value :
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined;
}
function ids(value: unknown): Set<string> | undefined {
  if (!Array.isArray(value)) return;
  const normalized = value.map(id);
  if (normalized.some(value => value === undefined) || new Set(normalized).size !== normalized.length) return;
  return new Set(normalized as string[]);
}
function provider(browserId: unknown, extensionId: unknown): string | undefined {
  // The evidenced Chrome provider includes both identities. Do not silently
  // substitute an unrelated extension reconnect or broaden to unsupported iab.
  return id(browserId) && typeof extensionId === "string" && extensionId.length > 0
    ? JSON.stringify([String(browserId), extensionId]) : undefined;
}
function controlledTabs(call: Call): Surface | undefined {
  if (!valid(call)) return;
  const meta = record(record(call.result)?._meta)?.["codex/toolSurface"];
  if (meta?.kind !== "browserUse" || meta.backend !== "chrome") return;
  const key = provider(meta.browserId, meta.extensionInstanceId);
  const open = ids(meta.openTabIds);
  if (!key || !open || !Array.isArray(meta.openTabs)) return;
  const detailed = ids(meta.openTabs.map((tab: unknown) => record(tab)?.id));
  if (!detailed || detailed.size !== open.size || [...detailed].some(id => !open.has(id))) return;
  return { provider: key, ids: open };
}
function inventory(call: Call, allowClose: boolean): Inventory | undefined {
  if (!valid(call)) return;
  const code = record(call.args)?.code;
  if (typeof code !== "string") return;
  // This is an output provenance gate, NOT a close-success detector. Permit
  // only direct literal calls whose text output is emitted by getState itself.
  // Reject comments, branches, arbitrary writes, assignments, and fabricated JSON.
  const expression = allowClose
    ? /^(?:\s*await\s+[A-Za-z_$][\w$]*\.close\(\);)*\s*await\s+cua\.getState\(\);?\s*$/
    : /^\s*await\s+cua\.getState\(\);?\s*$/;
  if (!expression.test(code)) return;
  const surface = record(record(record(call.result)?._meta)?.["codex/toolSurface"]);
  if (surface?.kind !== "browserUse") return;
  const content = record(call.result)?.content;
  if (!Array.isArray(content)) return;
  const candidates: Inventory[] = [];
  for (const block of content) {
    if (block?.type !== "text" || typeof block.text !== "string") continue;
    let state;
    try { state = JSON.parse(block.text); } catch { continue; }
    if (!Array.isArray(state?.apps) || !Array.isArray(state?.browsers)) continue;
    const result: Inventory = new Map();
    for (const browser of state.browsers) {
      const key = provider(browser?.id, browser?.metadata?.extensionInstanceId);
      if (!key || !Array.isArray(browser?.tabs) || result.has(key)) return;
      const tabs = ids(browser.tabs.map((tab: unknown) => record(tab)?.id));
      if (!tabs) return;
      result.set(key, tabs);
    }
    candidates.push(result);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}
