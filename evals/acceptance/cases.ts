export type AcceptanceFamily = "amazon" | "github" | "wikipedia" | "hacker-news" | "mdn" | "activity-monitor";

export type StructuralOracle = Readonly<{
  answerFields: readonly Readonly<{
    name: string;
    description: string;
    pattern?: string;
  }>[];
  requiredTraceEvidence: readonly string[];
  forbiddenTraceEvidence: readonly string[];
  lifecycle: Readonly<{
    targetKind: "exact_browser_session" | "native_window";
    workTarget: string;
    mustBeClosed: boolean;
    protectedSiblings: readonly string[];
    evaluatorCreatedPrerequisites: readonly string[];
  }>;
}>;

export type AcceptanceCase = Readonly<{
  family: AcceptanceFamily;
  id: string;
  seed: number;
  prompt: string;
  oracle: StructuralOracle;
}>;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

const closeOnlyWorkTarget =
  "Before finishing, close only the evaluator-owned work target created for this task. " +
  "Do not close any pre-existing or user-owned sibling target. If you created a prerequisite target, close it only after the " +
  "work target is closed. In the final response, state which work target you closed and which sibling targets you preserved.";

function browserCase(
  family: Exclude<AcceptanceFamily, "activity-monitor">,
  seed: number,
  id: string,
  body: string,
  answerFields: StructuralOracle["answerFields"],
  requiredTraceEvidence: readonly string[],
): AcceptanceCase {
  return deepFreeze({
    family,
    seed,
    id,
    prompt: `${body} ${closeOnlyWorkTarget}`,
    oracle: Object.freeze({
      answerFields,
      requiredTraceEvidence,
      forbiddenTraceEvidence: Object.freeze([
        "sign-in submission",
        "cart mutation",
        "purchase or checkout",
        "repository mutation",
        "Wikipedia edit submission",
        "closing an unowned browser tab or window",
      ]),
      lifecycle: Object.freeze({
        targetKind: "exact_browser_session" as const,
        workTarget: "new evaluator-owned browser tab or isolated browser session",
        mustBeClosed: true,
        protectedSiblings: Object.freeze(["all browser tabs and windows not created by this evaluation"]),
        evaluatorCreatedPrerequisites: Object.freeze([]),
      }),
    }),
  });
}

