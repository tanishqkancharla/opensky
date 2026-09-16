# Browser tabs and large-page context

## Lifecycle

```js
var tab = await cua.createBrowserTab("chrome", "https://example.com", {sessionName: "Task"});
var browser = await cua.getBrowser({id: "chrome"});
await browser.documentation();
await browser.nameSession("Task");
await browser.tabs.list();
var blank = await browser.tabs.new(); // no arguments; about:blank
var same = await browser.tabs.get(tab.id);
await blank.goto("https://example.com");
await blank.getAXState();
await blank.close();
```

`chrome` and `edge` are supported providers. `getBrowser({url})` retains affinity
with a live tab at that URL; otherwise it prefers installed Chrome, then Edge.
Selection alone does not navigate. `cua.getTab(id, {browser: browserId})` selects
and observes an exact tab; `getState()` and `listTabs()` refresh live provider
tabs as well as facade-owned tabs. An empty inventory means no discoverable tab
was returned under the current provider permissions; it does not prove the user
has no tabs in unsupported/undiscoverable browser instances.

Tabs created through OpenSky use isolated owned browser sessions. Tabs discovered
in existing Chrome/Edge windows are borrowed and cannot be closed through the
facade. Provider tab IDs stay stable across inventory refreshes for the life of
the discovery session. `browser.tabs.selected()` returns the uniquely active tab,
or the sole live tab when active state is unavailable; ambiguity returns
`undefined`. Embedded in-app browsers are unsupported. Optional host marks
require host-provided callbacks.

Navigation methods do not display their destination state automatically. Observe
with `getAXState()` afterward. If navigation reports an observation failure, it
may already have happened; inspect before repeating it.

Use current semantic indices for actions. Browser coordinate click, scroll and
drag require a fresh screenshot of that exact tab with verified image mapping;
AX-only state is insufficient. Browser input never falls through to native
window coordinates. Some editable fields expose typing without click; an
addressed `pressKey(key, index)` can focus a current type-capable field.

## Query, context, and continuation

`await tab.getAXState({query: "observed label"})` captures a fresh, narrowed
semantic view with current actionable indices. It is useful when the broad
outline mentions content whose action was omitted. Queries can include bounded
source-ordered neighborhoods; these are local groups, not page-wide order.

`await tab.getAXState({context: index})` reads surrounding content from the
**same stored snapshot**, using a current action or read-only content index.
A returned group index starts that group; an enclosing-group index moves outward.
Read-only anchors cannot receive input.

When the output supplies an earlier/later recipe, copy its exact token into
`await tab.getAXState({continuation: token})`. Tokens are single-use and bound to
the exact tab and snapshot. Repeating a group starts it again, not its next page.
Do not combine context or continuation with each other, query, or screenshots.
After input, observe fresh state before using context again.

Respect explicit omissions and frame boundaries. Stored context does not prove
that live content is unchanged. Materialized group coverage does not prove
virtualized content is complete; action-list order is not page order.
`disableDiffing: true` disables diffs, not capture/output limits. Older drivers
may omit neighborhoods/cursors or refuse explicit context; no cursor means
there is no demonstrated traversal route.

Close only the owned tabs created for the task and no longer needed. Direct SDK
users should also call `sdk.close()` in `finally` to clean up browser sessions.
