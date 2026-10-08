# Agent-friendly harness principles

Working rules learned from OpenSky, intended for any model/tool harness. Keep
these short; put implementation details and evidence in the
[friction ledger](harness-friction.md). Examples are pseudocode illustrating
desirable contracts, not executable OpenSky APIs.

1. Make the first successful step obvious. Use consistent names, arguments and defaults.

   ```text
   open_url(url) -> {
       tab: exact_tab_handle,
       state: initial_page_state,
       methods: [click, type, observe, close]
   }
   ```

2. Return useful evidence with completed work. Include the context needed to interpret it, not just a pointer or warning that context is missing.

   Preserve the identity and route of the original request and result when diagnosing a failure. Repeating an observation can change the state you need to explain.

   ```text
   result = run_tests()
   if result.failed:
       fix(result.failed_tests, result.relevant_errors)
       # No separate fetch_logs() needed.
   ```

   ```text
   search(query) -> {
       matches: [group(label, ordered_rows, nearby_qualifiers)],
       coverage: PARTIAL,
       more: exact_revision_bound_cursor
   }
   # A match should arrive with its meaning, and a usable path to what is omitted.
   ```

3. Bind actions to explicit resources. Validate identity and arguments before side effects; do not rely on ambient focus or shared mutable state.

   ```text
   file = open_file(path)
   edit(file.handle, expected_revision=file.revision, patch)
   # Revision mismatch -> STALE_RESOURCE; no write occurred.
   ```

4. State the limits of every result. An accepted request is not a verified outcome; distinguish observed, inferred, partial, unsupported and unknown.

   ```text
   search(query) -> {
       rows: [...], returned: 100, matched: 1462,
       ordering: RELEVANCE, coverage: PARTIAL
   }
   # rows[0] is not necessarily the first row in source order.
   ```

   ```text
   expand(cursor) -> more_of(cursor.revision)
   refresh(resource) -> new_observation(resource)
   # Complete traversal of an old revision cannot reveal newly available data.
   # Freshness and coverage are separate properties.
   ```

5. Compress repetition, not meaning. Preserve relationships, qualifiers and ordering; emit each result once.

   ```text
   emit_once(observation.screenshot)
   for product in observation.products_in_source_order:
       emit(product.title, product.sponsored)
       # Keep each qualifier, even when its value repeats.
   ```

   ```text
   evidence = omit_empty_wrappers(source, preserve_relationships=true)
   emit(evidence, counts={source: size(source), projected: size(evidence)})
   # A compressed view's completeness must name what was compressed.
   # Names, values, states, actions and qualifiers are not empty wrappers.
   ```

   ```text
   match = search(snapshot, query)
   context = expand(snapshot, match.ref)
   emit(context.rows_in_source_order, context.omitted_boundaries)
   assert context.revision == snapshot.revision
   # Expand stored evidence without fetching a different revision.
   if context.has_more:
       emit(context.next_cursor)
       # A bounded result should offer a path onward, not hidden IDs to guess.
   ```

   ```text
   page = render_with_budget(stored_rows)
   next_cursor = cursor_after(page.last_visible_row)
   emit(page, next_cursor)  # Reserve space for the cursor separately.
   # Advancing past collected-but-unshown rows would silently lose evidence.
   ```

6. Make failures actionable. Say what ran, what failed and what can safely happen next; never guess that retrying is harmless.

   ```text
   result = submit_job(job, request_id)
   if result == OUTCOME_UNKNOWN:
       status = get_job_status(request_id)
       # Reconcile this request; do not submit another job blindly.
   ```

7. Bound time, output and outstanding work. Cancellation must stop new work and settle work already accepted.

   ```text
   cancel(build):
       stop_admitting_work(build)
       reject_queued_work(build)
       exit = stop_and_wait(build.process, deadline)
       return CLEAN if exit.confirmed else CLEANUP_UNPROVEN
   ```

8. Track ownership from creation through cleanup. Release only owned resources and verify the outcome.

   ```text
   protected = browser.list_tabs()
   owned = [browser.new_tab(), browser.new_tab()]
   for tab in owned: browser.close(tab.id)
   after = browser.list_tabs()
   verify(all_absent(owned, after) and all_present(protected, after))
   ```

