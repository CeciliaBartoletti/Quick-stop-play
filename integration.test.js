'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qg-tests-'));
process.env.DB_PATH=path.join(dir,'games.sqlite');
const {server,io,rooms,store}=require('../server');
let port;
const clients=[];
class Client {
  constructor(name){this.name=name;this.ws=null;this.events=[];this.state=null;this.joined=null;this.listeners=[];}
  async connect(){
    const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);this.ws=ws;
    ws.addEventListener('message',e=>{
      const m=JSON.parse(e.data);this.events.push(m);
      if(m.type==='state')this.state=m.data;
      if(m.type==='joined')this.joined=m.data;
      for(const listener of [...this.listeners]){
        if(listener.type===m.type&&listener.predicate(m.data)){clearTimeout(listener.timeout);this.listeners.splice(this.listeners.indexOf(listener),1);listener.resolve(m.data);}
      }
    });
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    return this;
  }
  send(type,data){this.ws.send(JSON.stringify({type,data}));}
  wait(type,predicate=()=>true,timeoutMs=2000){
    const existing=type==='state'?this.state:type==='joined'?this.joined:null;
    if(existing&&predicate(existing))return Promise.resolve(existing);
    return new Promise((resolve,reject)=>{
      const listener={type,predicate,resolve};
      listener.timeout=setTimeout(()=>{this.listeners=this.listeners.filter(x=>x!==listener);reject(new Error(`Timeout ${this.name}:${type}`));},timeoutMs);
      this.listeners.push(listener);
    });
  }
  async close(){const ws=this.ws;if(ws?.readyState!==WebSocket.CLOSED){ws.close();await new Promise(r=>ws.addEventListener('close',r,{once:true}));}}
}
const mk=async name=>{const c=new Client(name);clients.push(c);return c.connect();};
test('multiplayer: 3 giocatrici, carte private, rotazione tema, punti e riconnessione',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  port=server.address().port;
  const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());assert.equal(health.ok,true);
  const a=await mk('Giulia');a.send('create',{name:'Giulia'});
  const joinedA=await a.wait('joined');const code=joinedA.code;
  assert.equal(code.length,6);
  const b=await mk('Sara');b.send('join',{name:'Sara',code});const joinedB=await b.wait('joined');
  const c=await mk('Emma');c.send('join',{name:'Emma',code});await c.wait('joined');
  await a.wait('state',s=>s.players.length===3);
  c.send('mode',{mode:'voice'}); // una ospite non può cambiare la modalità
  a.send('pack',{pack:'mixed'});
  a.send('mode',{mode:'written'});
  a.send('start');
  let state=await a.wait('state',s=>s.phase==='playing');
  assert.equal(state.you.hand.length,5);
  assert.equal(state.players.length,3);
  assert.ok(state.players.every(p=>!p.hand&&!p.token));
  assert.equal((await b.wait('state',s=>s.phase==='playing')).you.hand.length,5);
  const initialTopicNum=state.topicNumber;
  const chosen=state.you.hand[0];
  a.send('play',{cardId:chosen.id,answer:'Zzz',topicNumber:state.topicNumber,round:state.round});
  await a.wait('notice',v=>v.includes('deve iniziare'));
  assert.equal(a.state.you.hand.length,5);
  // Le 5 lettere di Giulia vengono scartate una per volta dopo la convalida host.
  for(let i=0;i<5;i++){
    state=a.state;
    const card=state.you.hand[0];
    a.send('play',{cardId:card.id,answer:card.letter+' parola'+i,topicNumber:state.topicNumber,round:state.round});
    const pending=await a.wait('state',s=>s.pending?.cardId===card.id||s.pending?.letter===card.letter);
    assert.equal(pending.pending.letter,card.letter);
    assert.equal(b.state.players.find(p=>p.id===joinedA.id).hand,undefined);
    c.send('review',{pendingId:pending.pending.id,accept:false});
    a.send('review',{pendingId:pending.pending.id,accept:true});
    await a.wait('state',s=>s.you.hand.length===4-i||s.phase==='finished');
    assert.equal(a.state.you.hand.length,4-i);
    if(i===2)assert.ok(a.state.topicNumber>initialTopicNum);
  }
  await b.wait('state',s=>s.phase==='finished');
  assert.equal(a.state.winnerId,joinedA.id);
  assert.equal(a.state.players.find(p=>p.id===joinedA.id).score,10);
  const expected=rooms.get(code);
  assert.equal(expected.history.length,1);
  assert.equal(store.loadRooms().get(code).history.length,1);
  // La stessa giocatrice riottiene il proprio profilo e punteggio senza perdere i progressi.
  await b.close();
  const b2=await mk('Sara-riaperta');b2.send('join',{name:'Sara',code,token:joinedB.token});
  await b2.wait('joined');await b2.wait('state',s=>s.phase==='finished');
  assert.equal(b2.joined.id,joinedB.id);
  assert.equal(b2.state.players.length,3);
  a.send('mode',{mode:'voice'});
  await a.wait('state',s=>s.mode==='voice');
  a.send('start');
  await a.wait('state',s=>s.round===2&&s.phase==='playing');
  state=a.state;const voiceCard=state.you.hand[0];
  a.send('play',{cardId:voiceCard.id,answer:'',topicNumber:state.topicNumber,round:state.round});
  await a.wait('state',s=>s.pending?.letter===voiceCard.letter);
  assert.equal(a.state.pending.answer,'(detta a voce)');
  a.send('review',{pendingId:a.state.pending.id,accept:true});
  await a.wait('state',s=>s.you.hand.length===4);
  // Host può passare il suo ruolo a una giocatrice connessa.
  a.send('transferHost',{playerId:joinedB.id});
  await b2.wait('state',s=>s.hostId===joinedB.id);
  assert.equal(rooms.get(code).hostId,joinedB.id);
},{timeout:14000});
test('capienza 6 giocatrici e segnalazione WebRTC tra partecipanti autorizzate',async()=>{
  const host=await mk('Host6');host.send('create',{name:'Host6'});
  const info=await host.wait('joined');
  const people=[host];
  for(let n=2;n<=6;n++){
    const p=await mk('Amica'+n);p.send('join',{name:'Amica'+n,code:info.code});
    await p.wait('joined');people.push(p);
  }
  await host.wait('state',s=>s.players.length===6);
  const seventh=await mk('Settima');seventh.send('join',{name:'Settima',code:info.code});
  await seventh.wait('notice',msg=>msg.includes('piena'));
  assert.equal(host.state.players.length,6);
  host.send('mode',{mode:'voice'});await host.wait('state',s=>s.mode==='voice');
  host.send('start');await host.wait('state',s=>s.phase==='playing');
  host.send('audio:ready',{ready:true});people[1].send('audio:ready',{ready:true});
  await host.wait('state',s=>s.players[1].micReady);
  host.send('rtc:signal',{to:people[1].joined.id,signal:{type:'offer',sdp:'v=0'}});
  const relay=await people[1].wait('rtc:signal',r=>r.from===info.id);
  assert.equal(relay.signal.sdp,'v=0');
},{timeout:14000});
test.after(async()=>{
  for(const c of clients){try{await c.close();}catch{}}
  await new Promise(resolve=>server.close(resolve));io.close();store.closeStore();
  fs.rmSync(dir,{recursive:true,force:true});
});
