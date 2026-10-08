// Test-only entrypoint. Never referenced by production wrangler configuration.
import {Sender as BaseSender} from '../src/worker.mjs';
export class Sender extends BaseSender {
  releaseEnabled() {return true;}
  activationEvidence() {return true;}
  makeTransport() {
    const call=async(path,job)=>{
      const r=await this.env.FAKE.fetch('https://fake.invalid/'+path,{method:'POST',body:JSON.stringify(job)});
      return r.json();
    };
    return {prepare:job=>call('prepare',job),send:async(job,arm)=>await arm()?call('send',job):{kind:'cancelled'},verify:job=>call('verify',job),close:async()=>{}};
  }
}
export default {
  async fetch(request,env) {
    const stub=env.SENDER.getByName('fixture');
    const path=new URL(request.url).pathname;
    if (path==='/import') return Response.json(await stub.importSnapshot(await request.json()));
    if (path==='/activate') return Response.json(await stub.activate());
    if (path==='/tick') return Response.json(await stub.tick());
    if (path==='/stop') return Response.json(await stub.stop());
    if (path==='/query-report') return Response.json(await stub.queryReport(await request.json()));
    return Response.json(await stub.status());
  },
};
