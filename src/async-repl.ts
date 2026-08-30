import { createRequire } from "node:module";
import { inspect } from "node:util";
import vm from "node:vm";
import repl from "node:repl";
import { PassThrough, Writable } from "node:stream";

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
}

export class AsyncRepl {
  private readonly sandbox: vm.Context;
  private queue: Promise<void> = Promise.resolve();
  private readonly timeoutMs: number;

  constructor(options: AsyncReplOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.sandbox = vm.createContext(createSandbox(options.context ?? {}));
  }

  get context(): vm.Context {
    return this.sandbox;
  }

  assign(values: Record<string, unknown>): void {
    Object.assign(this.sandbox, values);
  }

  async evaluate(code: string, filename = "ccua"): Promise<EvalResult> {
    const run = async (): Promise<EvalResult> => {
      const logs: string[] = [];
      const previousConsole = this.sandbox.console;
      this.sandbox.console = createConsoleProxy(logs);
      try {
        const wrapped = wrapAsync(code);
        const script = new vm.Script(wrapped, { filename });
        const evaluated = script.runInContext(this.sandbox, { timeout: this.timeoutMs });
        const value = await Promise.resolve(evaluated);
        return { value, logs };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new AsyncReplError(message, logs, { cause: error });
      } finally {
        this.sandbox.console = previousConsole;
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

export function wrapAsync(code: string): string {
  const trimmed = stripReplWrapper(code);
  try {
    new vm.Script(`(async () => (${trimmed}\n))()`);
    return `(async () => (${trimmed}\n))()`;
  } catch {
    return `(async () => {\n${trimmed}\n})()`;
  }
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
    prompt: options.prompt ?? "ccua> ",
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

function createSandbox(context: Record<string, unknown>): Record<string, unknown> {
  const store: Record<string | symbol, unknown> = {
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    URL,
    URLSearchParams,
    require: createRequire(import.meta.url),
    state: {},
    ...context,
  };
  return new Proxy(store, {
    has() {
      return true;
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
      return { configurable: true, enumerable: true, writable: true, value: undefined };
    },
    defineProperty(target, prop, descriptor) {
      Object.defineProperty(target, prop, descriptor);
      return true;
    },
  }) as unknown as Record<string, unknown>;
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
