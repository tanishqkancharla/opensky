/** Private helper FIFO. Timed-out slots remain until their late reply arrives. */
export class ClipboardReplies<T> {
  private pending:Array<{resolve:(value:T)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>=[];
  private closed=false;
  constructor(private write:(line:string)=>void,private timeoutMs=8000) {}
  request(input:Record<string,unknown>):Promise<T> {
    if(this.closed)return Promise.reject(Error("Clipboard fixture worker is closed"));
    return new Promise<T>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error("Clipboard fixture request timed out; contents withheld")),this.timeoutMs);
      this.pending.push({resolve,reject,timer});
      try {this.write(JSON.stringify(input)+"\n");}
      catch {this.close(Error("Clipboard fixture write failed; contents withheld"));}
    });
  }
  receive(line:string):void {
    const waiter=this.pending.shift();
    if(!waiter)return;
    clearTimeout(waiter.timer);
    try {waiter.resolve(JSON.parse(line) as T);}
    catch {waiter.reject(Error("Invalid clipboard fixture response; contents withheld"));}
  }
  close(error=Error("Clipboard fixture worker exited")):void {
    this.closed=true;
    for(const waiter of this.pending.splice(0)){clearTimeout(waiter.timer);waiter.reject(error);}
  }
}
