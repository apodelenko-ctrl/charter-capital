import {test} from 'node:test';
import assert from 'node:assert/strict';
import {socketClass} from '../src/socket.mjs';
function fake(chunks) {
  const writes=[];
  return {writes,connect:()=>({opened:Promise.resolve(),closed:Promise.resolve(),
    readable:new ReadableStream({start(c){for(const part of chunks)c.enqueue(new Uint8Array(part));c.close();}}),
    writable:new WritableStream({write(bytes){writes.push([...bytes]);}}),close:async()=>{}})};
}
test('TCP adapter reassembles fragmented bytes and retains the remainder',async()=>{
  const f=fake([[1],[2,3,4],[5]]);const Socket=socketClass(f.connect);const s=new Socket();await s.connect(443,'fixture.invalid');
  assert.deepEqual([...await s.readExactly(3)],[1,2,3]);assert.deepEqual([...await s.readExactly(2)],[4,5]);
  await assert.rejects(s.readExactly(1),/eof/);
});
test('TCP adapter serializes writes and rejects oversized frames',async()=>{
  const f=fake([]);const Socket=socketClass(f.connect);const s=new Socket();await s.connect(443,'fixture.invalid');
  s.write(Buffer.from([1]));s.write(Buffer.from([2]));await s.writeTail;assert.deepEqual(f.writes,[[1],[2]]);
  await assert.rejects(s.readExactly(100000000),/invalid_read/);await s.close();assert.throws(()=>s.write(Buffer.from([3])),/closed/);
});
test('TCP adapter writes a large encrypted packet in bounded ordered chunks',async()=>{
  const f=fake([]);const Socket=socketClass(f.connect);const s=new Socket();await s.connect(443,'fixture.invalid');
  const bytes=Buffer.alloc(512*1024+93);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  s.write(bytes);s.write(Buffer.from([9,8]));await s.writeTail;
  assert.ok(f.writes.every(chunk=>chunk.length<=16*1024));
  assert.deepEqual(Buffer.concat(f.writes.map(chunk=>Buffer.from(chunk))),Buffer.concat([bytes,Buffer.from([9,8])]));
});
