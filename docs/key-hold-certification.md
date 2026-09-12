# X11 key-hold candidate: Linux certification

The exact driver source is57d1b03e046021dbdaca459602c5734170295693. It moves the existing hotkey hold interval after a server synchronization so key-down is no longer buffered through the wait. No app-specific behavior or new delay is added.

The release build and78focused Rust tests passed in CI34705788499. The unchanged public native/OpenSky program then passed in all three paired runs:34706423194,34706627917,34706628979. Each independently saved the full sentence and closed the format dialog. The OpenSky trace measured10-11ms key holds versus0ms before the correction. All owned process groups exited and keyboard maps were unchanged. This is bounded real-workflow acceptance, not full parity or statistical proof that all intermittent text loss is gone.

This worktree changes only the source pin of the previously exercised canonical Linux certification workflow. It runs unchanged shared/native/capture lanes and local installation checks. No case filters or expected results change. The emitted release binary must retain its own hash and identity; compare it with the focused binary867bbbcea46e8624681cca8fe8ae039cc5cc13007caea2cef48ccd7d8ce62ad3 before attributing evidence across builds.

Windows, macOS and Wayland behavior are outside this Linux X11 adapter correction and are not certified by this workflow. Frozen V5 benchmark outcomes remain unchanged.
