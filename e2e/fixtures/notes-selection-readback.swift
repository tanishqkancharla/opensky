import AppKit
import ApplicationServices
@_silgen_name("_AXUIElementGetWindow")
func getWindow(_ element:AXUIElement,_ id:UnsafeMutablePointer<CGWindowID>)->AXError
let args=CommandLine.arguments
guard args.count==6,let pid=pid_t(args[1]),let launched=Double(args[2]),let windowId=CGWindowID(args[3]),let app=NSRunningApplication(processIdentifier:pid),app.bundleIdentifier=="com.apple.Notes",app.launchDate?.timeIntervalSince1970==launched else {fatalError("Exact owned Notes identity required")}
func read(_ e:AXUIElement,_ key:String)->CFTypeRef?{var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,key as CFString,&v) == .success ? v:nil}
func scope(_ e:AXUIElement)->[String:Any]{var owner:pid_t=0;let pe=AXUIElementGetPid(e,&owner);var window:CGWindowID=0;let we=getWindow(e,&window);return ["pid":owner,"pidError":pe.rawValue,"windowId":window,"windowError":we.rawValue]}
func info(_ e:AXUIElement)->[String:Any]{AXUIElementSetMessagingTimeout(e,0.1);var row=scope(e)
 for key in ["AXRole","AXSubrole","AXIdentifier","AXFocused","AXEnabled","AXSelectedText","AXValue"]{if let v=read(e,key){let text=String(describing:v);row[key]=["typeId":CFGetTypeID(v),"text":String(text.prefix(4096))]}}
 if let raw=read(e,"AXSelectedTextRange"),CFGetTypeID(raw)==AXValueGetTypeID(){let v=raw as! AXValue;var range=CFRange();if AXValueGetType(v) == .cfRange && AXValueGetValue(v,.cfRange,&range){row["selectionRange"]=["startUTF16":range.location,"lengthUTF16":range.length]}}
 return row
}
let application=AXUIElementCreateApplication(pid);AXUIElementSetMessagingTimeout(application,0.1)
guard let raw=read(application,"AXFocusedWindow"),CFGetTypeID(raw)==AXUIElementGetTypeID() else{fatalError("Focused owned window required")}
let window=raw as! AXUIElement;var id:CGWindowID=0;guard getWindow(window,&id) == .success && id==windowId else{fatalError("Exact focused window required")}
var visited=0,rows:[[String:Any]]=[]
func walk(_ e:AXUIElement,_ depth:Int,_ web:Bool){guard depth<24 && visited<2000 else{return};visited+=1;AXUIElementSetMessagingTimeout(e,0.1)
 let role=read(e,"AXRole").map{String(describing:$0)} ?? "";let inWeb=web || role=="AXWebArea"
 if ["AXTextArea","AXTextField","AXWebArea"].contains(role){var row=info(e);row["depth"]=depth;row["inWebContent"]=inWeb;rows.append(row)}
 for child in read(e,"AXChildren") as? [AXUIElement] ?? []{walk(child,depth+1,inWeb)}
}
walk(window,0,false)
guard rows.contains(where:{($0["AXValue"] as? [String:Any])?["text"] as? String==args[4]}) else{fatalError("Exact owned raw note body required")}
var focused:[String:Any]?=nil
if let raw=read(application,"AXFocusedUIElement"),CFGetTypeID(raw)==AXUIElementGetTypeID(){
 let element=raw as! AXUIElement;focused=info(element)
 if let rawWindow=read(element,"AXWindow"),CFGetTypeID(rawWindow)==AXUIElementGetTypeID(){var w=scope(rawWindow as! AXUIElement);w["role"]=read(rawWindow as! AXUIElement,"AXRole").map{String(describing:$0)} as Any? ?? NSNull();focused?["windowAttribute"]=w}
 var current=element,chain:[[String:Any]]=[]
 for _ in 0..<24 {
  var row=scope(current);row["role"]=read(current,"AXRole").map{String(describing:$0)} as Any? ?? NSNull()
  row["subrole"]=read(current,"AXSubrole").map{String(describing:$0)} as Any? ?? NSNull();chain.append(row)
  if row["role"] as? String=="AXWindow" || row["role"] as? String=="AXApplication" {break}
  guard let p=read(current,"AXParent"),CFGetTypeID(p)==AXUIElementGetTypeID() else{break}
  let parent=p as! AXUIElement;AXUIElementSetMessagingTimeout(parent,0.1)
  chain[chain.count-1]["parentContainsChild"]=(read(parent,"AXChildren") as? [AXUIElement])?.contains{CFEqual($0,current)} as Any? ?? NSNull()
  current=parent
 }
 focused?["ancestry"]=chain
}
let payload:[String:Any]=["readOnly":true,"pid":pid,"windowId":windowId,"launchedAt":launched,"focused":focused as Any? ?? NSNull(),"rows":rows,"visited":visited]
try JSONSerialization.data(withJSONObject:payload,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:args[5]))
