import {DatabaseSync} from 'node:sqlite';
import {Ledger} from '../src/ledger.mjs';
import {snapshot,NOW} from './fixtures.mjs';
export function makeLedger(s=snapshot(),now=NOW){
  const db=new DatabaseSync(':memory:');
  const storage={sql:{exec(q,...params){if(q.includes('CREATE TABLE')){db.exec(q);return {toArray:()=>[]};}const rows=db.prepare(q).all(...params);return {toArray:()=>rows};}},
    transactionSync(fn){db.exec('BEGIN');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const ledger=new Ledger(storage);ledger.importSnapshot(s,now);return {ledger,db,storage};
}
