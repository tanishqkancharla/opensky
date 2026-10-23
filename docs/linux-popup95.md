# Owned native popup keyboard input on TigerVNC

This is additional real application coverage of released OpenSky 0.2.44 / driver 0.38.0, not a runtime fix or comparative benchmark.

## Exact scope

- SDK consumer: `e4ec8490582758c6eea600eba03f7379dda035a7`.
- Driver: `13505413d11c40cc91092df5c0bcb7e2cfc3e289`.
- Reused released Linux ELF SHA256: `9ca4de5bce6f381aba2800e8a7b469d4d3ba3b8808cb59c6b5582faf07caac8b`; original binary build SDK `6443595604624c73cb5b395a8e89fda0f9db5aca`.
- Debian Bookworm, Node22, TigerVNC X11 `DISPLAY=:1`, XFWM4, GTK4 4.8.3, shared D-Bus/AT-SPI; ordinary uid1001. No uinput or device-hotplug dependency.
- [Passing application run](https://github.com/tanishqkancharla/opensky/actions/runs/40014806980). Exact receipts and screenshot hashes: [JSON](linux-popup95.json); raw evidence in its `linux-driver-release-consumer` artifact.

## Actual calls and effects

After the original One/Dot/Two effects, a fresh AX observation supplies the unique `Open owned popup` index; `app.click(index, {deliveryMode: 'foreground'})` retains the observed token and exact PID/window. The independent GTK process records the popup visible and mapped.

```js
await client.call('press_key', {pid, window_id: windowId,
  key: 'Escape', delivery_mode: 'background'});
// Rejects: code = background_unavailable. Popup stays open; zero activations.

await app.pressKey('Escape'); // Native facade explicitly dispatches foreground.
// Independent app state: popup invisible/unmapped; zero activations.
await app.pressKey('Tab');    // Verify actual entry focus before typing.

await client.call('type_text', {pid, window_id: windowId,
  text: 'Popup ASCII café Ελληνικά 日本語 🙂', delivery_mode: 'foreground'});
// Exactly one typing request. Focused field and app-written typed.txt match.
```

These are the runnable fixture calls, after acquiring the exact owned app handle and grants in `e2e/halo/gtk4-contract.mjs`; IDs are observed at runtime. The Unicode text is exactly 49 UTF8 bytes, SHA256 `0ab6d45bbb5de12f6e4fc316b6395204e5496a907fd955f8b8d21b481de46f24`. Screenshots visibly show the popup open, closed, then text in the focused field. The fixture writes independent application state/UTF8 receipts; this is not a general editor Save contract. No click/key/input is replayed.

The current archive's existing timeout/drain owner also passes: 52 Unicode codepoints visible at the 500ms deadline become 1,000 saved; queued cancellation dispatches nothing and the following Save starts after completion. Exact ASCII/Unicode selected replacement paste, truthful partial effects, strict binding and process-rebind owners pass independently. 724 Linux unit and 275 embedded SDK owners pass.

## Reproduce and grants

From this repository, dispatch the source-pinned `linux-driver-release.yml` with `reuse_archive=true`, `gtk4_probe=true`, `popup_probe=true`. The workflow first verifies approved archive bytes and runs existing native owners, then the original GTK4 owner and the optional popup owner. Node22 and Bookworm GTK4/Python GI, AT-SPI/D-Bus, TigerVNC and XFWM4 packages come from the committed workflow.

`e2e/halo/gtk4-session.sh` generates a ten-minute bounded grant: display read, only the exact owned application PID/window, screenshot writes only within the owned nonrecursive shots directory; tools `start_session`, `end_session`, `list_apps`, `list_windows`, `get_window_state`, `bring_to_front`, `click`, `press_key`, `type_text`. It starts an owned daemon and explicitly approves that bounded manifest. The SDK detaches its own session; the supervisor then stops/reaps daemon, fixture, window manager and VNC. All four exit without forced kills. SDK close alone does not stop a shared desktop/driver.

## Remaining failure

[Original run](https://github.com/tanishqkancharla/opensky/actions/runs/40014360466) retained an unsuccessful entry ref click: the visible field was reported off-screen, AT-SPI `activate` returned `effect: unverifiable`, and actual entry focus stayed false. No typing followed. Four unforced cleanup receipts remain. Raw toolkit extents are still needed to isolate the responsible transform. Track [issue #76](https://github.com/tanishqkancharla/opensky/issues/76). The successful Tab control does not establish pointer bounds or entry ref-click support.

No MPX/Xorg hotplug acceptance, privileged container/device permission, browser sandbox bypass, sandboxed Bookworm Chrome acceptance, Mac issue closure, performance improvement or new scored task is claimed. Supported release remains 0.2.44.
