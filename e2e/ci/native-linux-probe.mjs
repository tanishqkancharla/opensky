import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read-only public native API probe on the runner's disposable X11 desktop.
const root = process.env.OPENSKY_NATIVE_PROBE_PACKAGE;
const artifacts = process.env.OPENSKY_NATIVE_PROBE_ARTIFACT;
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const { sky } = await import(pathToFileURL(join(root, metadata.main)).href);
if (sky.target !== 'linux') throw new Error(`Unexpected native target: ${sky.target}`);
const screenshots = await sky.get_screenshot();
if (!screenshots.length || !screenshots[0].bytes?.length) throw new Error('Native Linux capture returned no image');
await writeFile(join(artifacts, 'native-desktop.jpg'), screenshots[0].bytes);
await writeFile(join(artifacts, 'capture.json'), JSON.stringify({
  version: metadata.version, target: sky.target, screenshotCount: screenshots.length,
  capturePassed: true, nativeComparisonReady: false,
  pending: 'Input, app reset and outcome grading still require real acceptance before matched agent runs.',
}, null, 2));
