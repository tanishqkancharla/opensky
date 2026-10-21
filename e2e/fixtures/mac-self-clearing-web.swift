import AppKit
import WebKit

final class Fixture: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let output = URL(fileURLWithPath: ProcessInfo.processInfo.environment["OPENSKY_SELF_CLEARING_WEB_OUTPUT"]!)
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let data = try? JSONSerialization.data(withJSONObject: message.body, options: [.sortedKeys]) else { return }
        try? data.write(to: output, options: .atomic)
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "receipt")
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 640, height: 420), configuration: config)
        web.navigationDelegate = self
        window = NSWindow(contentRect: web.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "OpenSky owned self-clearing input 87"
        window.isRestorable = false
        window.contentView = web
        window.center()
        web.loadHTMLString("""
        <!doctype html><meta charset="utf-8"><style>body{font:22px sans-serif;padding:30px}input{font:24px sans-serif;width:500px}</style>
        <h2>Owned self-clearing input</h2><label for="entry">Receipt input</label><input id="entry" autocomplete="off"><p id="received">Received: </p>
        <script>
        let received='', events=[];
        const entry=document.getElementById('entry');
        function report(kind) { window.webkit.messageHandlers.receipt.postMessage({kind,received,events,value:entry.value,focused:document.activeElement===entry}); }
        entry.addEventListener('input', event=>{received+=entry.value;events.push({data:event.data,value:entry.value,trusted:event.isTrusted});entry.value='';document.getElementById('received').textContent='Received: '+received;report('input');});
        window.addEventListener('load',()=>{entry.focus();report('ready');});
        </script>
        """, baseURL: nil)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let fixture = Fixture()
let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.delegate = fixture
app.run()
