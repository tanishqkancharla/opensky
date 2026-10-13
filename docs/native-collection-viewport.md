# Native collection viewport observations

Native Mac tables and outlines can contain loaded rows outside the viewport.
When the driver supplies coherent `AXVisibleRows` membership, OpenSky's default
observation retains visible rows, selected rows, and non-row controls such as the
editor. The collection annotation names visible, loaded and omitted row counts.
An offscreen selection is explicitly retained.

```js
const app = await cua.getApp("Notes");
await app.getAXState();
await app.getAXState({collectionScope: "all"});
```

`collectionScope: "all"` returns a fresh view of all loaded rows rather than a
routine diff. Loaded rows are not a claim that the entire app collection was
exhaustively discovered. Scroll the list for another viewport. Existing capture
budget, degradation and completeness reporting still apply.

The native Mac extension requires optional driver `native_collections` metadata
from [driver PR45](https://github.com/tanishqkancharla/cua/pull/45).
Older/unsupported, malformed, stale, queried, truncated and web-document evidence
keeps the full existing observation. Native row projection does not apply to
browser documents. Explicit collection scope is rejected for typed browser and
non-Mac observations.

The driver retains its full snapshot and exact tokens. The SDK omits offscreen
row subtrees and their published input mappings, preserving retained tokens,
selected state, non-row controls and the full editor body. Projection happens
after tree sanitization. The collected element count remains distinct from
intentional rendering omissions so they cannot trigger incomplete-walk recovery.

## Validation

The focused branch builds and passes90 observation/facade/projection tests.
Real Notes reads on driver85133444 show9 visible of112 loaded rows, full loaded
recovery, and the same9 visible rows restored. Observation text is9006 versus
66793 characters. Existing real TextEdit paste/rich-text/selection keepers pass,
including competing-copy preservation and exact clipboard/app/helper cleanup.

The separate campaign source also passed25 Mac GUI contracts and two fresh
serial Terra Notes pairs. That is separate evidence; this branch inherits the
existing observation/clipboard draft stack and still needs integration with the
parallel primary-button and Chrome fixes, canonical platform validation and
upstream review. No new resource score, Linux/native parity or release readiness
is claimed for this clean branch.
