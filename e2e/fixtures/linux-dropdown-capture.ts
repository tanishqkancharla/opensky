import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { test as popup } from "./linux-dropdown-popup-metadata.js";

type Rect = { x: number; y: number; width: number; height: number };
type Candidate = { xid: string; viewable: boolean; overrideRedirect: string; properties: string; geometry: Record<string, string> };
type Posture = { activeXid: string; activePid: string; candidates: Candidate[] };
type Comparison = { desktopHasContent: boolean; canvasPreserved: boolean; beforeMatchesDesktop: boolean; afterMatchesDesktop: boolean };

function geometry(values: Record<string, string>): Rect {
  const result = { x: Number(values["Absolute upper-left X"]), y: Number(values["Absolute upper-left Y"]), width: Number(values.Width), height: Number(values.Height) };
  if (Object.values(result).some(value => !Number.isSafeInteger(value)) || result.width <= 0 || result.height <= 0) throw new Error("Missing observer geometry");
  return result;
}

function ownedPopup(posture: Posture, owner: { window: string; pid: number }): Candidate {
  if (posture.activeXid !== owner.window || posture.activePid !== String(owner.pid)) throw new Error("Requested app is not foreground");
  const matches = posture.candidates.filter(candidate => candidate.viewable && candidate.overrideRedirect === "yes"
    && Number(candidate.properties?.match(/_NET_WM_PID\(CARDINAL\) = (\d+)/)?.[1]) === owner.pid
    && Number(candidate.properties?.match(/WM_TRANSIENT_FOR\(WINDOW\): window id # (0x[0-9a-f]+)/i)?.[1]) === Number(owner.window)
    && /_NET_WM_WINDOW_TYPE\(ATOM\) = _NET_WM_WINDOW_TYPE_COMBO\s*\n/.test(candidate.properties));
  if (matches.length !== 1) throw new Error(`Expected exactly one visible popup belonging to the requested app; found ${matches.length}`);
  return matches[0]!;
}

// The desktop is the independent human-visible pixel oracle. Compare its actual
// popup pixels to both public SDK observations, without OCR or a golden image.
// The existing bracket records every screenshot and read-only identity probe.
export const test = popup.extend<{ popupScreenshots: { compareWithDesktop(): Promise<Comparison> } }>({
  popupScreenshots: async ({ popupObserver, task }, use) => {
    const directory = resolve(process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!, "dropdown", task.name.split(":")[0]);
    await use({ compareWithDesktop: async () => {
      await popupObserver.capture();
      const diagnostic = JSON.parse(await readFile(resolve(directory, "popup-capture-diagnostic.json"), "utf8")) as {
        completed: boolean; owned: { window: string; pid: number }; before: Posture; after: Posture;
      };
      if (!diagnostic.completed) throw new Error("Incomplete screenshot bracket");
      const first = ownedPopup(diagnostic.before, diagnostic.owned), last = ownedPopup(diagnostic.after, diagnostic.owned);
      if (first.xid !== last.xid) throw new Error("Popup was replaced during screenshot bracket");
      const before = geometry(first.geometry), after = geometry(last.geometry);
      // A settling bottom edge is recorded; movement or width changes invalidate
      // the comparison. Only the common visible rectangle can be compared.
      if (before.x !== after.x || before.y !== after.y || before.width !== after.width) throw new Error("Popup moved during observation");
      const ownedGeometry = async (label: string) => {
        const info = await readFile(resolve(directory, `${label}-owned-window.txt`), "utf8");
        return geometry(Object.fromEntries(["Absolute upper-left X", "Absolute upper-left Y", "Width", "Height"].map(key => {
          const value = info.match(new RegExp(`${key}:\\s*(-?\\d+)`))?.[1];
          if (value === undefined) throw new Error(`Missing owned window ${key}`);
          return [key, value];
        })));
      };
      const owner = await ownedGeometry("before");
      if (JSON.stringify(owner) !== JSON.stringify(await ownedGeometry("after"))) throw new Error("App geometry changed during observation");
      const readImage = async (name: string) => PNG.sync.read(await readFile(resolve(directory, name)));
      const [desktop, appBefore, appAfter] = await Promise.all([readImage("root.png"), readImage("consumer-001.png"), readImage("consumer-002.png")]);
      const region = { x: Math.max(before.x, owner.x, 0), y: Math.max(before.y, owner.y, 0), right: Math.min(before.x + before.width, owner.x + owner.width, desktop.width), bottom: Math.min(before.y + Math.min(before.height, after.height), owner.y + owner.height, desktop.height) };
      const count = (region.right - region.x) * (region.bottom - region.y);
      if (count < 100) throw new Error("No meaningful popup region inside the app canvas");
      const canvasPreserved = [appBefore, appAfter].every(image => image.width === owner.width && image.height === owner.height);
      let dark = 0, light = 0;
      const mismatches = [0, 0];
      for (let y = region.y; y < region.bottom; y++) for (let x = region.x; x < region.right; x++) {
        const index = (y * desktop.width + x) * 4;
        const rgb = Array.from(desktop.data.subarray(index, index + 3));
        if (Math.max(...rgb) < 80) dark++;
        if (Math.min(...rgb) > 180) light++;
        for (const [slot, image] of [appBefore, appAfter].entries()) {
          const pixel = ((y - owner.y) * image.width + x - owner.x) * 4;
          if (!canvasPreserved || rgb.some((value, channel) => Math.abs(value - image.data[pixel + channel]!) > 8)) mismatches[slot]!++;
        }
      }
      const result = { desktopHasContent: dark >= 20 && light >= count * 0.2, canvasPreserved, beforeMatchesDesktop: mismatches[0]! / count <= 0.01, afterMatchesDesktop: mismatches[1]! / count <= 0.01 };
      await writeFile(resolve(directory, "popup-visible-comparison.json"), JSON.stringify({ result, region, owner, before, after, count, dark, light, mismatches, tolerance: { maximumChannelDifference: 8, maximumMismatchedFraction: 0.01 }, limitation: "Sequential captures, common popup rectangle only. This proves app pixels match the visible desktop; it does not score agent task completion or OCR labels." }, null, 2), { flag: "wx" });
      return result;
    } });
  },
});
