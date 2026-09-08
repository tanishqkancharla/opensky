import AppKit
import CoreGraphics
import ApplicationServices

// Fixture lifecycle/independent observations only; unavailable to agents.
// Optional AX inspection never requests permission. Disposable-profile teardown
// may send SIGTERM after normal quit, always rechecking the launch receipt.
func emit(_ value: Any) {
    print(String(data: try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), encoding: .utf8)!)
}
func identity(_ app: NSRunningApplication) -> [String: Any]? {
    guard let bundle = app.bundleIdentifier, let launched = app.launchDate else { return nil }
    return ["pid": app.processIdentifier, "bundleId": bundle, "launchedAt": launched.timeIntervalSince1970]
}
let args = CommandLine.arguments
if args.count == 2 && args[1] == "desktop-state" {
    // This is a best-effort readiness guard, not an unlock mechanism. The
    // WindowServer lock key is not a documented API; retain its availability
    // separately instead of claiming that a missing key proves an unlock.
    let session = CGSessionCopyCurrentDictionary() as? [String: Any]
    let onConsole = session?[kCGSessionOnConsoleKey as String] as? Bool
    let loginDone = session?[kCGSessionLoginDoneKey as String] as? Bool
    let locked = session?["CGSSessionScreenIsLocked"] as? Bool
    let frontmost = NSWorkspace.shared.frontmostApplication?.bundleIdentifier
    let saverRunning = !NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.ScreenSaver.Engine").isEmpty
    var reasons: [String] = []
    if onConsole != true { reasons.append("session_not_on_console_or_unknown") }
    if loginDone != true { reasons.append("login_incomplete_or_unknown") }
    if locked == true { reasons.append("session_locked") }
    if saverRunning { reasons.append("screensaver_running") }
    if frontmost == "com.apple.loginwindow" { reasons.append("login_window_frontmost") }
    emit(["ready": reasons.isEmpty, "reasons": reasons,
          "onConsole": onConsole as Any? ?? NSNull(), "loginDone": loginDone as Any? ?? NSNull(),
          "locked": locked as Any? ?? NSNull(), "screensaverRunning": saverRunning,
          "frontmostBundleId": frontmost as Any? ?? NSNull()])
} else if args.count == 3 && args[1] == "list" {
    emit(NSRunningApplication.runningApplications(withBundleIdentifier: args[2]).compactMap(identity))
} else if args.count == 3 && ["inspect", "inspect-ax"].contains(args[1]), let pid = pid_t(args[2]), let app = NSRunningApplication(processIdentifier: pid) {
    var state = identity(app) ?? [:]
    state["finishedLaunching"] = app.isFinishedLaunching
    state["activationPolicy"] = app.activationPolicy.rawValue
    let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
    state["windows"] = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) }.map {
        ["title": $0[kCGWindowName as String] ?? "", "windowId": $0[kCGWindowNumber as String] ?? 0, "onScreen": $0[kCGWindowIsOnscreen as String] ?? false]
    }
    func read(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
        var value: CFTypeRef?
        return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
    }
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, 1)
    if args[1] == "inspect-ax", let focused = read(application, "AXFocusedWindow"), CFGetTypeID(focused) == AXUIElementGetTypeID() {
        let window = focused as! AXUIElement
        var lines: [String] = []
        func walk(_ element: AXUIElement, _ depth: Int) {
            guard depth < 8 && lines.count < 80 else { return }
            let attributes = ["AXRole", "AXTitle", "AXDescription", "AXValue"].compactMap { read(element, $0) as? String }
            lines.append(attributes.joined(separator: " | ").prefix(600).description)
            for child in read(element, "AXChildren") as? [AXUIElement] ?? [] { walk(child, depth + 1) }
        }
        walk(window, 0)
        state["focusedWindowAX"] = lines
    }
    emit(state)
} else if (4...6).contains(args.count) && args[1] == "launch" {
    guard NSRunningApplication.runningApplications(withBundleIdentifier: args[3]).isEmpty else {
        fputs("App already running; setup refused\n", stderr); exit(1)
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    configuration.arguments = args.count >= 5 ? (try! JSONSerialization.jsonObject(with: Data(args[4].utf8)) as! [String]) : ["-ApplePersistenceIgnoreState", "YES"]
    if args.count == 6 { configuration.environment = try! JSONSerialization.jsonObject(with: Data(args[5].utf8)) as! [String: String] }
    NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: args[2]), configuration: configuration) { app, error in
        guard let app = app, let receipt = identity(app) else {
            fputs("App launch failed: \(String(describing: error))\n", stderr); exit(1)
        }
        emit(receipt)
        exit(0)
    }
    RunLoop.current.run()
} else if args.count == 5 && ["quit", "stop-disposable"].contains(args[1]), let pid = pid_t(args[2]), let launched = Double(args[4]) {
    guard let app = NSRunningApplication(processIdentifier: pid) else { emit(["exited": true]); exit(0) }
    guard app.bundleIdentifier == args[3], app.launchDate?.timeIntervalSince1970 == launched else {
        emit(["exited": false, "error": "process_identity_changed"]); exit(1)
    }
    let accepted = args[1] == "quit" ? app.terminate() : (kill(pid, SIGTERM) == 0)
    let deadline = Date().addingTimeInterval(5)
    while !app.isTerminated && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    emit(["accepted": accepted, "exited": app.isTerminated])
    exit(app.isTerminated ? 0 : 1)
} else { fputs("Invalid lifecycle command\n", stderr); exit(2) }
