import type { SnapshotElement } from "./types.js";

/** Project only driver-attested native rows; malformed/older evidence stays full. */
export function projectNativeCollectionRows(tree: string, elements: SnapshotElement[], value: unknown):
  { tree: string; elements: SnapshotElement[]; hiddenIndices: Set<number> } {
  const structural = (line: string) => /^\s*- (?:\[\d+\] )?AX[A-Za-z]+\b/.test(line);
  const lines = tree.split("\n"), hiddenLines = new Set<number>(), hiddenIndices = new Set<number>();
  const annotations = new Map<number, string>();
  const rowLines = new Map<number, number[]>();
  lines.forEach((line, i) => { const m = line.match(/^\s*- \[(\d+)\] AXRow\b/); if (m) rowLines.set(Number(m[1]), [...(rowLines.get(Number(m[1])) ?? []), i]); });
  const ids = (v: unknown): number[] | undefined => Array.isArray(v) && v.every(n => Number.isSafeInteger(n) && n >= 0) && new Set(v).size === v.length ? v : undefined;
  if (Array.isArray(value)) for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const scope = raw as Record<string, unknown>;
    if (scope.source !== "AXVisibleRows" || scope.web_content !== false || !["AXTable", "AXOutline"].includes(String(scope.role))) continue;
    const all = ids(scope.row_element_indices), visible = ids(scope.visible_row_element_indices), selected = ids(scope.selected_row_element_indices);
    if (!all?.length || !visible || !selected || !visible.concat(selected).every(id => all.includes(id))) continue;
    if (!all.every(id => rowLines.get(id)?.length === 1 && elements.filter(e => e.element_index === id && e.role === "AXRow").length === 1)) continue;
    const starts = all.map(id => rowLines.get(id)![0]);
    if (starts.some((s, i) => i > 0 && s <= starts[i - 1])) continue;
    const rowDepth = lines[starts[0]].match(/^\s*/)![0].length;
    if (!starts.every(s => lines[s].match(/^\s*/)![0].length === rowDepth)) continue;
    let parent = starts[0] - 1;
    while (parent >= 0 && lines[parent].match(/^\s*/)![0].length >= rowDepth) parent--;
    if (parent < 0 || !new RegExp(`^\\s*- (?:\\[\\d+\\] )?${scope.role}\\b`).test(lines[parent])) continue;
    // Every row must share this exact physical parent, not merely its depth.
    const end = lines.findIndex((line, i) => i > parent && structural(line) && line.match(/^\s*/)![0].length < rowDepth);
    const parentEnd = end < 0 ? lines.length : end;
    if (!starts.every(s => s < parentEnd) || annotations.has(parent)) continue;
    const directRows = [...rowLines.entries()].filter(([, positions]) => positions.some(s => s > parent && s < parentEnd && lines[s].match(/^\s*/)![0].length === rowDepth));
    if (directRows.length !== all.length || !directRows.every(([id]) => all.includes(id))) continue;
    const retained = new Set(visible.concat(selected));
    const omitted = all.filter(id => !retained.has(id));
    if (!omitted.length) continue;
    for (const id of omitted) {
      const start = rowLines.get(id)![0];
      let end = start + 1;
      while (end < lines.length && (!structural(lines[end]) || lines[end].match(/^\s*/)![0].length > rowDepth)) end++;
      for (let i = start; i < end; i++) hiddenLines.add(i);
    }
    annotations.set(parent, ` [collection viewport: ${visible.length} visible of ${all.length} loaded rows; ${omitted.length} offscreen rows omitted${selected.some(id => !visible.includes(id)) ? "; offscreen selection retained" : ""}. Scroll this list or request getAXState({collectionScope:"all"}) for all loaded rows.]`);
  }
  for (const i of hiddenLines) { const m = lines[i].match(/^\s*- \[(\d+)\]/); if (m) hiddenIndices.add(Number(m[1])); }
  return { tree: lines.map((line, i) => line + (annotations.get(i) ?? "")).filter((_, i) => !hiddenLines.has(i)).join("\n"),
    elements: elements.filter(e => !hiddenIndices.has(e.element_index)), hiddenIndices };
}
