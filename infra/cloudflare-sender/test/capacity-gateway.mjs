// Local-only workerd SQLite metering; no outbound calls, secrets or real peers.
import {DurableObject} from 'cloudflare:workers';
import {Ledger,DAY,HOUR} from '../src/ledger.mjs';
import {PAID_HANDLES} from '../src/cadence.mjs';
import {snapshot,group,NOW} from './fixtures.mjs';
export class Probe extends DurableObject {
  async run(mode) {
    let reads=0,writes=0,byQuery=new Map(),writesByQuery=new Map();
    const storage={transactionSync:fn=>this.ctx.storage.transactionSync(fn),sql:{exec:(q,...params)=>{
      const cursor=this.ctx.storage.sql.exec(q,...params),rows=cursor.toArray();
      reads+=cursor.rowsRead;writes+=cursor.rowsWritten;
      byQuery.set(q,(byQuery.get(q)||0)+cursor.rowsRead);writesByQuery.set(q,(writesByQuery.get(q)||0)+cursor.rowsWritten);return {toArray:()=>rows};
    }}};
    const ledger=new Ledger(storage);
    // Conservative capacity bound: daytime paid frequency for all 24 hours.
    // Actual night policy reduces traffic; test it separately in cadence.test.
    if(mode==='upper')ledger.nextDue=(g,last,now)=>last==null?now:Math.max(now,last+ledger.interval(g));
    const groups=Array.from({length:mode==='upper'?33:34},(_,i)=>{
      const g=group({chat_id:-100000-i,paid:i<9,handle:i<9?[...PAID_HANDLES][i]:'fixture_'+i,
        paid_day_interval_seconds:i<9?150:undefined,interval_ms:i<9?150000:mode!=='upper' && i>=31?3600000:600000,
        daily_limit:mode!=='upper' && i===33?2:24000,gap_ms:i<9?0:2000,valid_until:NOW+4*DAY,paid_until:NOW+4*DAY});
      if(g.paid){const content={text:g.text,format:'photo',digest:g.digest,entities:[],photo_sha256:g.photo_sha256,photo_asset:g.photo_asset};
        g.rotation={campaign:'paid-ab-20261006',variants:{A:content,B:{...content,text:'Synthetic B',photo_asset:'/b.png'}}};}
      return g;
    });
    ledger.importSnapshot(snapshot({daily_limit:24000,groups}),NOW);
    ledger.activate();let now=NOW,n=0,secondDay=0,measuring=false,alarms=0,nextHour=NOW+HOUR;
    while(now<NOW+2*DAY) {
      if(!measuring && now>=NOW+DAY){measuring=true;reads=0;writes=0;byQuery=new Map();writesByQuery=new Map();}
      if(now>=nextHour){ledger.hourly(nextHour);nextHour+=HOUR;}
      const job=ledger.claim(now,String(n),String(n+1));
      if(job){ledger.arm(job,now);ledger.finish(job,{kind:'sent',message_id:n+1},now);ledger.finishVisibility(job,{kind:'verified'},now);n++;if(measuring)secondDay++;}
      now=ledger.nextWake(now);if(now==null)break;
      if(measuring)alarms+=4; // watchdog + next wake writes (conservative, separate from SQL).
    }
    return {synthetic:true,scenario:mode==='upper'?'24h daytime upper bound':'Moscow day/night; 22 free 10m, 2 free 60m, 1 free 2/day',groups:groups.length,paid:9,second_day_attempts:secondDay,sql_rows_read:reads,sql_rows_written:writes,
      alarm_write_allowance:alarms,total_write_estimate:writes+alarms,connections:0,sends:0,
      largest_writes:[...writesByQuery.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10),largest_reads:[...byQuery.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4)};
  }
}
export default{async fetch(request,env){const mode=new URL(request.url).pathname.slice(1);return Response.json(await env.PROBE.getByName(mode).run(mode));}};
