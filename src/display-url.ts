/** Destination metadata is explanatory, never an input selector. Keep long
 * signed/tracking URLs from consuming the actionable-control text budget.
 * Preserve the complete URL on the underlying element; visibly mark previews.
 */
export function displayUrlAttribute(url: string | undefined): string {
  if (!url) return "";
  const prefix: string[] = [];
  for (const point of url) {
    if (prefix.length === 200) {
      return ` urlPreview=${JSON.stringify(`${prefix.slice(0, 199).join("")}…`)}`;
    }
    prefix.push(point);
  }
  return ` url=${JSON.stringify(url)}`;
}
