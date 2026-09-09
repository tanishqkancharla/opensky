import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { verifyDriverRuntime } from "../../evals/parity/driver-runtime.js";
import { verifyScoringProfile } from "../../evals/parity/scoring-profile.js";
import { recordEnvironment } from "../../evals/parity/fingerprint.js";
import { verifyNativeLinuxRepl } from "../../evals/parity/native-linux-repl.js";

if (process.platform !== "linux" || process.env.GITHUB_ACTIONS !== "true") throw new Error("Disposable Linux CI required");
const artifacts = process.env.OPENSKY_LINUX_OFFICE_ARTIFACT!;
const driver = process.env.OPENSKY_DRIVER_BINARY!;
const packageRoot = process.env.OPENSKY_NATIVE_PROBE_PACKAGE!;
// Paths observed in the official distribution's availability artifact.
const resources = resolve(packageRoot, "../../../../..");
const nativeConfig = join(artifacts, "native-repl-config.json");
const configuration = {
  command: join(resources, "cua_node/bin/node_repl"), args: [],
  env: {
    NODE_REPL_NODE_MODULE_DIRS: dirname(dirname(packageRoot)),
    NODE_REPL_NODE_PATH: join(resources, "cua_node/bin/node"),
    NODE_REPL_TRUSTED_CODE_PATHS: dirname(dirname(packageRoot)),
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({ sky: "@oai/sky/service" }),
    OAI_SKY_LINUX_BIN: process.env.OAI_SKY_LINUX_BIN!,
    DISPLAY: process.env.DISPLAY!,
    XAUTHORITY: process.env.XAUTHORITY!,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS!,
  },
};
await writeFile(nativeConfig, JSON.stringify(configuration, null, 2));
await verifyDriverRuntime({ binaryPath: driver, socket: process.env.OPENSKY_DRIVER_SOCKET,
  ownedLinuxPid: Number(process.env.OPENSKY_OWNED_DRIVER_PID), artifacts });
const scoringProfilePath = process.env.OPENSKY_EVAL_SCORING_PROFILE;
const scoringProfile = scoringProfilePath ? await verifyScoringProfile({
  python: process.env.OPENSKY_EVAL_PYTHON!, officeExecutable: "/usr/lib/libreoffice/program/soffice",
  profilePath: scoringProfilePath, expectedSha256: process.env.OPENSKY_EVAL_SCORING_PROFILE_SHA256,
}) : { name: "upstream-pinned-v1", sha256: null };
await recordEnvironment({ repo: process.cwd(), appPath: "/usr/lib/libreoffice", driver,
  vscodePath: process.env.OPENSKY_EVAL_VSCODE, scoringProfile,
  codex: join(resources, "codex"), python: process.env.OPENSKY_EVAL_PYTHON!, nativeConfig, artifacts });
await verifyNativeLinuxRepl(configuration, artifacts);
