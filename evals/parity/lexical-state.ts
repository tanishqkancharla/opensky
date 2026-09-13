export type ScopeKind = "global" | "function" | "block";
export type ImportKind = "fs" | "url" | "fileURLToPath" | "readFile";

export type HelperMetadata = Readonly<{ ast: unknown; declarationScopeId: number }>;
export type BindingAuthority = Readonly<{
  ordinaryDefined: boolean;
  app: boolean;
  state: boolean;
  screenshotPath: boolean;
  numeric: boolean;
  importKind?: ImportKind;
  helper?: HelperMetadata;
}>;
export type BindingRecord = BindingAuthority & Readonly<{ id: number }>;
export type ScopeFrame = Readonly<{ id: number; parentId?: number; kind: ScopeKind; names: ReadonlyMap<string, number> }>;

type MutableScopeFrame = { id: number; parentId?: number; kind: ScopeKind; names: Map<string, number> };
type MutableBindingRecord = { id: number; ordinaryDefined: boolean; app: boolean; state: boolean; screenshotPath: boolean; numeric: boolean; importKind?: ImportKind; helper?: HelperMetadata };
type Allocator = { nextBindingId: number; nextScopeId: number };

export type LexicalSnapshot = Readonly<{
  scopes: ReadonlyMap<number, ScopeFrame>;
  bindings: ReadonlyMap<number, BindingRecord>;
  currentScopeId: number;
  allocator: Allocator;
}>;

const emptyAuthority = (): Omit<MutableBindingRecord, "id"> => ({ ordinaryDefined: false, app: false, state: false, screenshotPath: false, numeric: false });
const copyRecord = (record: MutableBindingRecord): MutableBindingRecord => ({ ...record });
const copyScope = (scope: MutableScopeFrame): MutableScopeFrame => ({ ...scope, names: new Map(scope.names) });

/**
 * Transactional lexical provenance for the evaluator. Binding IDs, rather
 * than names, carry authority. Forks share only a monotonic allocator: gaps
 * after rollback are harmless and prevent two branch-local declarations from
 * receiving the same ID. All scopes and records are otherwise deep-copied.
 */
export class LexicalState {
  private readonly scopes = new Map<number, MutableScopeFrame>();
  private readonly bindings = new Map<number, MutableBindingRecord>();
  private currentScopeId: number;
  private readonly allocator: Allocator;

  constructor(snapshot?: LexicalSnapshot) {
    if (snapshot) {
      this.allocator = snapshot.allocator;
      this.currentScopeId = snapshot.currentScopeId;
      for (const [id, scope] of snapshot.scopes) this.scopes.set(id, copyScope(scope as MutableScopeFrame));
      for (const [id, binding] of snapshot.bindings) this.bindings.set(id, copyRecord(binding as MutableBindingRecord));
      return;
    }
    this.allocator = { nextBindingId: 1, nextScopeId: 2 };
    this.currentScopeId = 1;
    this.scopes.set(1, { id: 1, kind: "global", names: new Map() });
  }

  get currentScope(): ScopeFrame { return this.frame(this.currentScopeId); }
  get globalScopeId(): number { return 1; }
  snapshot(): LexicalSnapshot {
    return {
      scopes: new Map([...this.scopes].map(([id, scope]) => [id, copyScope(scope)])),
      bindings: new Map([...this.bindings].map(([id, binding]) => [id, copyRecord(binding)])),
      currentScopeId: this.currentScopeId,
      allocator: this.allocator,
    };
  }
  clone(): LexicalState { return new LexicalState(this.snapshot()); }
  restore(snapshot: LexicalSnapshot): void {
    this.scopes.clear(); this.bindings.clear();
    for (const [id, scope] of snapshot.scopes) this.scopes.set(id, copyScope(scope as MutableScopeFrame));
    for (const [id, binding] of snapshot.bindings) this.bindings.set(id, copyRecord(binding as MutableBindingRecord));
    this.currentScopeId = snapshot.currentScopeId;
    // The shared monotonic allocator is deliberately never rewound.
  }

