import { Buffer } from 'node:buffer';

// Factory injection permits byte-level tests without Telegram or credentials.
export function socketClass(connect,onFailure=()=>{}) {
  return class CloudflareSocket {
    constructor(proxy) {
      if (proxy) throw Error('proxy_not_supported');
      this.closed=true;this.buffer=Buffer.alloc(0);this.writeTail=Promise.resolve();
    }
    async connect(port,hostname) {
      if (!this.closed) throw Error('already_connected');
      this.socket=connect({hostname,port},{secureTransport:'off'});
      this.closed=false;
      try { await this.socket.opened; }
      catch { await this.close(); throw Error('tcp_connect_failed'); }
      this.reader=this.socket.readable.getReader();this.writer=this.socket.writable.getWriter();
      // Consume rejection: close() and reads/writes carry the failure to the caller.
      this.socket.closed.catch(()=>{});
    }
    async read(n) {
      if (!Number.isSafeInteger(n) || n<0 || n>16*1024*1024) throw Error('invalid_read_size');
      if (n===0) return Buffer.alloc(0);
      while (!this.buffer.length) {
        if (this.closed || this.writeError) throw Error('tcp_closed');
        let chunk;
        try{chunk=await this.reader.read();}catch(error){onFailure(error,'tcp_read');throw error;}
        const {done,value}=chunk;
        if (done) {this.closed=true;const error=Error('tcp_eof');onFailure(error,'tcp_read');throw error;}
        this.buffer=Buffer.from(value);
      }
      const result=this.buffer.subarray(0,n);this.buffer=this.buffer.subarray(result.length);return result;
    }
    async readExactly(n) {
      if (!Number.isSafeInteger(n) || n<0 || n>16*1024*1024) throw Error('invalid_read_size');
      const parts=[];let remaining=n;
      while (remaining) {const part=await this.read(remaining);parts.push(part);remaining-=part.length;}
      return Buffer.concat(parts,n);
    }
    async readAll() {return this.read(this.buffer.length || 16*1024*1024);}
    write(data) {
      if (this.closed || this.writeError) throw Error('tcp_closed');
      const bytes=Buffer.from(data);
      this.writeTail=this.writeTail.then(async()=>{
        // Keep the byte stream identical while bounding each native write.
        for(let offset=0;offset<bytes.length;offset+=16*1024){
          if(this.closed || this.writeError)throw Error('tcp_closed');
          await this.writer.write(bytes.subarray(offset,offset+16*1024));
        }
      }).catch(async(error)=>{
        onFailure(error,'tcp_write');this.writeError=true;await this.close();
      });
    }
    async close() {
      this.closed=true;
      try {await this.socket?.close();} catch {}
    }
  };
}
