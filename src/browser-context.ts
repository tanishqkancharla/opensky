import { OpenSkyError } from "./errors.js";
import type { SnapshotElement } from "./types.js";

export interface ContextCursor {
  anchorRef: string;
  groupRef: string;
  orderDomain: string;
  frame: string;
  memberProjection?: "semantic_evidence_v1";
  sourceMemberNodes?: number;
  projectedOutNodes?: number;
}

export interface ContextBlock {
  anchor_ref: string;
  group_ref: string;
  parent_group_ref?: string | null;
  order_domain: string;
  before_omitted: number;
  after_omitted: number;
  before_continuation?: string | null;
  after_continuation?: string | null;
  group_complete: boolean;
  document_collection_complete: boolean;
  virtualized_extent: "unknown";
  member_refs?: string[];
  outline?: string;
  /** Absent on older helpers. Counts/cursors cover this explicit projection,
   * not raw AX nodes or full source text. */
  member_projection?: "semantic_evidence_v1";
  source_member_nodes?: number;
  projected_out_nodes?: number;
}

export const QUERY_CONTEXT_LIMITS = { blocks: 6, members: 96, outlineBytes: 24_000, tokens: 12 } as const;
export const CONTEXT_OUTLINE_BYTES = 12_000;
export const CONTEXT_MEMBERS = 25;

export function contextFailure(): OpenSkyError {
  return new OpenSkyError("The helper could not prove same-snapshot context within its declared bounds. Observe the exact tab again; no input was sent.", "browser_context_unavailable");
}

export function isContextToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[^\x21-\x7e]/.test(value);
}

function isSnapshotId(value: string): boolean {
  return /^p\d+$/.test(value) && value.trim() === value;
}

function snapshotRef(value: unknown, snapshotId: string): value is string {
  if (typeof value !== "string" || !value.startsWith(`${snapshotId}:`)) return false;
  const suffix = value.slice(snapshotId.length + 1);
  return suffix.length > 0 && !/\D/.test(suffix) && Number.isSafeInteger(Number(suffix));
}

/** Validate identity and coverage, not the truth of source content. Driver owns
 * exact AX hierarchy proof. A rendered label can never substitute for a ref.
 */
export function validateContextBlock(raw: unknown, options: {
  snapshotId: string;
  elements: SnapshotElement[];
  automatic?: boolean;
  expected?: ContextCursor;
}): ContextBlock {
  if (!isSnapshotId(options.snapshotId) || !raw || typeof raw !== "object" || Array.isArray(raw)) throw contextFailure();
  const block = raw as ContextBlock;
  const byRef = new Map(options.elements.map(e => [e.browser_ref, e]));
  if (byRef.size !== options.elements.length || new Set(options.elements.map(e => e.element_index)).size !== options.elements.length ||
      options.elements.some(e => !snapshotRef(e.browser_ref, options.snapshotId))) throw contextFailure();
  const anchors = [block.anchor_ref, block.group_ref, block.parent_group_ref].filter(ref => ref != null);
  if (!block.anchor_ref || !block.group_ref || !anchors.every(ref => snapshotRef(ref, options.snapshotId) && byRef.has(ref))) throw contextFailure();
  const frame = byRef.get(block.anchor_ref)?.browserFrame;
  if (!frame || !anchors.every(ref => byRef.get(ref)?.browserFrame === frame)) throw contextFailure();
  if (typeof block.order_domain !== "string" || !block.order_domain || block.order_domain.length > 2048 ||
      ![block.before_omitted, block.after_omitted].every(n => Number.isSafeInteger(n) && n >= 0) ||
      typeof block.group_complete !== "boolean" || typeof block.document_collection_complete !== "boolean" ||
      block.virtualized_extent !== "unknown" ||
      (block.group_complete && (block.before_omitted !== 0 || block.after_omitted !== 0 || !block.document_collection_complete))) throw contextFailure();
  for (const [omitted, token] of [[block.before_omitted, block.before_continuation], [block.after_omitted, block.after_continuation]] as const) {
    if (token != null && (!isContextToken(token) || omitted === 0)) throw contextFailure();
  }
  if (block.before_continuation && block.before_continuation === block.after_continuation) throw contextFailure();
  if (block.member_refs !== undefined || options.automatic) {
    if (!Array.isArray(block.member_refs) || block.member_refs.length > (options.automatic ? QUERY_CONTEXT_LIMITS.members : CONTEXT_MEMBERS) ||
        new Set(block.member_refs).size !== block.member_refs.length ||
        !block.member_refs.every(ref => snapshotRef(ref, options.snapshotId) && byRef.get(ref)?.browserFrame === frame)) throw contextFailure();
  }
  if (options.automatic && (typeof block.outline !== "string" || Buffer.byteLength(block.outline, "utf8") > QUERY_CONTEXT_LIMITS.outlineBytes)) throw contextFailure();
  const projectionFields = ["member_projection", "source_member_nodes", "projected_out_nodes"] as const;
  if (projectionFields.some(key => Object.hasOwn(block, key))) {
    if (block.member_projection !== "semantic_evidence_v1" ||
        ![block.source_member_nodes, block.projected_out_nodes].every(n => Number.isSafeInteger(n) && n! >= 0) ||
        !Array.isArray(block.member_refs) || block.member_refs.length === 0) throw contextFailure();
    const total = block.before_omitted + block.member_refs.length + block.after_omitted + block.projected_out_nodes!;
    if (!Number.isSafeInteger(total) || total !== block.source_member_nodes) throw contextFailure();
  }
  const expected = options.expected;
  if (expected && (block.anchor_ref !== expected.anchorRef || block.group_ref !== expected.groupRef ||
      block.order_domain !== expected.orderDomain || frame !== expected.frame ||
      block.member_projection !== expected.memberProjection || block.source_member_nodes !== expected.sourceMemberNodes ||
      block.projected_out_nodes !== expected.projectedOutNodes)) throw contextFailure();
  return block;
}

