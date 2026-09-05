import { createRequire } from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { inspect } from "node:util";
import vm from "node:vm";
import repl from "node:repl";
import { PassThrough, Writable } from "node:stream";
import { parse, type Node } from "acorn";

export interface EvalResult {
  value: unknown;
  logs: string[];
}

export class AsyncReplError extends Error {
  constructor(
    message: string,
    public readonly logs: string[],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "Error";
  }
}

export interface AsyncReplOptions {
  context?: Record<string, unknown>;
  timeoutMs?: number;
  /** When false, omit `process` and `require` from the sandbox (used by `opensky serve`). */
  allowNodeApis?: boolean;
  /** Harden a no-Node-API evaluator as a security boundary. Context values must be installed through a context-native membrane. */
  strictSandbox?: boolean;
}

export class AsyncRepl {
  private readonly sandbox: vm.Context;
  private queue: Promise<void> = Promise.resolve();
  private readonly timeoutMs: number;
  private readonly strictSandbox: boolean;
  private readonly strictEvaluation = new AsyncLocalStorage<number>();
  private readonly activeEvaluations = new Set<number>();
  private evaluationSequence = 0;
  private poisonedReason: string | undefined;
  private readonly constBindings = new Set<string>();

  constructor(options: AsyncReplOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.strictSandbox = options.strictSandbox === true;
    if (this.strictSandbox && options.allowNodeApis !== false) {
      throw new Error("strictSandbox requires allowNodeApis: false");
    }
    if (this.strictSandbox && Object.keys(options.context ?? {}).length > 0) {
      throw new Error("strictSandbox context must be installed through a context-native membrane");
    }
    this.sandbox = vm.createContext(
      createSandbox(options.context ?? {}, options.allowNodeApis !== false, this.strictSandbox),
      this.strictSandbox ? {
        codeGeneration: { strings: false, wasm: false },
        // Keep context-created Promise microtasks inside runInContext's timeout
        // accounting instead of allowing a recursive microtask chain to starve
        // the host deadline timer.
        microtaskMode: "afterEvaluate",
      } : undefined,
    );
    if (this.strictSandbox) initializeStrictSandbox(this.sandbox);
  }

  get context(): vm.Context {
    if (this.strictSandbox) {
      throw new Error("strictSandbox context is sealed; install context-native bindings with installContextFactory()");
    }
    return this.sandbox;
  }

  assign(values: Record<string, unknown>): void {
    if (this.strictSandbox) {
      throw new Error("strictSandbox rejects host values; install context-native bindings with installContextFactory()");
    }
    Object.assign(this.sandbox, values);
  }

