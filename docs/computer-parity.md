# Computer observations and TypeScript changes

Observed on 2026-09-06 UTC (2026-09-05 Pacific) through the live Computer
`cua_repl` tool. This pass changes TypeScript and documentation only. It builds
on local OpenSky commit `0449448ef1a20d6987dca1f88cdaab16c2de7b3a`, including
the existing parity work, rather than the older GitHub `main`.

## Reference observations

| Call | Live Computer result | OpenSky correction |
| --- | --- | --- |
| `cua.createBrowserTab("chrome", undefined, {sessionName:"🧪 OpenSky parity"})` | A bound tab, title/URL `about:blank`, initial AX state automatically displayed. The test tab was closed afterward. | An omitted URL opens `about:blank`; the JSON bridge preserves omission. Explicit invalid URLs still fail. |
| First `cua.getBrowser({id:"chrome"})`, then the same selection again | Provider documentation on the first selection; no repeated output on the second. | Documentation is emitted once per provider per facade. Explicit `browser.documentation()` remains available. |
| `await cua.listBrowsers({emit:false})` | No output. | The CUA evaluator no longer prints an observation's implicit expression result. |
| `40 + 2` | No output. | CUA evaluator results are diagnostic data, not public output. The general-purpose CLI's expression-result behavior is unchanged. |
| `nodeRepl.write({probe:"output",number:2}); nodeRepl.write(undefined); nodeRepl.write("after")` | The object, `undefined`, and `after`, in order. | Explicit `nodeRepl.write` support, including values and undefined, through the strict VM membrane. |

Computer's returned API also documents PNG/JPEG/WebP output through
`nodeRepl.emitImage`, provider settings applied before opening with omitted
settings retained, and fresh observations after actions. Those are documented
contracts, not additional live action probes in this pass.

## Additional TypeScript fixes

- `sessionName` supplied to `createBrowserTab` is retained for later creations
  on that provider. Unsupported options are rejected before changing settings.
- `getAXState` after navigation reads the target again instead of returning a
  cached navigation snapshot. Its first ordinary observation is full, since the
  internally captured navigation state was never displayed. Ambiguous navigation
  failure also requires a full read. An overlapping old read cannot clear a newer
  navigation's requirement or overwrite its tab metadata.
- The CUA evaluator provides `nodeRepl.emitImage` for byte views, data URLs, and
  `{bytes, mimeType}`; byte offsets and PNG/JPEG/WebP MIME types are preserved.
  Explicit requests, including identical repeated images, are attached. Silent
  calls remain silent. Output emitted before a later error is retained.
- Output helpers exchange serialized data across the VM membrane and expose no
  filesystem, network, host functions, or host Promises. A host can also import
  `createNodeReplOutput` or `installNodeReplOutput` for its own integration.

The CUA evaluator's output behavior is intentionally different from the ordinary
`opensky eval` CLI: use `nodeRepl.write` / `emitImage` in CUA cells; the CLI still
prints expression values and console logs. Existing CUA cells that relied on
`return value` for public output should switch to `nodeRepl.write(value)`.

## Validation and limits

The TypeScript build and **332/332 deterministic tests** pass, validating the facade, serialization,
fresh-read and failure paths. These tests use fake driver responses; they do not
prove native input, screenshot capture, or model-task acceptance. No driver was
installed, started, rebuilt, or modified. The initial sandboxed suite hit a
loopback-listen restriction in the existing persistent-REPL test; the rerun uses
loopback access.

Returning fresh state costs an additional read after navigation. This is a
correctness fix, not a measured latency improvement. Image tests validate format
identification/serialization, not a full decoder. File/remote image URLs still
need a host asset resolver. Object output uses Node inspection after safe JSON
serialization in the strict evaluator; non-JSON objects such as Maps and cyclic
graphs are not claimed to match Computer's inspector exactly.

Full Computer parity is not claimed. Deferred native/backend work and separate
host integration requirements are in [driver-followups.md](driver-followups.md).
