import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compactBrowserOutline, renderBrowserState } from "../src/opensky.js";
import type { SnapshotElement } from "../src/types.js";

const complete = { snapshot: { complete: true }, page: { title: "Example", url: "https://example.com" } };

describe("source-faithful browser rendering (pure regression tests, not driver acceptance)", () => {
  it("retains named and stateful generic nodes", () => {
    const source = ['- generic "Notice"', '- generic [expanded=true]', '- generic: draft', '- generic "" [disabled=true]'].join("\n");
    assert.equal(compactBrowserOutline(source).text, source);
  });

  it("retains repeated text in separate containers and under the same parent", () => {
    const source = [
      '- list', '  - listitem "One"', '    - statictext "Available"',
      '  - listitem "Two"', '    - statictext "Available"',
      '    - statictext "Available"',
    ].join("\n");
    assert.equal(compactBrowserOutline(source).text, source);
  });

  it("keeps arbitrary source indentation, including a non-root first line", () => {
    const source = ['          - region "Deep"', '            - link "Child"', '              - statictext "Caption"'].join("\n");
    assert.equal(compactBrowserOutline(source).text, source);
  });

  it("does not reparent mixed indentation, multiline values, or disconnected source lines", () => {
    const source = '    - textbox "Memo": first\n   indented value\n\tvalue\n\n- region "Elsewhere"\n            - link "Detached"\n';
    assert.equal(compactBrowserOutline(source).text, source);
  });

  it("distinguishes driver completeness from a renderer-truncated prefix", () => {
    const source = Array.from({ length: 180 }, (_, i) => `- statictext ${JSON.stringify(`entry ${i} ${"x".repeat(100)}`)}`).join("\n");
    const text = renderBrowserState(source, [], complete);
    assert.match(text, /Driver semantic collection is complete/);
    assert.match(text, /Rendered view is partial/);
    assert.match(text, /outline source lines omitted/);
    assert.doesNotMatch(text, /lower-ranked page content/);
  });

  it("distinguishes action-list truncation and ranking from page order", () => {
    const elements = Array.from({ length: 121 }, (_, element_index): SnapshotElement => ({ element_index, role: "button", label: `Choice ${element_index}`, actions: ["click"] }));
    const text = renderBrowserState('- region "Choices"', elements, complete);
    assert.match(text, /Rendered view is partial/);
    assert.match(text, /1 actionable elements omitted/);
    assert.match(text, /Actionable elements \(ranked, not page order\)/);
  });

  it("does not claim complete collection when metadata is absent", () => {
    assert.match(renderBrowserState('- heading "Unknown"', [], {}), /completeness is unavailable/);
    assert.doesNotMatch(renderBrowserState('- heading "Unknown"', [], {}, true), /is complete/);
  });

  it("abbreviates only bare generics and explains the non-actionable placeholder", () => {
    const source = ['  - generic', '    - generic ""', '    - generic [busy=true]', '\t- generic', '   - generic ', '  - group'].join("\n");
    const result = compactBrowserOutline(source);
    assert.equal(result.text, source.replace('  - generic\n', '  -\n'));
    assert.equal(result.abbreviatedContainers, 1);
    assert.equal(result.omittedLines, 0);
    assert.match(renderBrowserState(source, [], complete), /unnamed generic container, not an action ref/);
    assert.doesNotMatch(renderBrowserState('- generic "Named"', [], complete), /bare '-'/);
  });

  it("fits exact character boundaries without slicing a source line or surrogate pair", () => {
    const first = '- statictext "🍋"';
    const second = '- statictext "Next"';
    const source = `${first}\n${second}`;
    assert.deepEqual(compactBrowserOutline(source, source.length), { text: source, omittedLines: 0, abbreviatedContainers: 0 });
    assert.deepEqual(compactBrowserOutline(source, first.length), { text: first, omittedLines: 1, abbreviatedContainers: 0 });
    assert.deepEqual(compactBrowserOutline(source, first.length - 1), { text: "", omittedLines: 2, abbreviatedContainers: 0 });
    assert.deepEqual(compactBrowserOutline("", 0), { text: "", omittedLines: 0, abbreviatedContainers: 0 });
    assert.deepEqual(compactBrowserOutline("\n", 1), { text: "\n", omittedLines: 0, abbreviatedContainers: 0 });
    for (const invalid of [-1, 0.5, NaN, Infinity]) assert.throws(() => compactBrowserOutline(source, invalid), RangeError);
  });

  it("warns when no outline line fits, even if the driver is complete", () => {
    const text = renderBrowserState(`- statictext "${"x".repeat(10_001)}"\n- button "Tail"`, [], complete);
    assert.match(text, /Rendered view is partial: 2 outline source lines omitted/);
    assert.doesNotMatch(text, /- statictext|- button "Tail"/);
  });

  it("does not erase query scope when renderer limits omit matching rows", () => {
    const text = renderBrowserState(`- statictext "${"x".repeat(10_001)}"`, [], complete, true);
    assert.match(text, /complete for matching nodes/);
    assert.match(text, /Rendered view is partial/);
    assert.match(text, /Surrounding labels and page-wide order may be omitted/);
    assert.doesNotMatch(text, /Driver semantic collection is complete/);
  });

  it("retains action identity, exceptional visibility, and rank without synthesizing outline joins", () => {
    const elements: SnapshotElement[] = [
      { element_index: 9, role: "link", label: "Repeated", browser_ref: "p8:4", actions: ["click", "pointer"], visibility: "offscreen" },
      { element_index: 2, role: "link", label: "Repeated", browser_ref: "p8:9", actions: ["click"], browserFrame: "child", enabled: false },
    ];
    const before = structuredClone(elements);
    const text = renderBrowserState('- link "Repeated"\n- link "Repeated"', elements, complete);
    assert.deepEqual(elements, before);
    assert.ok(text.indexOf('[9]') < text.indexOf('[2]'));
    assert.match(text, /visibility=offscreen/);
    assert.match(text, /frame=child disabled/);
    assert.equal((text.match(/- link "Repeated"/g) ?? []).length, 2);
    assert.doesNotMatch(text, /p8:|actions=\[click,pointer\]/);
  });

  it("bounds long actionable labels and reports both independent render omissions", () => {
    const elements: SnapshotElement[] = [{ element_index: 0, role: "button", label: "x".repeat(8_001), actions: ["click"] }];
    const text = renderBrowserState('x'.repeat(10_001), elements, complete);
    assert.match(text, /1 outline source lines omitted .*; 1 actionable elements omitted/);
    assert.doesNotMatch(text, /\[0\]/);
    assert.ok(text.length < 700);
  });

  it("retains deterministic adversarial source order and depth across budget boundaries", () => {
    const lines = Array.from({ length: 128 }, (_, i) => {
      const indentation = i % 13 === 0 ? "\t" : " ".repeat((i * 17) % 31);
      const body = i % 7 === 0 ? '- generic' : i % 9 === 0 ? '' : `- statictext ${JSON.stringify(`repeat ${i % 3}: \\"quoted\\" 🍋`)} [selected=${i % 2 === 0}]`;
      return indentation + body;
    });
    const normalized = lines.map((line) => line.replace(/^( *)- generic$/, "$1-"));
    const source = lines.join("\n");
    for (const budget of [0, 1, 31, 100, 997, source.length]) {
      const result = compactBrowserOutline(source, budget);
      const retainedCount = lines.length - result.omittedLines;
      assert.equal(result.text, normalized.slice(0, retainedCount).join("\n"));
      assert.ok(result.text.length <= budget);
      if (result.omittedLines) assert.ok(normalized.slice(0, retainedCount + 1).join("\n").length > budget);
    }
  });
});
