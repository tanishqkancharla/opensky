import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { verifyDriverRuntime } from "../../evals/parity/driver-runtime.js";
import { recordEnvironment } from "../../evals/parity/fingerprint.js";

if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Disposable Linux CI required");
const artifacts = process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!;
const driver = process.env.OPENSKY_DRIVER_BINARY!;
const packageRoot = process.env.OPENSKY_NATIVE_PROBE_PACKAGE!;
// Paths observed in the official distribution's availability artifact.
const resources = resolve(packageRoot, "../../../../..");
const nativeConfig = join(artifacts, "native-repl-config.json");
await writeFile(nativeConfig, JSON.stringify({
  command: join(resources, "cua_node/bin/node_repl"), args: [],
  env: {
    NODE_REPL_NODE_MODULE_DIRS: dirname(dirname(packageRoot)),
    OAI_SKY_LINUX_BIN: process.env.OAI_SKY_LINUX_BIN,
    DISPLAY: process.env.DISPLAY,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
  },
}, null, 2));
await verifyDriverRuntime({ binaryPath: driver, socket: process.env.OPENSKY_DRIVER_SOCKET,
  ownedLinuxPid: Number(process.env.OPENSKY_OWNED_DRIVER_PID), artifacts });
await recordEnvironment({ repo: process.cwd(), appPath: "/usr/lib/libreoffice", driver,
  codex: join(resources, "codex"), python: process.env.OPENSKY_EVAL_PYTHON!, nativeConfig, artifacts });