  /** Compile a context-native value whose host capabilities remain in an inaccessible lexical extension. */
  installContextFactory(name: string, source: string, contextExtensions: Record<string, unknown> = {}): void {
    if (!this.strictSandbox) throw new Error("installContextFactory is only available in strictSandbox mode");
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error("Invalid strictSandbox binding name");
    if (Object.prototype.hasOwnProperty.call(this.sandbox, name)) throw new Error(`strictSandbox binding ${JSON.stringify(name)} already exists`);
    const extensionNames: string[] = [];
    const extensionValues: Array<(...args: unknown[]) => unknown> = [];
    for (const [key, value] of Object.entries(contextExtensions)) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) throw new Error(`Invalid strictSandbox context extension name ${JSON.stringify(key)}`);
      if (typeof value !== "function") {
        throw new Error(`strictSandbox context extension ${JSON.stringify(key)} must be a host function behind the membrane`);
      }
      extensionNames.push(key);
      extensionValues.push((...args: unknown[]) => {
        // Bun loses AsyncLocalStorage context after a cross-realm await. The
        // evaluator queue permits exactly one active generation, and any
        // timeout poisons the REPL before another can begin, so this fallback
        // cannot authorize a stale continuation as a newer evaluation.
        const stored = this.strictEvaluation.getStore();
        const generation = stored ?? (this.activeEvaluations.size === 1 ? this.activeEvaluations.values().next().value : undefined);
        if (generation === undefined || !this.activeEvaluations.has(generation)) {
          throw new Error("strictSandbox capability is unavailable outside its active evaluation");
        }
        return value(...args);
      });
    }
    // Compile a realm-native initializer and pass host capabilities as lexical
    // parameters. Bun exposes vm.compileFunction contextExtensions as globals,
    // so that API is intentionally not used here.
    const factory = vm.compileFunction(`return (${extensionNames.join(", ")}) => {\n${source}\n};`, [], {
      parsingContext: this.sandbox,
    });
    const initialize = factory() as (...values: unknown[]) => unknown;
    const binding = initialize(...extensionValues);
    this.sandbox[name] = binding;
  }

  async evaluate(code: string, filename = "opensky"): Promise<EvalResult> {
    const run = async (): Promise<EvalResult> => {
      if (this.strictSandbox && this.poisonedReason) {
        throw new AsyncReplError(`strictSandbox evaluator is poisoned after ${this.poisonedReason}; create a new evaluator`, []);
      }
      const logs: string[] = [];
      const generation = ++this.evaluationSequence;
      if (this.strictSandbox) this.activeEvaluations.add(generation);
      if (this.strictSandbox) vm.runInContext("globalThis.__openskyLogs.length = 0", this.sandbox);
      const previousConsole = this.sandbox.console;
      if (!this.strictSandbox) this.sandbox.console = createConsoleProxy(logs);
      try {
        const wrapped = wrapAsync(code);
        const script = new vm.Script(wrapped, { filename });
        const bindings = cellBindings(code);
        for (const name of bindings.writes) {
          if (this.constBindings.has(name)) logs.push(`${name} was declared with const; use let for reassignable variables.`);
        }
        for (const name of bindings.constants) this.constBindings.add(name);
        const evaluated = this.strictSandbox
          ? this.strictEvaluation.run(generation, () => script.runInContext(this.sandbox, { timeout: this.timeoutMs }))
          : script.runInContext(this.sandbox, { timeout: this.timeoutMs });
        const value = this.strictSandbox
          ? await awaitContextValue(evaluated, this.sandbox, this.timeoutMs)
          : await withDeadline(Promise.resolve(evaluated), this.timeoutMs);
        if (this.strictSandbox) {
          logs.push(...Array.from(this.sandbox.__openskyLogs as unknown[], (value) => String(value)));
        }
        return { value, logs };
      } catch (error) {
        if (this.strictSandbox) {
          logs.push(...Array.from(this.sandbox.__openskyLogs as unknown[], (value) => String(value)));
        }
        const message = error instanceof Error ? error.message : String(error);
        if (this.strictSandbox && /timed out/i.test(message)) this.poisonedReason = message;
        throw new AsyncReplError(message, logs, { cause: error });
      } finally {
        if (this.strictSandbox) this.activeEvaluations.delete(generation);
        if (!this.strictSandbox) this.sandbox.console = previousConsole;
      }
    };

    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

// Match the native REPL's advisory (not immutable) const behavior for direct
// cell writes. Do not inspect deferred function bodies or block-local names:
// a warning must not claim that an object's property mutation rebinds it.
function cellBindings(source: string): { constants: Set<string>; writes: Set<string> } {
  type Ast = Node & Record<string, any>;
  const constants = new Set<string>();
  const writes = new Set<string>();
  let program: Ast;
  try {
    program = parse(stripReplWrapper(source), { ecmaVersion: "latest", allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true }) as Ast;
  } catch { return { constants, writes }; }
  const names = (node: Ast): string[] => {
    switch (node.type) {
      case "Identifier": return [node.name];
      case "RestElement": return names(node.argument);
      case "AssignmentPattern": return names(node.left);
      case "ArrayPattern": return node.elements.flatMap((item: Ast | null) => item ? names(item) : []);
      case "ObjectPattern": return node.properties.flatMap((item: Ast) => names(item.type === "RestElement" ? item : item.value));
      default: return []; // Member expressions mutate properties, not bindings.
    }
  };
  const expressionWrites = (node: Ast | null | undefined): void => {
    if (!node || /Function|Class/.test(node.type)) return;
    if (node.type === "AssignmentExpression" || node.type === "UpdateExpression") {
      for (const name of names(node.type === "AssignmentExpression" ? node.left : node.argument)) writes.add(name);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) { if (child?.type) expressionWrites(child); }
      else if (value && typeof value === "object" && "type" in value) expressionWrites(value as Ast);
    }
  };
  for (const statement of program.body as Ast[]) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations as Ast[]) {
        for (const name of names(declaration.id)) {
          if (statement.kind === "const") constants.add(name);
          if (declaration.init || statement.kind !== "var") writes.add(name);
        }
        expressionWrites(declaration.init);
      }
    } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) {
      writes.add(statement.id.name);
    } else if (statement.type === "ExpressionStatement") expressionWrites(statement.expression);
    else if (statement.type === "ReturnStatement" || statement.type === "ThrowStatement") expressionWrites(statement.argument);
  }
  return { constants, writes };
}

