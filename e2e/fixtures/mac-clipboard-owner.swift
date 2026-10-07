// Owned comparison fixture: clipboard data stays in this process, never logs.
import AppKit
import Foundation
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
    return ["markerPreserved":markerMatches,"ownedPayloadRemains":payloadMatches]
}
func restore() throws -> [String:Any] {
    guard active,let saved = original else { return ["restored":!active,"active":active] }
    let s = try status()
    guard s["markerPreserved"] as? Bool == true || s["ownedPayloadRemains"] as? Bool == true else { return ["restored":false,"newerClipboardPreserved":true,"active":true] }
    // Fixture-only exact ownership check. NSPasteboard offers no atomic CAS.
    try write(saved)
    guard same(try capture(),saved) else { throw NSError(domain:"Clipboard restoration readback mismatch",code:5) }
    active = false; original = nil; marker = nil; payload = ""; rich = false
    return ["restored":true,"allOriginalItemsAndFormatsVerified":true,"active":false]
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
