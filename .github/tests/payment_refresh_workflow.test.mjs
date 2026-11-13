import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../workflows/property-cbr.yml',import.meta.url),'utf8');
const blocks=workflow.split(/^      - name: /m).slice(1);
const byId=id=>blocks.find(b=>b.includes('\n        id: '+id+'\n'));
const evaluate=(block,{event='schedule',mode='refresh',cbr='success',bank='success',published='success',ref='refs/heads/main'}={})=>{
 const expression=/^        if: (.+)$/m.exec(block)?.[1];assert(expression);
 return Boolean(new Function('github','steps','always','return '+expression)({event_name:event,ref},{cycle:{outputs:{mode}},cbr:{outcome:cbr},bank_reader:{outcome:'success'},bank:{outcome:bank},publish:{outcome:published}},()=>true));
};
test('exactly three slots keep the existing serial concurrency and permissions',()=>{
 assert.deepEqual([...workflow.matchAll(/- cron: '([^']+)'\n      timezone: '([^']+)'/g)].map(m=>m.slice(1)),[['0 11 * * *','Europe/Moscow'],['7 11 * * *','Europe/Moscow'],['17 11 * * *','Europe/Moscow']]);
 assert.match(workflow,/group: property-payments-cbr\n  cancel-in-progress: false/);
 assert.match(workflow,/permissions:\n  contents: write\n  pages: write\n/);
 assert.doesNotMatch(workflow,/actions: write|--force(?:-with-lease)?\b(?!-refresh)/);
});
test('Python validation cannot leave bytecode in the strict daily-cycle checkout',()=>{
 assert.match(workflow,/^    env:\n(?:      #.*\n)*      PYTHONDONTWRITEBYTECODE: '1'$/m);
});
test('push and manual dispatch run validation only for every possible cycle mode',()=>{
 const validation=blocks.find(b=>b.startsWith('Validate calculations'));
 assert.doesNotMatch(validation,/^        if:/m);
 for(const event of ['push','workflow_dispatch'])for(const mode of ['refresh','adopt','resume','skip'])for(const block of blocks.filter(b=>/^        if:/m.test(b)))assert.equal(evaluate(block,{event,mode}),false,block.split('\n')[0]);
});
test('all source outcomes gate freezing; recovery and completed-day modes never read sources',()=>{
 for(const cbr of ['success','failure','skipped','cancelled'])for(const bank of ['success','failure','skipped','cancelled'])assert.equal(evaluate(byId('publish'),{cbr,bank}),cbr==='success'&&bank==='success');
 for(const mode of ['adopt','resume','skip'])for(const id of ['cbr','bank_reader','bank'])assert.equal(evaluate(byId(id),{mode}),false);
 assert.equal(evaluate(byId('publish'),{mode:'adopt',cbr:'skipped',bank:'skipped'}),true);
 assert.equal(evaluate(byId('publish'),{mode:'resume'}),false);assert.equal(evaluate(byId('publish'),{mode:'skip'}),false);
 assert.equal(evaluate(byId('publish'),{ref:'refs/heads/other'}),false);
 assert.equal(evaluate(byId('confirmation'),{mode:'resume',published:'skipped'}),true);
 assert.equal(evaluate(byId('confirmation'),{mode:'skip',published:'skipped'}),false);
 assert.equal(evaluate(byId('confirmation'),{published:'failure'}),false);
});
test('source readers require the fresh authoritative plan and retain strict source parsers',()=>{
 for(const id of ['cbr','bank']){assert.match(byId(id),/THAIPAY_CYCLE_PLAN:/);assert.match(byId(id),/--force-refresh/);}
 const bank=readFileSync(new URL('../scripts/update_property_bank.cjs',import.meta.url),'utf8'),cbr=readFileSync(new URL('../scripts/update_property_cbr.py',import.meta.url),'utf8');
 assert(bank.indexOf("'check-reader'")<bank.indexOf('const snapshot = await readSnapshot();'));
 assert(cbr.indexOf('"check-reader"')<cbr.indexOf('"curl", "--fail"'));
 assert.match(bank,/const rate = money\(rows\[0\]\[4\]\)/);assert.match(bank,/compact\(cells\[0\]\) === 'USD50'/);
 assert.match(cbr,/ZoneInfo\("Europe\/Moscow"\)/);assert.doesNotMatch(cbr,/--insecure|\["curl", "-k"/);
});
test('GitHub inline scripts parse and use authoritative creation time without broader permissions',()=>{
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 for(const block of blocks.filter(b=>b.includes('          script: |'))){const body=block.split('          script: |\n')[1].split('\n').filter(line=>line.startsWith('            ')).map(line=>line.slice(12)).join('\n');assert.doesNotThrow(()=>new AsyncFunction('github','context','core','require',body));}
 assert.match(byId('cycle'),/api\.github\.com\/repos\/.*actions\/runs\//);
 assert.match(byId('cycle'),/runCreatedAt:run\.created_at/);assert.match(byId('cycle'),/daily\.prepare/);
 assert.match(byId('confirmation'),/daily\.pendingTarget/);assert.match(byId('confirmation'),/daily\.confirmPublication/);assert.match(byId('confirmation'),/daily\.acknowledge/);
});
