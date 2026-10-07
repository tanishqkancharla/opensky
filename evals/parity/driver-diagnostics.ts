// Parent-only, passive evidence. No driver calls, tool-output changes or disk I/O.
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : undefined;
const pick = (v: RecordValue, keys: string[]) => Object.fromEntries(keys.filter(k => k in v).map(k => [k, v[k]]));
const short = (v: unknown) => typeof v === "string" ? v.slice(0, 160) : undefined;
const key = (v: RecordValue) => typeof v.pid === "number" && typeof v.window_id === "number" ? `${v.pid}:${v.window_id}` : undefined;
const captureMetadata = (v: RecordValue) => {
  const result: RecordValue = {};
  for (const name of ["degraded", "truncated", "elements_complete", "probe_only", "window_matched"])
    if (typeof v[name] === "boolean") result[name] = v[name];
  for (const name of ["nodes_pending", "nodes_visited", "returned_element_count", "total_element_count", "element_count"])
    if (typeof v[name] === "number" && Number.isSafeInteger(v[name]) && v[name] >= 0) result[name] = v[name];
  for (const name of ["truncation_reason", "degraded_reason"])
    if (typeof v[name] === "string" && /^[a-z_]{1,80}$/.test(v[name])) result[name] = v[name];
  return result;
};
const inputTools = new Set(["click", "type_text", "press_key", "hotkey", "select_text", "bring_to_front", "native_paste", "set_value", "perform_secondary_action"]);
type Snapshot = { id: string; elements: Map<string, RecordValue>; dropped: number };
export class DriverDiagnostics {
  readonly calls: RecordValue[] = [];
  dropped = 0;
  private snapshots = new Map<string, Snapshot>();
  private sequence = 0;
  private cell: string | undefined;
  private readonly capacity: number;
  private readonly maxElements: number;
  private readonly maxWindows: number;
  constructor(capacity = 8000, maxElements = 4000, maxWindows = 8) { this.capacity = capacity; this.maxElements = maxElements; this.maxWindows = maxWindows; }
  setCell(cell: string) { this.cell = cell.slice(0, 160); }
  begin(tool: string, args: RecordValue) {
    const target = pick(args, ["pid", "window_id", "element_index", "element_token", "snapshot_id", "delivery_mode", "include_screenshot", "include_accessibility_tree", "probe_only", "max_depth", "timeout_ms", "action", "button", "click_count"]);
    for (const k of Object.keys(target)) { if (typeof target[k] === "string") target[k] = short(target[k]); else if (!["number", "boolean"].includes(typeof target[k])) delete target[k]; }
    const s = this.snapshots.get(key(args) ?? "");
    const token = typeof args.element_token === "string" ? args.element_token : undefined;
    const element = token && s?.elements.get(token);
    const snapshotMatches = args.snapshot_id === undefined || args.snapshot_id === s?.id;
    const binding = !inputTools.has(tool) ? undefined : !token ? { status: "no_element_token" }
      : !s ? { status: "no_exact_window_snapshot" }
      : !snapshotMatches ? { status: "snapshot_mismatch", observedSnapshot: s.id }
      : !element ? { status: "token_not_in_latest_snapshot", observedSnapshot: s.id, observationElementsDropped: s.dropped }
      : { status: "matched", observedSnapshot: s.id, element };
    return { sequence: ++this.sequence, cell: this.cell, tool, target, binding, startedAt: new Date().toISOString(), started: performance.now() };
  }
  end(start: ReturnType<DriverDiagnostics["begin"]>, result?: unknown, error?: unknown) {
    const elapsedMs = performance.now() - start.started;
    const structured = record(record(result)?.structured);
    // A probe never replaces the last full observation. Match the returned
    // exact native PID/window, not the requested index or latest global state.
    if (start.tool === "get_window_state" && structured && Array.isArray(structured.elements)) {
      const k = key(structured), id = short(structured.snapshot_id);
      if (k && id) {
        const invalidated = Array.isArray(structured.invalidated_snapshot_ids) ? structured.invalidated_snapshot_ids : [];
        for (const [window, s] of this.snapshots) if (invalidated.includes(s.id)) this.snapshots.delete(window);
        const elements = new Map<string, RecordValue>(); let dropped = 0;
        for (const raw of structured.elements) {
          const e = record(raw); if (!e || typeof e.element_token !== "string") continue;
          if (elements.size >= this.maxElements) { dropped++; continue; }
          const value = pick(e, ["element_index", "role", "identifier", "native_object_id", "enabled"]);
          for (const name of Object.keys(value)) if (typeof value[name] === "string") value[name] = short(value[name]);
          const frame = record(e.frame);
          if (frame) value.frame = Object.fromEntries(["x", "y", "w", "h"].filter(n => typeof frame[n] === "number" && Number.isFinite(frame[n])).map(n => [n, frame[n]]));
          if (Array.isArray(e.actions)) value.actions = e.actions.filter(a => typeof a === "string").slice(0, 16).map(a => short(String(a).split("\n")[0].replace(/^Name:/, "")));
          elements.set(e.element_token, value);
        }
        this.snapshots.delete(k); this.snapshots.set(k, { id, elements, dropped });
        while (this.snapshots.size > this.maxWindows) this.snapshots.delete(this.snapshots.keys().next().value!);
      }
    }
    if (this.calls.length >= this.capacity) { this.dropped++; return; }
    const { started, ...entry } = start;
    const details = record(record(error)?.details);
    this.calls.push({ ...entry, elapsedMs,
      ...(structured ? { outcome: { route: short(structured.route), effect: short(structured.effect), deliveryMode: short(record(structured.delivery)?.mode), code: short(structured.code), ...(start.tool === "get_window_state" ? captureMetadata(structured) : {}) } } : {}),
      ...(error ? { error: { name: short(record(error)?.name) ?? (error instanceof Error ? error.name : "non_error_throw"), code: short(record(error)?.code), axError: typeof details?.ax_error === "number" && Number.isFinite(details.ax_error) ? details.ax_error : undefined,
        ...(details ? { outcome: { path: short(details.path), route: short(details.route), effect: short(details.effect), retry: short(details.retry),
          verified: typeof details.verified === "boolean" ? details.verified : undefined,
          dispatchAttempted: typeof details.dispatch_attempted === "boolean" ? details.dispatch_attempted : undefined,
          deliveryMode: short(record(details.delivery)?.mode) } } : {}) } } : {}) });
  }
  artifact() { return { calls: this.calls, dropped: this.dropped, limits: { calls: this.capacity, elementsPerWindow: this.maxElements, windows: this.maxWindows }, effectLimit: "Routing metadata and dispatch acknowledgments do not prove UI effect; inspect subsequent raw observations." }; }
}
