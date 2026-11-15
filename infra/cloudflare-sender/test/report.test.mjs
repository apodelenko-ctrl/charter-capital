import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatReport,enqueueReport} from '../src/report.mjs';
const end=Date.UTC(2026,9,6,4);
const report={start:end-3600000,end,generated_at:end,attempts:{sent:12,failed:2,sent_external:1,uncertain:1},
  free:{sent:12,failed:2,sent_external:1,uncertain:1},
  unresolved_now:{uncertain:3},groups:[],enabled:false,halt:'FloodWait',wait_until:end+60000,blocked_groups:15};
class Engine{
  constructor(s){this.s=s;}
  enqueue(kind,payload,lead,dedupe){this.s.outbox.push({kind,payload,dedupe,state:'pending'});}
}
test('hourly report separates real successes, external confirmations and unresolved holds',()=>{
  const text=formatReport(report);
  assert.match(text,/API 12/);assert.match(text,/внешних 1/);
  assert.match(text,/uncertain 3/);assert.match(text,/Бангкок/);assert.match(text,/остановлен/);
});
test('existing bot outbox dedupes retry and preserves uncertain delivery, fixed owner only',()=>{
  const s={importedAt:'fixture',config:{owner_id:123},outbox:[]};
  assert.equal(enqueueReport(s,Engine,report).state,'pending');
  enqueueReport(s,Engine,{...report,attempts:{sent:999}});assert.equal(s.outbox.length,1);
  assert.equal(s.outbox[0].payload.chat_id,123);assert.match(s.outbox[0].payload.text,/API 12/);
  s.outbox[0].state='uncertain';assert.equal(enqueueReport(s,Engine,report).state,'uncertain');assert.equal(s.outbox.length,1);
});