const families = deepFreeze({
  amazon: Object.freeze([
    browserCase(
      "amazon",
      0,
      "amazon-search-first-organic-result",
      "Using an available browser, open https://www.amazon.com/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use Amazon's visible search interface to search for exactly `ergonomic vertical mouse`. Report the exact search query " +
        "shown and the title of the first visible organic product result. Do not sign in, add anything to a cart, or purchase anything.",
      Object.freeze([
        { name: "visible_query", description: "Exact query visibly shown by Amazon", pattern: "ergonomic vertical mouse" },
        { name: "first_organic_title", description: "Non-empty title of the first visible organic product" },
      ]),
      Object.freeze(["fresh Amazon target", "visible Amazon search control interaction", "visible organic-result evidence"]),
    ),
    browserCase(
      "amazon",
      1,
      "amazon-search-first-organic-result-seed-1",
      "Using an available browser, open https://www.amazon.com/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use Amazon's visible search interface to search for exactly `stainless steel water bottle`. Report the exact search " +
        "query shown and the title of the first visible organic product result. Do not sign in, add anything to a cart, or purchase anything.",
      Object.freeze([
        { name: "visible_query", description: "Exact query visibly shown by Amazon", pattern: "stainless steel water bottle" },
        { name: "first_organic_title", description: "Non-empty title of the first visible organic product" },
      ]),
      Object.freeze(["fresh Amazon target", "visible Amazon search control interaction", "visible organic-result evidence"]),
    ),
  ]),
  github: Object.freeze([
    browserCase(
      "github",
      0,
      "github-latest-release",
      "Using an available browser, open https://github.com/openai/codex in a new evaluator-owned browser tab or isolated browser session. " +
        "Using only the visible repository UI, navigate to its Releases page. Report the exact version/tag or title marked Latest " +
        "and the visible relative publication time. Do not sign in or change repository state.",
      Object.freeze([
        { name: "latest_release", description: "Exact visible version, tag, or release title marked Latest" },
        { name: "relative_publication_time", description: "Visible relative publication time" },
      ]),
      Object.freeze(["fresh repository target", "visible Releases navigation", "visible Latest marker"]),
    ),
    browserCase(
      "github",
      1,
      "github-default-branch-latest-commit",
      "Using an available browser, open https://github.com/trycua/cua in a new evaluator-owned browser tab or isolated browser session. " +
        "Using only the visible repository UI, report the default branch name, the abbreviated identifier of the latest visible " +
        "commit on that branch, and its visible relative time. Do not sign in or change repository state.",
      Object.freeze([
        { name: "default_branch", description: "Visible default branch name" },
        { name: "latest_commit", description: "Visible abbreviated latest commit identifier" },
        { name: "relative_commit_time", description: "Visible relative commit time" },
      ]),
      Object.freeze(["fresh repository target", "visible default-branch evidence", "visible commit identifier and time"]),
    ),
  ]),
  wikipedia: Object.freeze([
    browserCase(
      "wikipedia",
      0,
      "wikipedia-visible-search",
      "Using an available browser, open https://www.wikipedia.org/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use Wikipedia's visible search interface to search for exactly `computer accessibility`, open the matching English " +
        "article, and report the visible article title and first section heading after the lead. Do not sign in or edit anything.",
      Object.freeze([
        { name: "article_title", description: "Visible English article title" },
        { name: "first_section_heading", description: "First visible section heading after the lead" },
      ]),
      Object.freeze(["fresh Wikipedia target", "visible site search interaction", "visible article title and section heading"]),
    ),
    browserCase(
      "wikipedia",
      1,
      "wikipedia-visible-search-seed-1",
      "Using an available browser, open https://www.wikipedia.org/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use Wikipedia's visible search interface to search for exactly `assistive technology`, open the matching English " +
        "article, and report the visible article title and first section heading after the lead. Do not sign in or edit anything.",
      Object.freeze([
        { name: "article_title", description: "Visible English article title" },
        { name: "first_section_heading", description: "First visible section heading after the lead" },
      ]),
      Object.freeze(["fresh Wikipedia target", "visible site search interaction", "visible article title and section heading"]),
    ),
  ]),
  "hacker-news": Object.freeze([
    browserCase(
      "hacker-news",
      0,
      "hacker-news-first-story-with-score",
      "Using an available browser, open https://news.ycombinator.com/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Using only the visible ranked list, report the rank, exact title, and visible score of the first story whose score is at " +
        "least 100 points. Do not open comments, sign in, vote, or submit anything.",
      Object.freeze([
        { name: "rank", description: "Visible positive integer rank of the first qualifying story", pattern: "^[1-9][0-9]*$" },
        { name: "story_title", description: "Exact visible title of the first qualifying story" },
        { name: "visible_score", description: "Visible score of at least 100 points", pattern: "^(?:[1-9][0-9]{2,}) points$" },
      ]),
      Object.freeze(["fresh Hacker News target", "visible rank/title/score evidence", "first qualifying story established from visible list order"]),
    ),
    browserCase(
      "hacker-news",
      1,
      "hacker-news-first-story-with-comments",
      "Using an available browser, open https://news.ycombinator.com/newest in a new evaluator-owned browser tab or isolated browser session. " +
        "Using only the visible ranked list, report the rank, exact title, and visible comment count of the first story showing at " +
        "least 10 comments. Do not open the story or comments, sign in, vote, or submit anything.",
      Object.freeze([
        { name: "rank", description: "Visible positive integer rank of the first qualifying story", pattern: "^[1-9][0-9]*$" },
        { name: "story_title", description: "Exact visible title of the first qualifying story" },
        { name: "visible_comment_count", description: "Visible comment count of at least 10", pattern: "^(?:[1-9][0-9]+) comments$" },
      ]),
      Object.freeze(["fresh Hacker News target", "visible rank/title/comment evidence", "first qualifying story established from visible list order"]),
    ),
  ]),
  mdn: Object.freeze([
    browserCase(
      "mdn",
      0,
      "mdn-site-search-accessibility",
      "Using an available browser, open https://developer.mozilla.org/en-US/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use MDN's visible site search to search for exactly `Accessibility`. Open the first visible result whose title exactly " +
        "matches that query, then report the visible article title and first section heading after the lead. Do not sign in or edit anything.",
      Object.freeze([
        { name: "article_title", description: "Visible article title", pattern: "^Accessibility$" },
        { name: "first_section_heading", description: "First visible section heading after the lead" },
      ]),
      Object.freeze(["fresh MDN target", "visible MDN search interaction", "visible exact-match result selection", "visible article and first-section evidence"]),
    ),
    browserCase(
      "mdn",
      1,
      "mdn-site-search-aria",
      "Using an available browser, open https://developer.mozilla.org/en-US/ in a new evaluator-owned browser tab or isolated browser session. " +
        "Use MDN's visible site search to search for exactly `ARIA`. Open the first visible result whose title exactly matches that " +
        "query, then report the visible article title and first section heading after the lead. Do not sign in or edit anything.",
      Object.freeze([
        { name: "article_title", description: "Visible article title", pattern: "^ARIA$" },
        { name: "first_section_heading", description: "First visible section heading after the lead" },
      ]),
      Object.freeze(["fresh MDN target", "visible MDN search interaction", "visible exact-match result selection", "visible article and first-section evidence"]),
    ),
  ]),
  "activity-monitor": Object.freeze([
    Object.freeze({
      family: "activity-monitor" as const,
      seed: 0,
      id: "activity-monitor-cpu-history-window-count",
      prompt:
        "Using Activity Monitor's visible UI, identify its main process-list window and treat that main window as a protected " +
        "sibling while you work. Open the CPU History window as a separate evaluator-owned work target. Count the individual " +
        "CPU history graphs visibly present in that window and report the count. Close the CPU History work window, verify it " +
        "is no longer present, and preserve the protected main process-list window. If this evaluation launched Activity Monitor " +
        `and therefore owns that prerequisite main window, close it only after verifying the work-window result. ${closeOnlyWorkTarget}`,
      oracle: Object.freeze({
        answerFields: Object.freeze([
          { name: "cpu_history_graph_count", description: "Positive integer count of visibly present CPU History graphs", pattern: "^[1-9][0-9]*$" },
        ]),
        requiredTraceEvidence: Object.freeze([
          "Activity Monitor main process-list window observed",
          "distinct CPU History window observed",
          "individual graph count derived from visible UI",
          "exact CPU History work-target close",
        ]),
        forbiddenTraceEvidence: Object.freeze([
          "closing the protected main window before the CPU History close postcondition",
          "killing Activity Monitor to close one work window",
          "using shell or system APIs to obtain processor count",
        ]),
        lifecycle: Object.freeze({
          targetKind: "native_window" as const,
          workTarget: "Activity Monitor CPU History window",
          mustBeClosed: true,
          protectedSiblings: Object.freeze(["Activity Monitor main process-list window while work target is active"]),
          evaluatorCreatedPrerequisites: Object.freeze(["Activity Monitor main process-list window, only if the evaluation launched it"]),
        }),
      }),
    }),
    Object.freeze({
      family: "activity-monitor" as const,
      seed: 1,
      id: "activity-monitor-cpu-history-window-count-seed-1",
      prompt:
        "Using Activity Monitor's visible UI, identify its main process-list window and treat that main window as a protected " +
        "sibling while you work. Open the CPU History window as a separate evaluator-owned work target. Report both the count " +
        "of individual CPU history graphs visibly present and whether every graph has the same visible width. Close the CPU " +
        "History work window, verify it is no longer present, and preserve the protected main process-list window. If this " +
        `evaluation launched Activity Monitor, close its prerequisite main window last. ${closeOnlyWorkTarget}`,
      oracle: Object.freeze({
        answerFields: Object.freeze([
          { name: "cpu_history_graph_count", description: "Positive integer count of visibly present CPU History graphs", pattern: "^[1-9][0-9]*$" },
          { name: "uniform_visible_width", description: "Visible yes/no comparison of graph widths", pattern: "^(yes|no)$" },
        ]),
        requiredTraceEvidence: Object.freeze([
          "Activity Monitor main process-list window observed",
          "distinct CPU History window observed",
          "graph count and width comparison derived from visible UI",
          "exact CPU History work-target close",
        ]),
        forbiddenTraceEvidence: Object.freeze([
          "closing the protected main window before the CPU History close postcondition",
          "killing Activity Monitor to close one work window",
          "using shell or system APIs to obtain processor count",
        ]),
        lifecycle: Object.freeze({
          targetKind: "native_window" as const,
          workTarget: "Activity Monitor CPU History window",
          mustBeClosed: true,
          protectedSiblings: Object.freeze(["Activity Monitor main process-list window while work target is active"]),
          evaluatorCreatedPrerequisites: Object.freeze(["Activity Monitor main process-list window, only if the evaluation launched it"]),
        }),
      }),
    }),
  ]),
} satisfies Readonly<Record<AcceptanceFamily, readonly AcceptanceCase[]>>);

function normalizeSeed(value: string | undefined): number {
  if (value === undefined) return 0;
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`EVAL_SEED must be a non-negative safe integer; received ${JSON.stringify(value)}`);
  return seed;
}

export function selectAcceptanceCase(familyValue: string | undefined, seedValue: string | undefined): AcceptanceCase {
  const family = (familyValue ?? "amazon") as AcceptanceFamily;
  const variants = families[family];
  if (!variants) throw new Error(`Unknown EVAL_TASK ${JSON.stringify(familyValue)}`);
  const seed = normalizeSeed(seedValue);
  const selected = variants[seed % variants.length]!;
  return Object.freeze({ ...selected, seed });
}

export const acceptanceFamilies = families;
