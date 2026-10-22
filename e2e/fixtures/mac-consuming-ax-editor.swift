import AppKit

final class ConsumingEditor: NSTextView {
    let output = URL(fileURLWithPath: ProcessInfo.processInfo.environment["OPENSKY_CONSUMING_AX_OUTPUT"]!)
    var received = ""
    var events: [[String: Any]] = []
    func report(_ kind: String) {
        window?.title = "OpenSky native received: " + received
        let value: [String: Any] = ["backend": "native-AppKit", "kind": kind, "received": received, "events": events, "value": string, "focused": window?.firstResponder === self]
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) { try? data.write(to: output, options: .atomic) }
    }
    override func setAccessibilitySelectedText(_ text: String?) {
        guard let text = text, !text.isEmpty else { return }
        received += text
        events.append(["data": text, "source": "AXSelectedText"])
        string = ""
        report("AXSelectedText")
    }
    override func keyDown(with event: NSEvent) {
        let text = event.characters ?? ""
        received += text
        events.append(["data": text, "source": "keyDown"])
        super.keyDown(with: event)
        string = ""
        report("keyDown")
    }
}
final class Fixture: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var editor: ConsumingEditor!
    func applicationDidFinishLaunching(_ notification: Notification) {
        editor = ConsumingEditor(frame: NSRect(x:0,y:0,width:640,height:420))
        editor.isRichText = false
        editor.isEditable = true
        editor.setAccessibilityLabel("Receipt input")
        window = NSWindow(contentRect: editor.frame, styleMask: [.titled,.closable], backing: .buffered, defer: false)
        window.title = "OpenSky owned consuming native input"
        window.isRestorable = false
        window.contentView = editor
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps:true)
        window.makeFirstResponder(editor)
        editor.report("ready")
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let fixture = Fixture()
let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.delegate = fixture
app.run()