export function validateQueryContexts(raw: unknown, snapshotId: string, elements: SnapshotElement[]): ContextBlock[] {
  if (raw === undefined) return []; // Older helper: preserve its explicit query limitation.
  if (!isSnapshotId(snapshotId) || !Array.isArray(raw) || raw.length > QUERY_CONTEXT_LIMITS.blocks) throw contextFailure();
  const blocks = raw.map(block => validateContextBlock(block, { snapshotId, elements, automatic: true }));
  if (blocks.reduce((sum, block) => sum + block.member_refs!.length, 0) > QUERY_CONTEXT_LIMITS.members ||
      blocks.reduce((sum, block) => sum + Buffer.byteLength(block.outline!, "utf8"), 0) > QUERY_CONTEXT_LIMITS.outlineBytes) throw contextFailure();
  const groups = blocks.map(block => `${block.order_domain}:${block.group_ref}`);
  if (new Set(groups).size !== groups.length) throw contextFailure();
  contextBindings(blocks, elements); // Check duplicate tokens and conflicting domains too.
  return blocks;
}

export function contextBindings(blocks: ContextBlock[], elements: SnapshotElement[]): {
  contextDomains: Record<string, string>;
  contextContinuations: Record<string, ContextCursor>;
} {
  const contextDomains: Record<string, string> = Object.create(null);
  const contextContinuations: Record<string, ContextCursor> = Object.create(null);
  const byRef = new Map(elements.map(e => [e.browser_ref, e]));
  for (const block of blocks) {
    for (const ref of [block.anchor_ref, block.group_ref, block.parent_group_ref, ...(block.member_refs ?? [])]) {
      if (!ref) continue;
      if (Object.hasOwn(contextDomains, ref) && contextDomains[ref] !== block.order_domain) throw contextFailure();
      contextDomains[ref] = block.order_domain;
    }
    for (const token of [block.before_continuation, block.after_continuation]) {
      if (!token) continue;
      if (Object.hasOwn(contextContinuations, token)) throw contextFailure();
      contextContinuations[token] = { anchorRef: block.anchor_ref, groupRef: block.group_ref,
        orderDomain: block.order_domain, frame: byRef.get(block.anchor_ref)!.browserFrame!,
        ...(block.member_projection ? { memberProjection: block.member_projection,
          sourceMemberNodes: block.source_member_nodes, projectedOutNodes: block.projected_out_nodes } : {}) };
    }
  }
  if (Object.keys(contextContinuations).length > QUERY_CONTEXT_LIMITS.tokens) throw contextFailure();
  return { contextDomains, contextContinuations };
}

export function renderContextProjection(block: ContextBlock): string {
  if (block.member_projection !== "semantic_evidence_v1") return "";
  return `Member projection: ${block.source_member_nodes! - block.projected_out_nodes!}/${block.source_member_nodes} eligible stored AX nodes; ` +
    `${block.projected_out_nodes} generic nodes with no retained name/value/destination/state/action metadata excluded from the member budget. ` +
    "Ancestor nesting is retained. Counts, cursors and group completeness describe semantic evidence, not all AX nodes or lossless text.";
}

/** Cursors/coverage are outside outline budgets. Never hide the route onward. */
export function renderContextDirections(block: ContextBlock): string {
  return [
    block.before_continuation ? `Earlier context: getAXState({continuation: ${JSON.stringify(block.before_continuation)}})` : "",
    block.after_continuation ? `Later context: getAXState({continuation: ${JSON.stringify(block.after_continuation)}})` : "",
    block.before_omitted > 0 && !block.before_continuation ? "Earlier context omitted; no continuation available." : "",
    block.after_omitted > 0 && !block.after_continuation ? "Later context omitted; no continuation available." : "",
  ].filter(Boolean).join("\n");
}
