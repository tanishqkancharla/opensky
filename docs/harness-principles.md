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

5. Compress repetition, not meaning. Preserve relationships, qualifiers and ordering; emit each result once.

   ```text
   emit_once(observation.screenshot)
   for product in observation.products_in_source_order:
       emit(product.title, product.sponsored)
       # Keep each qualifier, even when its value repeats.
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

Update a principle only when a finding generalizes beyond one task or tool.
Prefer fixing the interface over teaching the model another exception.
