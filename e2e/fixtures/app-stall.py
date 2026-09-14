#!/usr/bin/env python3
"""One-shot X11 delivery/app-processing stall observer for TYPE-L03."""
import json, os, signal, sys, threading, time
from Xlib import X, display
from Xlib.ext import record
from Xlib.protocol import rq

E_ACUTE = 0x00E9
PAUSE_NS = 650_000_000

def emit(kind, **fields):
    print(json.dumps({"kind": kind, "unixNs": time.time_ns(), **fields}), flush=True)

def proc_start_time(pid):
    with open("/proc/%d/stat" % pid, encoding="utf-8") as source:
        fields = source.read().rsplit(") ", 1)[1].split()
    return int(fields[19])

def proc_state(pid):
    with open("/proc/%d/stat" % pid, encoding="utf-8") as source:
        return source.read().rsplit(") ", 1)[1].split()[0]

def wait_for_state(pid, wanted, timeout_ns=200_000_000):
    deadline, last = time.monotonic_ns() + timeout_ns, None
    while time.monotonic_ns() < deadline:
        try: last = proc_state(pid)
        except FileNotFoundError: return None
        if last in wanted: return last
        time.sleep(0.005)
    return last

def wait_for_not_state(pid, unwanted, timeout_ns=200_000_000):
    deadline, last = time.monotonic_ns() + timeout_ns, None
    while time.monotonic_ns() < deadline:
        try: last = proc_state(pid)
        except FileNotFoundError: return None
        if last not in unwanted: return last
        time.sleep(0.005)
    return last

class TargetControl:
    def __init__(self, pid):
        if pid <= 0: raise ValueError("target PID must be positive")
        if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
            raise RuntimeError("this diagnostic requires Python pidfd_open and pidfd_send_signal")
        self.pid, self.start_time = pid, proc_start_time(pid)
        self.pidfd, self.lock, self.stopped_at, self.triggered = os.pidfd_open(pid, 0), threading.Lock(), None, False
        emit("target-ready", pid=pid, startTime=self.start_time)

    def same_target(self):
        try: return proc_start_time(self.pid) == self.start_time
        except FileNotFoundError: return False

    def stop_once(self):
        with self.lock:
            if self.triggered: return False
            if not self.same_target(): raise RuntimeError("refusing to control PID whose start time changed")
            signal.pidfd_send_signal(self.pidfd, signal.SIGSTOP)
            self.triggered, self.stopped_at = True, time.monotonic_ns()
            threading.Thread(target=self._watchdog, daemon=True).start()
            state = wait_for_state(self.pid, {"T", "t"})
            actual = state in {"T", "t"}
            emit("stop", pid=self.pid, startTime=self.start_time, pauseNs=PAUSE_NS, actualStopped=actual, processState=state)
            if not actual: raise RuntimeError("SIGSTOP was not observed as a stopped target process")
            return True

    def _watchdog(self):
        time.sleep(PAUSE_NS / 1_000_000_000)
        self.resume("watchdog")

    def resume(self, reason):
        with self.lock:
            if self.stopped_at is None: return False
            started, self.stopped_at = self.stopped_at, None
            try:
                signal.pidfd_send_signal(self.pidfd, signal.SIGCONT); error = None
            except ProcessLookupError: error = "target-exited-before-resume"
            state = None if error else wait_for_not_state(self.pid, {"T", "t"})
            observed = error is None and state not in {"T", "t"}
            if error is None and not observed: error = "target-remained-stopped-after-sigcont"
            emit("resume", pid=self.pid, startTime=self.start_time, reason=reason,
                 actualDurationNs=time.monotonic_ns()-started, error=error,
                 resumedObserved=observed, processState=state)
            return True

    def close(self):
        self.resume("observer-finally")
        os.close(self.pidfd)

def resume_if_same(pid, expected):
    if pid <= 0 or expected <= 0: raise ValueError("PID and expected start time must be positive")
    before = proc_start_time(pid)
    if before != expected:
        emit("emergency-resume", pid=pid, expectedStartTime=expected, beforeStartTime=before, resumed=False, reason="start-time-mismatch-before-pidfd")
        return 2
    pidfd = os.pidfd_open(pid, 0)
    try:
        after_open = proc_start_time(pid)
        if after_open != expected:
            emit("emergency-resume", pid=pid, expectedStartTime=expected, beforeStartTime=before, afterOpenStartTime=after_open, resumed=False, reason="start-time-mismatch-after-pidfd")
            return 2
        signal.pidfd_send_signal(pidfd, signal.SIGCONT)
        state, after = wait_for_not_state(pid, {"T", "t"}), proc_start_time(pid)
        resumed = after == expected and state not in {"T", "t"}
        emit("emergency-resume", pid=pid, expectedStartTime=expected, beforeStartTime=before,
             afterOpenStartTime=after_open, afterStartTime=after, processState=state, resumed=resumed)
        return 0 if resumed else 2
    finally: os.close(pidfd)

