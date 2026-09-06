import { test } from "vitest";

// These are reported as TODO, never passing acceptance. Read scenarios.md for
// real fixture prerequisites, public action sequences and observable oracles.
// Do not fill these gaps with injected DriverClients or synthetic receipts.
test.todo("CLIP-N01: restores the user's text, HTML and image clipboard after native paste");
test.todo("CLIP-N02: preserves a concurrent clipboard change during native paste");
test.todo("PASTE-N02: preserves HTML emphasis in a native rich-text document");
test.todo("RANGE-N01: changes a native range control to the requested value");
test.todo("FOCUS-N01: selects and edits the exact document while a sibling has focus");
test.todo("TABS-B01: reads the requested existing tab among duplicate titles and URLs in two profiles");
test.todo("TABS-B02: identifies the actually selected tab after the user switches tabs");
test.todo("TABS-B03: releases a claimed user tab while closing the agent-created tab");
test.todo("FINDER-N01: opens the requested temporary folder and exposes its file");
test.todo("WEBKIT-N01: observes the exact requested Safari document independently of a sibling");
test.todo("CLOSE-N01: resolves a native save sheet and closes only its owned document");

// Negative/ambiguous-delivery supplements, separately named from positive work.
test.todo("IDENTITY-B01: refuses an old provider identity after its numeric tab ID is reused");
test.todo("ERROR-D01: exposes a real driver refusal reason through the public SDK error");
test.todo("DELIVERY-D01: recovers observation after transport loss without repeating delivered input");
