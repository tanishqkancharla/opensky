/** Process evidence only: caller separately proves PID lineage and kernel state. */
export function hasChromeSwitch(argv,flag){
  if(argv.includes(flag))return true;
  if(argv.length!==1)return false;
  const escaped=flag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?:^|\\s)'+escaped+'(?=\\s|$)').test(argv[0]);
}
export function processStartTicks(stat){
  const close=stat.lastIndexOf(')');
  const value=close<0?undefined:stat.slice(close+2).trim().split(/\s+/)[19];
  if(!/^\d+$/.test(value??''))throw new Error('Invalid process start-time evidence');
  return value;
}
