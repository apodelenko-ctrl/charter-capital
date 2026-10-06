// Local validation; stdin only, no cloud calls, no Telegram imports or credentials.
import {DatabaseSync} from 'node:sqlite';
import {Ledger} from '../src/ledger.mjs';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8*1024*1024)throw Error('snapshot_too_large');}
const snapshot=JSON.parse(input),db=new DatabaseSync(':memory:');
const storage={sql:{exec(query,...params){
  if(query.includes('CREATE TABLE')){db.exec(query);return {toArray:()=>[]};}
  const rows=db.prepare(query).all(...params);return {toArray:()=>rows};
}},transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
try{
  const ledger=new Ledger(storage);ledger.importSnapshot(snapshot,Date.now());
  const exported=ledger.exportSnapshot();
  if(exported.attempts.length!==snapshot.attempts.length || exported.imported_attempts.length!==snapshot.attempts.length)throw Error('history_count_mismatch');
  for(const row of exported.imported_attempts) {
    const original=snapshot.attempts.find(a=>a.id===row.id);
    if(JSON.stringify(original)!==row.original)throw Error('history_payload_mismatch');
  }
  console.log(JSON.stringify({validated:true,...ledger.status(),exact_imported_attempts:exported.imported_attempts.length,network_calls:0}));
} finally{db.close();}