9. Make behavior inspectable. Record public calls, arguments, results, timing and costs without exposing secrets or private reasoning.

   ```text
   timeline.append(redact_secrets({
       tool: "search", args: query, result: matches,
       duration_ms: elapsed, usage: provider_reported_usage
   }))
   # Record public events only; omit hidden reasoning.
   ```

10. Optimize the whole successful workflow. Test fresh users and unseen tasks; include setup, retries and cleanup, and measure efficiency only after correctness.

    ```text
    for task in held_out_tasks:
        run = evaluate(task, fresh_checkout=true)
        if run.correct and run.grounded and run.policy_ok and run.cleanup_verified:
            score_efficiency(run.all_calls, run.provider_usage)
            # Include setup, retries, and cleanup.
            baseline = recorded_baseline(task)
            if baseline and baseline.passed and same_required_work(baseline.protocol, run.protocol):
                compare_successful_workflows(baseline, run)
            elif baseline:
                report_raw_metrics_with_protocol_differences(baseline, run)
                # A newly required verification call is not a harness regression.
        else:
            record_failure(run)  # Fewer calls cannot turn failure into a win.
    ```

11. Test the driver's experience through the real service boundary. Use the same public actions available to human, agent, and code drivers, and verify their observable outcomes. Practical environment configuration is acceptable when explicit; it must not manufacture behavior. An event receipt or internal callback count is not a substitute for the intended result.

Update a principle only when a finding generalizes beyond one task or tool.
Prefer fixing the interface over teaching the model another exception.


## Application-neutral interaction

The shipped runtime, model-facing tool descriptions and skill describe generic
interaction capabilities. They must not contain named-app workarounds, task
recipes, benchmark-specific solving hints or app-name branches that alter input
behavior. OS, accessibility-toolkit and browser-protocol adapters implement
those general capabilities. Task names, initial app/document state and outcome
oracles belong to evaluation fixtures; solving recipes from those fixtures must
not enter the evaluated model's context. Ship a readable skill with the package
and keep its capability descriptions aligned with the public API.

Upgrades must verify behavioral contracts of local adaptations, including optional observation metadata. Bind named regression evidence to the exact executable; a successful build or unrelated smoke test does not establish those contracts.

- Missing lifecycle metadata must not turn unknown cleanup into success. Retain exact creation evidence, close only proven objects, and block the next run on unexplained residue.

- Preserve established dispatch priority when adding a new target kind. Reuse explicit fixture recipes so setup and focus do not vary silently between regression runs.

- Preserve the first failure and teardown failures separately. Cleanup must still try every independently safe step; uncertainty blocks the next run while original diagnostic evidence remains inspectable.


Test one causal factor at a time against a retained counterexample. Stop at the first failed regression, discard ineffective runtime changes, and reserve expensive end-to-end comparisons for candidates that pass their focused checks. Preserve the exact prior executable to make rollback and counterfactuals cheap.


A missing operation in an enumeration is not always proof that the standard operation is unsupported. Use live comparative evidence, preserve exact authority for the user-requested operation, and observe its effects without replaying an uncertain dispatch.

- Keep compact action lineage and decisive observed values beside bounded reviews. Mark missing evidence explicitly; dispatch receipts do not certify an effect. Diagnosis logging should not add agent-visible context or waits between inputs.


Retain structured uncertainty and exact dispatch lineage at the original failure boundary. A promising reduced control is a hypothesis until the existing counterexample passes; keep unrelated unavailable facilities explicit instead of hiding the action evidence.

- Verify downstream actions after a successful dispatch acknowledgment: an earlier action can leave latent collateral state. Change one preparatory factor before broadening delivery policies.
- Give observable task fixtures the same ownership, isolation and teardown lifecycle as the arm; retain observations separately from completion review.

- Carry exact launch ownership into teardown; a missing application inventory entry must neither lose proved ownership nor authorize guessed cleanup. Retain original failures when later teardown is verified.

- Capture decisive state before teardown changes it. Freeze the original failure boundary so recovery actions cannot obscure the failed action or replace its primary error.

- Shorten feedback at the failing boundary. During implementation select the affected existing outcome checks, reuse only independently verified immutable artifacts, and collect failure evidence before teardown. Broaden verification after focused checks pass; keep complete release gates and historical failures.

- Derive compact failure summaries from retained, source-checked artifacts. Keep missing evidence explicit, and cache completed observations so reviewing a failure does not trigger more execution.