  reserve(name: string, scopeId = this.currentScopeId): number {
    const scope = this.mutableFrame(scopeId);
    if (scope.names.has(name)) throw new Error(`binding already exists: ${name}`);
    const id = this.allocator.nextBindingId++;
    scope.names.set(name, id);
    this.bindings.set(id, { id, ...emptyAuthority() });
    return id;
  }
  declare(name: string, authority: Partial<BindingAuthority> = {}, scopeId = this.currentScopeId): number {
    const id = this.reserve(name, scopeId);
    this.writeById(id, { ...authority, ordinaryDefined: authority.ordinaryDefined ?? true });
    return id;
  }
  resolve(name: string, scopeId = this.currentScopeId): number | undefined {
    let cursor: number | undefined = scopeId;
    while (cursor !== undefined) {
      const scope = this.mutableFrame(cursor);
      const id = scope.names.get(name);
      if (id !== undefined) return id;
      cursor = scope.parentId;
    }
    return undefined;
  }
  read(name: string, scopeId = this.currentScopeId): BindingRecord | undefined {
    const id = this.resolve(name, scopeId);
    const binding = id === undefined ? undefined : this.bindings.get(id);
    return binding && copyRecord(binding);
  }
  readById(id: number): BindingRecord | undefined {
    const binding = this.bindings.get(id);
    return binding && copyRecord(binding);
  }
  write(name: string, authority: Partial<BindingAuthority>, scopeId = this.currentScopeId): number {
    const id = this.resolve(name, scopeId);
    if (id === undefined) throw new Error(`unknown binding: ${name}`);
    this.writeById(id, authority);
    return id;
  }
  writeById(id: number, authority: Partial<BindingAuthority>): void {
    const prior = this.bindings.get(id);
    if (!prior) throw new Error(`unknown binding ID: ${id}`);
    const next = { ...prior, ...authority };
    if (!next.importKind) delete next.importKind;
    if (!next.helper) delete next.helper;
    this.bindings.set(id, next);
  }
  enterBlock(): number { return this.enter("block", this.currentScopeId); }
  enterFunction(declarationScopeId: number): number { return this.enter("function", declarationScopeId); }
  leaveScope(callerScopeId: number): void {
    this.frame(callerScopeId);
    this.currentScopeId = callerScopeId;
  }
  invalidateAfterFailure(): void {
    for (const [id, binding] of this.bindings) {
      this.bindings.set(id, { ...binding, state: false, screenshotPath: false, numeric: false, helper: undefined });
    }
  }

  /** Conservative branch join. Branch-only block/function bindings disappear.
   * A newly declared global name survives only when both arms declare it; the
   * joined record intersects authority and gets a fresh unambiguous ID. */
  static join(base: LexicalSnapshot, left: LexicalSnapshot, right: LexicalSnapshot): LexicalState {
    if (base.currentScopeId !== left.currentScopeId || base.currentScopeId !== right.currentScopeId) throw new Error("join requires restored caller scope");
    const joined = new LexicalState(base);
    for (const [id, baseRecord] of base.bindings) {
      const leftRecord = left.bindings.get(id);
      const rightRecord = right.bindings.get(id);
      if (!leftRecord || !rightRecord) continue;
      joined.bindings.set(id, {
        id,
        ordinaryDefined: baseRecord.ordinaryDefined && leftRecord.ordinaryDefined && rightRecord.ordinaryDefined,
        app: baseRecord.app && leftRecord.app && rightRecord.app,
        state: baseRecord.state && leftRecord.state && rightRecord.state,
        screenshotPath: baseRecord.screenshotPath && leftRecord.screenshotPath && rightRecord.screenshotPath,
        numeric: baseRecord.numeric && leftRecord.numeric && rightRecord.numeric,
        importKind: baseRecord.importKind === leftRecord.importKind && baseRecord.importKind === rightRecord.importKind ? baseRecord.importKind : undefined,
        helper: baseRecord.helper === leftRecord.helper && baseRecord.helper === rightRecord.helper ? baseRecord.helper : undefined,
      });
    }
    const global = base.scopes.get(1);
    const leftGlobal = left.scopes.get(1);
    const rightGlobal = right.scopes.get(1);
    if (!global || !leftGlobal || !rightGlobal) throw new Error("missing global scope");
    for (const [name, leftId] of leftGlobal.names) {
      if (global.names.has(name)) continue;
      const rightId = rightGlobal.names.get(name);
      if (rightId === undefined) continue;
      const leftRecord = left.bindings.get(leftId);
      const rightRecord = right.bindings.get(rightId);
      if (!leftRecord || !rightRecord) continue;
      joined.declare(name, {
        ordinaryDefined: leftRecord.ordinaryDefined && rightRecord.ordinaryDefined,
        app: leftRecord.app && rightRecord.app,
        state: leftRecord.state && rightRecord.state,
        screenshotPath: leftRecord.screenshotPath && rightRecord.screenshotPath,
        numeric: leftRecord.numeric && rightRecord.numeric,
        importKind: leftRecord.importKind === rightRecord.importKind ? leftRecord.importKind : undefined,
        helper: leftRecord.helper === rightRecord.helper ? leftRecord.helper : undefined,
      }, 1);
    }
    return joined;
  }

  private enter(kind: Exclude<ScopeKind, "global">, parentId: number): number {
    const caller = this.currentScopeId;
    this.frame(parentId);
    const id = this.allocator.nextScopeId++;
    this.scopes.set(id, { id, parentId, kind, names: new Map() });
    this.currentScopeId = id;
    return caller;
  }
  private frame(id: number): ScopeFrame {
    const frame = this.scopes.get(id);
    if (!frame) throw new Error(`unknown scope ID: ${id}`);
    return frame;
  }
  private mutableFrame(id: number): MutableScopeFrame { return this.frame(id) as MutableScopeFrame; }
}
