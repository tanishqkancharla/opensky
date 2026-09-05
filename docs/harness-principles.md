# Agent-friendly harness principles

Working rules learned from OpenSky, intended for any model/tool harness. Keep
these short; put implementation details and evidence in the
[friction ledger](harness-friction.md).

1. Make the first successful step obvious. Use consistent names, arguments and defaults.
2. Return useful evidence with completed work. Avoid calls that only retrieve a result already available.
3. Bind actions to explicit resources. Validate identity and arguments before side effects; do not rely on ambient focus or shared mutable state.
4. State the limits of every result. An accepted request is not a verified outcome; distinguish observed, inferred, partial, unsupported and unknown.
5. Compress repetition, not meaning. Preserve relationships, qualifiers and ordering; emit each result once.
6. Make failures actionable. Say what ran, what failed and what can safely happen next; never guess that retrying is harmless.
7. Bound time, output and outstanding work. Cancellation must stop new work and settle work already accepted.
8. Track ownership from creation through cleanup. Release only owned resources and verify the outcome.
9. Make behavior inspectable. Record public calls, arguments, results, timing and costs without exposing secrets or private reasoning.
10. Optimize the whole successful workflow. Test fresh users and unseen tasks; include setup, retries and cleanup, and measure efficiency only after correctness.

Update a principle only when a finding generalizes beyond one task or tool.
Prefer fixing the interface over teaching the model another exception.
