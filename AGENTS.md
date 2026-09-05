# Harness maintenance

When harness work reveals friction or changes behavior:

- Update `docs/harness-friction.md` with the symptom, cause/layer, fix or pending
  action, evidence, validation status and any regression or tradeoff. Preserve
  stable entry IDs and distinguish implemented fixes from proposals/workarounds.
- Update `docs/harness-principles.md` only for a broadly reusable lesson. Keep
  principles concise, simple and applicable beyond computer use; keep concrete
  implementation details in the friction ledger.
- Do not promote unit/contract fixtures, historical re-rendering, matching final
  answers or ordinary CI validation into new real-driver acceptance evidence.
  Keep unresolved limitations and incomplete validation visible.

These documents are living records, not instructions to run GUI evaluations or
change permissions when the user's current request does not authorize that.
