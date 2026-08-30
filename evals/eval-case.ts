export type EvalCaseFn = (context: EvalContext) => Promise<EvalScore | void>;

export type EvalCaseOptions = {
  name: string;
};

export type EvalCaseRecord = {
  name: string;
  only: boolean;
  filePath: string | null;
  run: EvalCaseFn;
};

export type EvalScore = {
  criteria: Array<{ criterion: string; pass: boolean; reason: string }>;
  passed: number;
  total: number;
  percent: number;
  agent?: {
    prompt: string;
    model: string;
    sessionId: string;
  };
  judge?: {
    prompt: string;
    model: string;
    result: string;
  };
};

export type EvalContext = {
  harness: EvalHarness;
};

export type EvalHarness = {
  name: EvalHarnessName;
  send: (prompt: string) => Promise<EvalResponse>;
};

export type EvalHarnessName = "opensky" | "cua-driver" | "codex";

export type EvalResponse = {
  prompt: string;
  transcript: string;
  sessionId: string;
  score: (criteria: string[]) => Promise<EvalScore>;
};

type RegisterOptions = { only?: boolean };

const registry: EvalCaseRecord[] = [];
let currentImportFilePath: string | null = null;

function registerEvalCase(options: EvalCaseOptions, run: EvalCaseFn, registerOptions: RegisterOptions = {}): void {
  const name = options.name.trim();
  if (!name) throw new Error("evalCase requires a non-empty name.");
  registry.push({
    name,
    only: registerOptions.only === true,
    filePath: currentImportFilePath,
    run,
  });
}

export const evalCase = Object.assign(
  (options: EvalCaseOptions, run: EvalCaseFn) => {
    registerEvalCase(options, run);
  },
  {
    only: (options: EvalCaseOptions, run: EvalCaseFn) => {
      registerEvalCase(options, run, { only: true });
    },
  },
);

export function getEvalCases(): EvalCaseRecord[] {
  return [...registry];
}

export async function withEvalFileRegistration<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const previous = currentImportFilePath;
  currentImportFilePath = filePath;
  try {
    return await fn();
  } finally {
    currentImportFilePath = previous;
  }
}
