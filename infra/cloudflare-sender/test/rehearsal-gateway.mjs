// Local rehearsal ONLY: production Sender and its compiled OFF fuse are intact.
export {Sender} from '../src/worker.mjs';
export default {async fetch(request,env){
  const sender=env.SENDER.getByName('local-rehearsal'),route=new URL(request.url).pathname;
  try{
    if(route==='/import')return Response.json(await sender.importSnapshot(await request.json()));
    if(route==='/activate')return Response.json(await sender.activate());
    if(route==='/tick')return Response.json(await sender.tick());
    if(route==='/export')return Response.json(await sender.exportSnapshot());
    return Response.json(await sender.status());
  }catch{return new Response('Refused',{status:409});}
}};