export function wrapAsync(code: string): string {
  const trimmed = stripReplWrapper(code);
  try {
    // Bun's vm.Script defers syntax errors until runInContext, so use the host
    // parser only to distinguish an expression from an async function body.
    // The supplied code is never executed by this Function.
    new Function(`return (${trimmed}\n);`);
    return `(async () => (${trimmed}\n))()`;
  } catch {
    return `(async () => {\n${persistDeclarations(trimmed)}\n})()`;
  }
}

// Async cells need a wrapper, but its lexical scope must not discard the
// bindings users create. Only program-level declarations become session
// properties; nested functions and blocks retain normal lexical semantics.
function persistDeclarations(code: string): string {
  const program = parse(code, { ecmaVersion: "latest", allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  type Ast = Node & Record<string, any>;
  const pattern = (node: Ast): string => {
    switch (node.type) {
      case "Identifier":
        if (["globalThis", "__openskyLogs"].includes(node.name)) throw new SyntaxError(`Reserved REPL binding ${node.name}`);
        return `globalThis[${JSON.stringify(node.name)}]`;
      case "RestElement": return `...${pattern(node.argument)}`;
      case "AssignmentPattern": return `${pattern(node.left)} = ${code.slice(node.right.start, node.right.end)}`;
      case "ArrayPattern": return `[${node.elements.map((child: Ast | null) => child ? pattern(child) : "").join(",")}${node.elements.at(-1) === null ? "," : ""}]`;
      case "ObjectPattern": return `{${node.properties.map((property: Ast) => {
        if (property.type === "RestElement") return pattern(property);
        const key = code.slice(property.key.start, property.key.end);
        return `${property.computed ? `[${key}]` : key}: ${pattern(property.value)}`;
      }).join(",")}}`;
      default: throw new SyntaxError(`Unsupported declaration pattern ${node.type}`);
    }
  };
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const hoisted: string[] = [];
  for (const statement of program.body as Ast[]) {
    if (statement.type === "VariableDeclaration") {
      edits.push({ start: statement.start, end: statement.end, text: statement.declarations.map((declaration: Ast) => {
        if (!declaration.init && statement.kind === "var" && declaration.id.type === "Identifier") {
          const target = pattern(declaration.id);
          return `if (!Object.prototype.hasOwnProperty.call(globalThis, ${JSON.stringify(declaration.id.name)})) ${target} = undefined;`;
        }
        const value = declaration.init ? code.slice(declaration.init.start, declaration.init.end) : "undefined";
        return `(${pattern(declaration.id)} = (${value}));`;
      }).join("\n") });
    } else if ((statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") && statement.id) {
      const assignment = `${pattern(statement.id)} = (${code.slice(statement.start, statement.end)});`;
      if (statement.type === "FunctionDeclaration") hoisted.push(assignment);
      edits.push({ start: statement.start, end: statement.end,
        text: statement.type === "FunctionDeclaration" ? "" : assignment });
    }
  }
  const last = program.body.at(-1) as Ast | undefined;
  if (last?.type === "ExpressionStatement") {
    edits.push({ start: last.start, end: last.end, text: `return (${code.slice(last.expression.start, last.expression.end)});` });
  }
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return hoisted.join("\n") + "\n" + code;
}

export function isRecoverableSyntaxError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) return false;
  const message = error.message;
  return (
    message.includes("Unexpected end of input") ||
    message.includes("Unexpected token") && message.includes("end of input") ||
    /missing\)/.test(message)
  );
}

export function startInteractiveRepl(options: {
  context: Record<string, unknown>;
  prompt?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}): repl.REPLServer {
  const asyncRepl = new AsyncRepl({ context: options.context });
  const server = repl.start({
    prompt: options.prompt ?? "opensky> ",
    input: options.input,
    output: options.output,
    preview: false,
    ignoreUndefined: true,
    eval: (cmd, _context, filename, callback) => {
      void (async () => {
        try {
          new vm.Script(stripReplWrapper(cmd));
        } catch (error) {
          if (isRecoverableSyntaxError(error)) {
            callback(new repl.Recoverable(error as Error), undefined);
            return;
          }
        }
        try {
          const result = await asyncRepl.evaluate(cmd, filename);
          for (const line of result.logs) {
            (options.output ?? process.stdout).write(`${line}\n`);
          }
          callback(null, result.value);
        } catch (error) {
          callback(error as Error, undefined);
        }
      })();
    },
    writer: (value) => inspect(value, { depth: 6, colors: Boolean((options.output ?? process.stdout).writable) }),
  });
  Object.assign(server.context, asyncRepl.context);
  return server;
}

