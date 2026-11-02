'use strict';
// Piccolo trasporto WebSocket RFC 6455 per soli messaggi JSON: nessuna dipendenza npm.
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const MAX_MESSAGE = 16 * 1024;
function frame(opcode, bytes=Buffer.alloc(0)) {
  const len=bytes.length;
  const header=Buffer.alloc(len<126?2:len<65536?4:10);
  header[0]=0x80|opcode;
  if(len<126)header[1]=len;
  else if(len<65536){header[1]=126;header.writeUInt16BE(len,2);}
  else{header[1]=127;header.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([header,bytes]);
}
function createWebSocketServer(server) {
  const emitter=new EventEmitter();
  const sockets=new Map();
  const io={
    sockets:{sockets},
    on:(type,fn)=>emitter.on(type,fn),
    to(id){return{emit(event,payload){
      const dest=sockets.get(id);
      if(dest){dest.emit(event,payload);return;}
      for(const s of sockets.values())if(s.data.code===id)s.emit(event,payload);
    }};},
    close(){for(const s of sockets.values())s.disconnect(true);clearInterval(heartbeat);}
  };
  server.on('upgrade',(req,tcp,head)=>{
    const key=req.headers['sec-websocket-key'];
    const origin=req.headers.origin;
    try {
      if(req.url?.split('?')[0]!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||!key||Buffer.from(key,'base64').length!==16||
        (origin&&new URL(origin).host!==req.headers.host)||sockets.size>=2000){tcp.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');tcp.destroy();return;}
    }catch{tcp.destroy();return;}
    const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    tcp.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const socket={
      id:crypto.randomBytes(16).toString('hex'),data:{},joined:null,handlers:new Map(),tcp,
      buffer:Buffer.alloc(0),closed:false,seen:Date.now(),
      on(type,callback){this.handlers.set(type,callback);},
      join(code){this.joined=code;},leave(code){if(this.joined===code)this.joined=null;},
      emit(type,data){if(this.closed)return;const payload=Buffer.from(JSON.stringify({type,data}));if(payload.length<MAX_MESSAGE)this.tcp.write(frame(1,payload));},
      disconnect(){if(this.closed)return;try{this.tcp.end(frame(8));}catch{}this.cleanup();},
      cleanup(){if(this.closed)return;this.closed=true;sockets.delete(this.id);try{this.handlers.get('disconnect')?.();}catch(e){console.warn('disconnect handler:',e.message);}this.tcp.destroy();},
      receive(chunk){
        this.seen=Date.now();this.buffer=Buffer.concat([this.buffer,chunk]);
        if(this.buffer.length>MAX_MESSAGE*4){this.disconnect();return;}
        while(this.buffer.length>=2){
          const buf=this.buffer;const opcode=buf[0]&0x0f;const fin=!!(buf[0]&0x80);const masked=!!(buf[1]&0x80);
          let length=buf[1]&0x7f,at=2;
          if(length===126){if(buf.length<4)return;length=buf.readUInt16BE(2);at=4;}
          else if(length===127){if(buf.length<10)return;const big=buf.readBigUInt64BE(2);if(big>BigInt(MAX_MESSAGE)){this.disconnect();return;}length=Number(big);at=10;}
          if(!masked||length>MAX_MESSAGE||!fin){this.disconnect();return;}
          if(buf.length<at+4+length)return;
          const mask=buf.subarray(at,at+4);at+=4;
          const bytes=Buffer.from(buf.subarray(at,at+length));this.buffer=buf.subarray(at+length);
          for(let i=0;i<length;i++)bytes[i]^=mask[i%4];
          if(opcode===8){this.disconnect();return;}
          if(opcode===9){this.tcp.write(frame(10,bytes));continue;}
          if(opcode===10)continue;
          if(opcode!==1){this.disconnect();return;}
          try{
            const message=JSON.parse(bytes.toString('utf8'));
            if(typeof message.type!=='string'||message.type.length>48)continue;
            const fn=this.handlers.get(message.type);
            if(fn)fn(message.data);
          }catch(err){if(err?.name!=='SyntaxError')console.warn('WebSocket event:',err.message);}
        }
      }
    };
    sockets.set(socket.id,socket);
    tcp.on('data',c=>socket.receive(c));tcp.on('close',()=>socket.cleanup());tcp.on('error',()=>socket.cleanup());
    emitter.emit('connection',socket);
    if(head?.length)socket.receive(head);
  });
  const heartbeat=setInterval(()=>{
    for(const s of sockets.values()){
      if(Date.now()-s.seen>120000){s.disconnect();continue;}
      try{s.tcp.write(frame(9,Buffer.from('q')));}catch{s.cleanup();}
    }
  },30000);
  heartbeat.unref();
  return io;
}
module.exports={createWebSocketServer};