def record_range(**selected):
    value = {"core_requests": (0, 0), "core_replies": (0, 0), "ext_requests": (0, 0, 0, 0), "ext_replies": (0, 0, 0, 0), "delivered_events": (0, 0), "device_events": (0, 0), "errors": (0, 0), "client_started": False, "client_died": False}
    value.update(selected); return value

def main():
    if os.environ.get("OPENSKY_DISPOSABLE_DESKTOP") != "1":
        raise RuntimeError("app-stall control is permitted only in a disposable desktop")
    if len(sys.argv) == 4 and sys.argv[1] == "--resume-if-same":
        raise SystemExit(resume_if_same(int(sys.argv[2]), int(sys.argv[3])))
    if len(sys.argv) != 2: raise SystemExit("usage: app-stall.py WRITER_PID")
    target = TargetControl(int(sys.argv[1]))
    def on_term(_signum, _frame): target.resume("sigterm"); raise SystemExit(143)
    signal.signal(signal.SIGTERM, on_term)
    control, data = display.Display(), display.Display()
    if not data.has_extension("RECORD"): raise RuntimeError("the test display has no X11 RECORD extension")
    context = control.record_create_context(0, [record.AllClients], [record_range(device_events=(X.KeyPress, X.KeyRelease)), record_range(core_requests=(100, 100))])
    control.sync(); mapped_codes = set()
    def mappings(pending, reply):
        while pending:
            if len(pending) < 8: emit("decode-error", source="client", reason="short-mapping-header", bytes=len(pending)); return
            count, length = pending[1], int.from_bytes(pending[2:4], sys.byteorder)*4
            if pending[0] != 100 or length < 8 or length > len(pending): emit("decode-error", source="client", reason="invalid-mapping-length", bytes=len(pending)); return
            request, pending = pending[:length], pending[length:]
            first, per = request[4], request[5]
            symbols = [int.from_bytes(request[i:i+4], sys.byteorder) for i in range(8, length, 4)]
            if not count or not per or len(symbols) != count*per: emit("decode-error", source="client", reason="invalid-mapping-symbols"); continue
            affected = set(range(first, first+count)); mapped_codes.difference_update(affected)
            codes = {first+i//per for i, symbol in enumerate(symbols) if symbol == E_ACUTE}
            if codes: mapped_codes.update(codes); emit("e-acute-mapped", keycodes=sorted(codes), firstKeycode=first, keycodeCount=count, keysymsPerKeycode=per, recordedSequenceNumber=reply.recorded_sequence_number)
    def receive(reply):
        if reply.category == record.StartOfData: emit("ready", pid=target.pid, startTime=target.start_time); return
        if reply.category not in (record.FromServer, record.FromClient): return
        if reply.client_swapped: raise RuntimeError("cannot safely decode opposite-endian RECORD traffic")
        if reply.category == record.FromClient: mappings(reply.data, reply); return
        pending = reply.data
        while pending:
            event, pending = rq.EventField(None).parse_binary_value(pending, data.display, None, None)
            if event.type not in (X.KeyPress, X.KeyRelease): continue
            emit("key-event", type=event.type, keycode=event.detail, serverTime=event.time, recordedSequenceNumber=reply.recorded_sequence_number)
            if event.type == X.KeyPress and event.detail in mapped_codes and not target.triggered:
                emit("trigger", keycode=event.detail, keysym="U+00E9", recordedSequenceNumber=reply.recorded_sequence_number)
                try: target.stop_once()
                except Exception as error: emit("control-error", error=str(error)); raise
    def stop_on_eof(): sys.stdin.buffer.read(); control.record_disable_context(context); control.flush()
    threading.Thread(target=stop_on_eof, daemon=True).start()
    try: data.record_enable_context(context, receive); emit("stopped")
    finally:
        target.close(); control.record_free_context(context); control.sync(); data.close(); control.close()

if __name__ == "__main__": main()
