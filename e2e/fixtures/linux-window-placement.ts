import { expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);
export type WindowPlacement = { x: number; y: number; width: number; height: number };

// Ordinary window-manager setup, using the same restore request as the owned
// sibling-window fixture. This never uses the driver's geometry to validate it.
export async function placeOwnedWindow(
  owned: { pid: number; window: string }, placement: WindowPlacement, artifacts: string,
): Promise<void> {
  const id = owned.window;
  const assertOwner = async () => {
    expect(Number((await exec("xdotool", ["getwindowpid", id], { timeout: 5_000 })).stdout.trim())).toBe(owned.pid);
  };
  const geometry = async () => (await exec("xdotool", ["getwindowgeometry", "--shell", id], { timeout: 5_000 })).stdout;
  const state = async () => (await exec("xprop", ["-id", id, "_NET_WM_STATE"], { timeout: 5_000 })).stdout;
  await assertOwner();
  const before = await geometry();
  if ((await state()).includes("_NET_WM_STATE_MAXIMIZED")) {
    await exec(process.env.OPENSKY_EVAL_PYTHON ?? "python3", ["-c", `
import ctypes as C,sys
X=C.CDLL('libX11.so.6')
class Data(C.Union): _fields_=[('b',C.c_char*20),('s',C.c_short*10),('l',C.c_long*5)]
class Message(C.Structure): _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),('display',C.c_void_p),('window',C.c_ulong),('message_type',C.c_ulong),('format',C.c_int),('data',Data)]
class Event(C.Union): _fields_=[('message',Message),('pad',C.c_long*24)]
X.XOpenDisplay.argtypes=[C.c_char_p];X.XOpenDisplay.restype=C.c_void_p
X.XDefaultRootWindow.argtypes=[C.c_void_p];X.XDefaultRootWindow.restype=C.c_ulong
X.XInternAtom.argtypes=[C.c_void_p,C.c_char_p,C.c_int];X.XInternAtom.restype=C.c_ulong
X.XSendEvent.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.c_long,C.POINTER(Event)]
X.XSync.argtypes=[C.c_void_p,C.c_int];X.XCloseDisplay.argtypes=[C.c_void_p]
d=X.XOpenDisplay(None)
if not d: raise RuntimeError('No isolated X display')
try:
 e=Event();e.message.type=33;e.message.send_event=1;e.message.display=d;e.message.window=int(sys.argv[1]);e.message.format=32
 e.message.message_type=X.XInternAtom(d,b'_NET_WM_STATE',0)
 e.message.data.l[:]=[0,X.XInternAtom(d,b'_NET_WM_STATE_MAXIMIZED_HORZ',0),X.XInternAtom(d,b'_NET_WM_STATE_MAXIMIZED_VERT',0),1,0]
 if not X.XSendEvent(d,X.XDefaultRootWindow(d),0,(1<<20)|(1<<19),C.byref(e)): raise RuntimeError('Window manager rejected restore request')
 X.XSync(d,0)
finally: X.XCloseDisplay(d)
`, id], { timeout: 5_000 });
    await expect.poll(state, { timeout: 5_000 }).not.toContain("_NET_WM_STATE_MAXIMIZED");
  }
  await assertOwner();
  await exec("xdotool", ["windowsize", "--sync", id, String(placement.width), String(placement.height)], { timeout: 5_000 });
  await exec("xdotool", ["windowmove", "--sync", id, String(placement.x), String(placement.y)], { timeout: 5_000 });
  const after = await geometry();
  const finalState = await state();
  await writeFile(join(artifacts, "window-layout.json"), JSON.stringify({ pid: owned.pid, window: id, requested: placement, before, after, finalState }, null, 2));
  await assertOwner();
  expect(after).not.toBe(before);
  expect(finalState).not.toContain("_NET_WM_STATE_MAXIMIZED");
  // Decorations can shift the client relative to the requested outer frame.
  // Require a displaced client and exact size without assuming that inset.
  expect(Number(after.match(/^X=(-?\d+)$/m)?.[1])).toBeGreaterThan(0);
  expect(Number(after.match(/^Y=(-?\d+)$/m)?.[1])).toBeGreaterThan(0);
  expect(Number(after.match(/^WIDTH=(\d+)$/m)?.[1])).toBe(placement.width);
  expect(Number(after.match(/^HEIGHT=(\d+)$/m)?.[1])).toBe(placement.height);
}
