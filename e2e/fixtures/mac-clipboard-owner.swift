// Owned comparison fixture: clipboard data stays in this process, never logs.
import AppKit
import Foundation
import ApplicationServices
import CoreGraphics
struct Item { let entries: [(NSPasteboard.PasteboardType, Data)] }
let board = NSPasteboard.general
func capture() throws -> [Item] {
    let count = board.changeCount
    let items = try (board.pasteboardItems ?? []).map { item -> Item in
        let data = try item.types.map { type -> (NSPasteboard.PasteboardType, Data) in
            guard let bytes = item.data(forType: type) else { throw NSError(domain: "Unreadable clipboard format; fixture refused", code: 1) }
            return (type, bytes)
        }
        return Item(entries: data)
    }
    guard board.changeCount == count else { throw NSError(domain: "Clipboard changed during snapshot; fixture refused", code: 2) }
    return items
}
func same(_ lhs: [Item], _ rhs: [Item]) -> Bool {
    guard lhs.count == rhs.count else { return false }
    return zip(lhs,rhs).allSatisfy { a,b in a.entries.count == b.entries.count && a.entries.allSatisfy { type,data in b.entries.contains { $0.0 == type && $0.1 == data } } }
}
func write(_ items: [Item]) throws {
    let objects = try items.map { entry -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type,data) in entry.entries { guard item.setData(data,forType:type) else { throw NSError(domain:"Local clipboard item refused",code:3) } }
        return item
    }
    board.clearContents()
    if !objects.isEmpty && !board.writeObjects(objects) { throw NSError(domain:"Clipboard write incomplete",code:4) }
}
var original: [Item]? = nil
var marker: [Item]? = nil
var newerMarker: [Item]? = nil
var copyTarget: (pid: pid_t, launchedAt: Double, windowId: Int, path: String, editor: AXUIElement)? = nil
var payload = ""
var active = false
var rich = false
func status() throws -> [String:Any] {
    let current = try capture()
    let markerMatches = marker.map { same(current,$0) } ?? false
    var plainTypes: Set<String> = ["public.utf8-plain-text","public.utf16-external-plain-text","NSStringPboardType"]
    if rich { plainTypes.insert("public.rtf") }
    let currentText = board.string(forType:.string)
    let textMatches = currentText == payload || (rich && currentText?.trimmingCharacters(in:.newlines) == payload.trimmingCharacters(in:.newlines))
    let payloadMatches = current.count == 1 && current[0].entries.allSatisfy { plainTypes.contains($0.0.rawValue) } && textMatches
    return ["markerPreserved":markerMatches,"ownedPayloadRemains":payloadMatches,"newerMarkerPreserved":newerMarker.map { same(current,$0) } ?? false]
}
func restore() throws -> [String:Any] {
    guard active,let saved = original else { return ["restored":!active,"active":active] }
    let s = try status()
    guard s["markerPreserved"] as? Bool == true || s["ownedPayloadRemains"] as? Bool == true || s["newerMarkerPreserved"] as? Bool == true else { return ["restored":false,"newerClipboardPreserved":true,"active":true] }
    // Fixture-only exact ownership check. NSPasteboard offers no atomic CAS.
    try write(saved)
    guard same(try capture(),saved) else { throw NSError(domain:"Clipboard restoration readback mismatch",code:5) }
    active = false; original = nil; marker = nil; newerMarker = nil; copyTarget = nil; payload = ""; rich = false
    return ["restored":true,"allOriginalItemsAndFormatsVerified":true,"active":false]
}
// This separate fixture process observes the real owned document. It never
// injects a pause, response or hook into the driver, and never logs AX values.
func axRead(_ element: AXUIElement, _ attribute: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success ? value : nil
}
func validCopyIdentity(_ pid: pid_t, _ launchedAt: Double, _ windowId: Int) -> Bool {
    guard let app = NSRunningApplication(processIdentifier:pid), app.bundleIdentifier == "com.apple.TextEdit",
          app.launchDate?.timeIntervalSince1970 == launchedAt else { return false }
    let windows = CGWindowListCopyWindowInfo(.optionAll,kCGNullWindowID) as? [[String:Any]] ?? []
    return windows.contains { ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) && ($0[kCGWindowNumber as String] as? Int) == windowId }
}
func prepareCopy(_ request: [String:Any]) throws -> [String:Any] {
    guard active,copyTarget == nil,let pidValue=request["pid"] as? Int,let launch=request["launchedAt"] as? Double,
          let windowId=request["windowId"] as? Int,let path=request["path"] as? String,
          validCopyIdentity(pid_t(pidValue),launch,windowId),AXIsProcessTrusted() else {
        throw NSError(domain:"Competing copy ownership or AX permission refused",code:9)
    }
    let application=AXUIElementCreateApplication(pid_t(pidValue))
    AXUIElementSetMessagingTimeout(application,0.2)
    let expectedURL=URL(fileURLWithPath:path).standardizedFileURL
    let windows=(axRead(application,"AXWindows") as? [AXUIElement] ?? []).filter { window in
        guard let document=axRead(window,"AXDocument") as? String,let url=URL(string:document) else { return false }
        return url.standardizedFileURL == expectedURL
    }
    guard windows.count == 1 else { throw NSError(domain:"Exact owned AX document missing",code:10) }
    var editors:[AXUIElement]=[];var visited=0
    func walk(_ element:AXUIElement,_ depth:Int) {
        guard depth < 12,visited < 200 else { return };visited += 1
        if axRead(element,"AXRole") as? String == "AXTextArea" { editors.append(element) }
        for child in axRead(element,"AXChildren") as? [AXUIElement] ?? [] { walk(child,depth+1) }
    }
    walk(windows[0],0)
    guard editors.count == 1,let before=axRead(editors[0],"AXValue") as? String,before != payload else {
        throw NSError(domain:"Unique pre-paste editor not verified",code:11)
    }
    AXUIElementSetMessagingTimeout(editors[0],0.2)
    copyTarget=(pid_t(pidValue),launch,windowId,path,editors[0])
    return ["armed":true,"exactOwnedDocumentVerified":true,"prePasteValueDiffers":true]
}
func copyAfterInsertion() throws -> [String:Any] {
    guard let target=copyTarget,active,newerMarker == nil else { throw NSError(domain:"Competing copy not prepared",code:12) }
    let started=Date();let deadline=started.addingTimeInterval(4)
    while Date() < deadline {
        guard validCopyIdentity(target.pid,target.launchedAt,target.windowId) else { throw NSError(domain:"Owned document identity changed",code:13) }
        if axRead(target.editor,"AXValue") as? String == payload {
            // Copy only while the driver's exact fixture payload still owns
            // the board. Missing the window is a test failure, never acceptance.
            let current=try status()
            guard current["ownedPayloadRemains"] as? Bool == true else {
                return ["copied":false,"insertionObserved":true,"payloadObservedBeforeCopy":false,"missedConcurrentWindow":true]
            }
            let copied=[Item(entries:[(.string,Data("OpenSky competing copy marker".utf8)),
                (NSPasteboard.PasteboardType("org.opensky.competing-copy"),Data(UUID().uuidString.utf8))])]
            // NSPasteboard has no atomic compare-and-swap. This is an actual
            // competing writer, scoped to its own private seeded board.
            newerMarker=copied;try write(copied)
            let verified=same(try capture(),copied)
            return ["copied":verified,"insertionObserved":true,"payloadObservedBeforeCopy":true,
                "newerMarkerVerifiedAfterCopy":verified,"elapsedMs":Date().timeIntervalSince(started)*1000]
        }
        Thread.sleep(forTimeInterval:0.005)
    }
    return ["copied":false,"insertionObserved":false,"timedOut":true]
}
while let line = readLine() {
    do {
        let request = try JSONSerialization.jsonObject(with:Data(line.utf8)) as! [String:Any]
        let op = request["op"] as? String ?? ""
        var result: [String:Any]
        switch op {
        case "seed":
            guard !active,let text=request["marker"] as? String,let target=request["payload"] as? String else { throw NSError(domain:"Fixture seed refused",code:6) }
            let saved = try capture()
            let first=Item(entries:[(.string,Data(text.utf8)),(NSPasteboard.PasteboardType("org.opensky.clipboard-fixture"),Data([0,1,127,255]))])
            let second=Item(entries:[(.string,Data("Second owned clipboard fixture item".utf8)),(NSPasteboard.PasteboardType("org.opensky.clipboard-fixture-second"),Data([254,128,2,0]))])
            let seeded = request["multiple"] as? Bool == true ? [first,second] : [Item(entries:[(.string,Data(text.utf8))])]
            original=saved;marker=seeded;payload=target;rich=request["rich"] as? Bool == true;active=true
            try write(seeded);result=try status()
            guard result["markerPreserved"] as? Bool == true else { throw NSError(domain:"Fixture seed verification failed",code:7) }
            result["originalSnapshotComplete"]=true
        case "prepare_copy": result=try prepareCopy(request)
        case "copy_after_insert": result=try copyAfterInsertion()
        case "status": result=try status()
        case "restore": result=try restore()
        default: throw NSError(domain:"Unknown fixture command",code:8)
        }
        result["ok"]=true
        print(String(data:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),encoding:.utf8)!)
    } catch {
        print("{\"ok\":false,\"error\":\"Clipboard fixture failed; contents withheld\"}")
    }
    fflush(stdout)
}
if active { _ = try? restore() }
