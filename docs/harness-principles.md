# Agent-friendly harness principles

Working rules learned from OpenSky, intended for any model/tool harness. Keep
these short; put implementation details and evidence in the
[friction ledger](harness-friction.md). Examples illustrate desirable contracts,
not promises that every operation is implemented in OpenSky.

1. Make the first successful step obvious. Use consistent names, arguments and defaults.

   Example: opening a supplied URL returns a bound tab and its initial state, with the available methods shown immediately.

2. Return useful evidence with completed work. Avoid calls that only retrieve a result already available.

   Example: a test command returns failed test names and relevant error output, so the agent can act without a separate “fetch logs” call.

3. Bind actions to explicit resources. Validate identity and arguments before side effects; do not rely on ambient focus or shared mutable state.

   Example: edit a file handle at an expected revision. If the file changed, reject the edit instead of applying it to stale text.

4. State the limits of every result. An accepted request is not a verified outcome; distinguish observed, inferred, partial, unsupported and unknown.

   Example: a search says “100 of 1,462 matching rows; ranked by relevance.” It does not imply that the first returned row appeared first in the source.

5. Compress repetition, not meaning. Preserve relationships, qualifiers and ordering; emit each result once.

   Example: keep each product's “Sponsored” label attached to its own result, even when the label repeats. Remove a duplicate screenshot emission, not those qualifiers.

6. Make failures actionable. Say what ran, what failed and what can safely happen next; never guess that retrying is harmless.

   Example: after a job-submission timeout, report “submission outcome unknown” and provide its request ID for status lookup. Do not automatically submit a second job.

7. Bound time, output and outstanding work. Cancellation must stop new work and settle work already accepted.

   Example: cancelling a build rejects queued commands and waits for the running child process to exit. If it cannot confirm exit, it reports incomplete cleanup.

8. Track ownership from creation through cleanup. Release only owned resources and verify the outcome.

   Example: an evaluation opens two tabs beside a user's existing tab. Cleanup closes the two recorded tab IDs and checks that the user's tab remains.

9. Make behavior inspectable. Record public calls, arguments, results, timing and costs without exposing secrets or private reasoning.

   Example: a timeline shows the search arguments, returned matches, duration and provider-reported usage. Authentication tokens are redacted; hidden reasoning is excluded.

10. Optimize the whole successful workflow. Test fresh users and unseen tasks; include setup, retries and cleanup, and measure efficiency only after correctness.

    Example: compare repository tasks from fresh checkouts, counting setup and recovery calls. A run that makes fewer calls but leaves failing tests is not an efficiency win.

Update a principle only when a finding generalizes beyond one task or tool.
Prefer fixing the interface over teaching the model another exception.