export function createHeadlessStreams(): { input: PassThrough; output: Writable; chunks: string[] } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { input, output, chunks };
}

const SANDBOX_BUILTINS: Record<string, unknown> = {
  Date,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Function,
  JSON,
  Math,
  Error,
  TypeError,
  RangeError,
  RegExp,
  SyntaxError,
  URIError,
  ReferenceError,
  Promise,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Symbol,
  Proxy,
  Reflect,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURI,
  decodeURI,
  encodeURIComponent,
  decodeURIComponent,
  undefined,
  NaN,
  Infinity,
  Intl,
  BigInt,
  ArrayBuffer,
  DataView,
  Uint8Array,
  Uint8ClampedArray,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  TextEncoder,
  TextDecoder,
  atob,
  btoa,
  structuredClone,
};

function createSandbox(context: Record<string, unknown>, allowNodeApis: boolean, strictSandbox = false): Record<string, unknown> {
  const store = Object.assign(Object.create(null) as Record<string | symbol, unknown>, strictSandbox ? {} : {
    ...SANDBOX_BUILTINS,
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    URL,
    URLSearchParams,
    state: {},
    ...context,
  });
  if (allowNodeApis) {
    store.process = process;
    store.require = createRequire(import.meta.url);
  }
  // A contextified plain null-prototype object receives realm-native intrinsics.
  // A get-trapping Proxy would shadow those intrinsics and make Object/JSON/etc.
  // unavailable; host values are already excluded above in strict mode.
  if (strictSandbox) return store as Record<string, unknown>;
  store.globalThis = store;
  return new Proxy(store, {
    has(target, prop) {
      if (prop === Symbol.unscopables) return false;
      return prop in target;
    },
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined;
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop in target) return Object.getOwnPropertyDescriptor(target, prop);
      return undefined;
    },
    defineProperty(target, prop, descriptor) {
      Object.defineProperty(target, prop, descriptor);
      return true;
    },
    ownKeys(target) {
      return Reflect.ownKeys(target);
    },
  }) as unknown as Record<string, unknown>;
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Evaluation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function awaitContextValue(value: unknown, context: vm.Context, timeoutMs: number): Promise<unknown> {
  if (!value || (typeof value !== "object" && typeof value !== "function") || typeof (value as { then?: unknown }).then !== "function") {
    return value;
  }
  let settled = false;
  let rejected = false;
  let result: unknown;
  let failure: unknown;
  Promise.resolve(value).then(
    (next) => { settled = true; result = next; },
    (error) => { settled = true; rejected = true; failure = error; },
  );
  const deadline = Date.now() + timeoutMs;
  while (!settled) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Evaluation timed out after ${timeoutMs}ms`);
    // With microtaskMode=afterEvaluate this empty turn drains realm-created
    // Promise continuations under vm's synchronous timeout accounting.
    vm.runInContext("", context, { timeout: Math.max(1, remaining) });
    if (!settled) await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (rejected) throw failure;
  return result;
}

function initializeStrictSandbox(context: vm.Context): void {
  vm.runInContext(`
    globalThis.state = Object.create(null);
    globalThis.__openskyLogs = [];
    const format = (value) => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value, (_key, child) =>
          ArrayBuffer.isView(child)
            ? "[" + child.constructor.name + ": " + child.byteLength + " bytes]"
            : child
        );
      } catch { return String(value); }
    };
    const write = (...values) => globalThis.__openskyLogs.push(values.map(format).join(" "));
    globalThis.console = Object.freeze({ log: write, info: write, warn: write, error: write, debug: write, dir: write });
  `, context);
}

function stripReplWrapper(code: string): string {
  const trimmed = code.replace(/^\s+|\s+$/g, "");
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    try {
      new vm.Script(trimmed);
      return trimmed;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return code;
}

function createConsoleProxy(logs: string[]) {
  const push = (...args: unknown[]) => {
    logs.push(args.map(formatValue).join(" "));
  };
  return {
    log: push,
    info: push,
    warn: push,
    error: push,
    debug: push,
    dir: (value: unknown) => push(value),
  };
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 5, colors: false, breakLength: 120 });
}
