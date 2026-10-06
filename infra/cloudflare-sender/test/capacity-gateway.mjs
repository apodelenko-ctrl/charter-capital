// Local-only workerd SQLite metering; no outbound calls, secrets or real peers.
import {DurableObject} from 'cloudflare:workers';
import {Ledger,DAY,HOUR} from '../src/ledger.mjs';
import {snapshot,group,NOW} from './fixtures.mjs';
export class Probe extends DurableObject {
  async run() {
    let reads=0,writes=0,byQuery=new Map();
    const storage={transactionSync:fn=>this.ctx.storage.transactionSync(fn),sql:{exec:(q,...params)=>{
      const cursor=this.ctx.storage.sql.exec(q,...params),rows=cursor.toArray();
      reads+=cursor.rowsRead;writes+=cursor.rowsWritten;
      byQuery.set(q,(byQuery.get(q)||0)+cursor.rowsRead);return {toArray:()=>rows};
    }}};
    const ledger=new Ledger(storage);
    // Conservative capacity bound: daytime paid frequency for all 24 hours.
    // Actual night policy reduces traffic; test it separately in cadence.test.
    ledger.nextDue=(g,last,now)=>last==null?now:Math.max(now,last+ledger.interval(g));
    ledger.importSnapshot(snapshot({daily_limit:24000,groups:Array.from({length:25},(_,i)=>group({chat_id:-100000-i,paid:i<8,gap_ms:i<8?0:2000,
      valid_until:NOW+4*DAY,paid_until:NOW+4*DAY}))}),NOW);
    ledger.activate();let now=NOW,n=0,secondDay=0,measuring=false,alarms=0,nextHour=NOW+HOUR;
    while(now<NOW+2*DAY) {
      if(!measuring && now>=NOW+DAY){measuring=true;reads=0;writes=0;byQuery=new Map();}
      if(now>=nextHour){ledger.hourly(nextHour);nextHour+=HOUR;}
      const job=ledger.claim(now,String(n),String(n+1));
      if(job){ledger.finish(job,{kind:'sent',message_id:n+1},now);n++;if(measuring)secondDay++;}
      now=ledger.nextWake(now);if(now==null)break;
      if(measuring)alarms+=2; // watchdog + next wake writes (conservative, separate from SQL).
    }
    return {synthetic:true,scenario:'24h daytime upper bound',groups:25,paid:8,second_day_attempts:secondDay,sql_rows_read:reads,sql_rows_written:writes,
      alarm_write_allowance:alarms,total_write_estimate:writes+alarms,connections:0,sends:0,
      largest_reads:[...byQuery.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4)};
  }
}
export default{async fetch(request,env){return Response.json(await env.PROBE.getByName('synthetic').run());}};
