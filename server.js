'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {createWebSocketServer} = require('./ws');
const {
  MIN_PLAYERS,MAX_PLAYERS,TOPIC_LIMIT,randomId,randomCode,text,normalize,
  freshRoom,nextTopic,beginRound,finishRound,publicState
} = require('./game');
const store = require('./store');
const rooms = store.loadRooms();
const socketsByPlayer = new Map(); // in memoria, mai dentro SQLite
const activeMics = new Set();
const server = http.createServer(serveHttp);
const io = createWebSocketServer(server);
const PORT = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';
// Il relay TURN è opzionale: un server TURN è consigliato per audio WebRTC su reti restrittive.
const rtcIceServers = [{urls:'stun:stun.l.google.com:19302'}];
if(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  rtcIceServers.push({urls:process.env.TURN_URL.split(',').map(s=>s.trim()),username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
}
const presence = (p) => socketsByPlayer.has(p.id);
const playerBySocket = socket => {
  const room = rooms.get(socket.data.code);
  const player = room?.players.find(p=>p.id===socket.data.playerId);
  if (!room || !player || socketsByPlayer.get(player.id) !== socket.id) return null;
  return {room,player};
};
function notice(socket,msg) {socket.emit('notice',msg);}
function onlineIds(room) {return new Set(room.players.filter(p=>presence(p)).map(p=>p.id));}
function emitRoom(room) {
  const connected = onlineIds(room);
  const active = new Set(room.players.filter(p=>activeMics.has(p.id)).map(p=>p.id));
  for (const p of room.players) {
    const id = socketsByPlayer.get(p.id);
    if(id) io.to(id).emit('state',publicState(room,p,connected,active));
  }
}
function notifyRoom(room, msg) {io.to(room.code).emit('activity',msg);}
function saveAndEmit(room){store.saveRoom(room);emitRoom(room);}
function reassessHost(room){
  if (!room.players.some(p=>p.id===room.hostId && presence(p))) {
    room.hostId = room.players.find(p=>presence(p))?.id || room.players[0]?.id || null;
  }
}
function removePlayer(room,playerId) {
  const p = room.players.find(p=>p.id===playerId);
  if(!p) return;
  const sid = socketsByPlayer.get(p.id);
  if(sid){ const sock=io.sockets.sockets.get(sid); if(sock){sock.emit('removed','Sei uscita dalla stanza.');sock.data.code=null;sock.data.playerId=null;sock.leave(room.code);} }
  socketsByPlayer.delete(p.id);activeMics.delete(p.id);
  room.players = room.players.filter(item=>item.id!==p.id);
  if(room.pending?.playerId===p.id) room.pending=null;
  reassessHost(room);
  if(!room.players.length){rooms.delete(room.code);store.removeRoom(room.code);return;}
  if(room.phase==='playing' && room.players.length < 2){room.phase='finished';room.pending=null;room.winnerId=null;}
  saveAndEmit(room);
}
function limited(socket,key,max,ms){
  if(!socket.data.limits)socket.data.limits={};
  const now=Date.now(); const x=socket.data.limits[key]||{at:now,n:0};
  if(now-x.at>ms){x.at=now;x.n=0;}
  x.n++;socket.data.limits[key]=x;
  if(x.n>max){notice(socket,'Troppe azioni consecutive. Riprova tra poco.');return true;}
  return false;
}
function enter(socket,data,creating){
  if (limited(socket,'entry',12,60000))return;
  if(playerBySocket(socket))return notice(socket,'Esci dalla stanza attuale prima di entrare in un’altra.');
  const name=text(data?.name,20);
  if(name.length<2)return notice(socket,'Inserisci un nickname di almeno 2 caratteri.');
  let room;
  if(creating){
    if(rooms.size>=300)return notice(socket,'Ci sono troppe stanze attive, riprova più tardi.');
    let code; do{code=randomCode();}while(rooms.has(code));
    room=freshRoom(code,name,randomId()); rooms.set(code,room);
  } else {
    const code=text(data?.code,6).toUpperCase();room=rooms.get(code);
    if(!room)return notice(socket,'Stanza non trovata. Controlla il codice o chiedi un nuovo link.');
  }
  let p = room.players.find(x=>x.token===data?.token && typeof data.token==='string' && data.token.length>=20);
  if(!p){
    if(room.phase==='playing')return notice(socket,'La manche è già iniziata: chiedi di entrare dopo la manche.');
    if(room.players.length>=MAX_PLAYERS)return notice(socket,'Stanza piena: massimo 6 giocatrici.');
    if(creating)p=room.players[0];
    else {p={id:randomId(),token:randomId(),name,hand:[],score:0,wins:0};room.players.push(p);}
  }
  const previousSocketId = socketsByPlayer.get(p.id);
  // Non perdere i dati di una giocatrice quando passa dal telefono al computer.
  if(previousSocketId && previousSocketId!==socket.id){
    const prev=io.sockets.sockets.get(previousSocketId);
    if(prev){prev.emit('removed','Questa sessione è stata aperta su un altro dispositivo.');prev.leave(room.code);prev.data.code=null;prev.data.playerId=null;prev.disconnect(true);}
  }
  p.name=name;
  socket.data.code=room.code;socket.data.playerId=p.id;
  socketsByPlayer.set(p.id,socket.id);socket.join(room.code);
  reassessHost(room);
  socket.emit('joined',{code:room.code,token:p.token,id:p.id,name:p.name,rtcIceServers});
  saveAndEmit(room);
  notifyRoom(room,`${p.name} è online ✨`);
}
io.on('connection',socket=>{
  socket.on('create',data=>enter(socket,data,true));
  socket.on('join',data=>enter(socket,data,false));
  socket.on('mode',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||!['lobby','finished'].includes(s.room.phase))return;
    if(!['written','voice'].includes(data?.mode))return;
    if(data.mode!=='voice')for(const p of s.room.players)activeMics.delete(p.id);
    s.room.mode=data.mode;saveAndEmit(s.room);
  });
  socket.on('pack',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||!['lobby','finished'].includes(s.room.phase))return;
    if(!['mixed','classic','girls'].includes(data?.pack))return;
    s.room.pack=data.pack;saveAndEmit(s.room);
  });
  socket.on('customTopic',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||!['lobby','finished'].includes(s.room.phase))return;
    const topic=text(data?.topic,110);
    if(topic.length<8||topic.length>100||s.room.customTopics.length>=25)return notice(socket,'Inserisci un tema di 8–100 caratteri (massimo 25).');
    if(s.room.customTopics.some(x=>normalize(x)===normalize(topic)))return notice(socket,'Questo argomento è già stato aggiunto.');
    s.room.customTopics.push(topic);saveAndEmit(s.room);
  });
  socket.on('deleteTopic',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||!['lobby','finished'].includes(s.room.phase))return;
    const topic=text(data?.topic,110);s.room.customTopics=s.room.customTopics.filter(t=>t!==topic);saveAndEmit(s.room);
  });
  socket.on('start',()=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||!['lobby','finished'].includes(s.room.phase))return;
    const r=s.room;
    if(r.players.length<MIN_PLAYERS||r.players.length>MAX_PLAYERS||r.players.some(p=>!presence(p)))return notice(socket,'Servono 3–6 giocatrici, tutte collegate.');
    for(const p of r.players)activeMics.delete(p.id);
    beginRound(r);saveAndEmit(r);notifyRoom(r,'Nuova manche! Scegli una lettera ⚡');
  });
  socket.on('play',data=>{
    if(limited(socket,'play',8,5000))return;
    const s=playerBySocket(socket);if(!s||s.room.phase!=='playing')return;
    const {room:r,player:p}=s;
    if(r.pending)return notice(socket,'Una risposta è già in verifica.');
    if(Number(data?.topicNumber)!==r.topicNumber||Number(data?.round)!==r.round)return notice(socket,'L’argomento è cambiato: rileggi la frase!');
    const card=p.hand.find(c=>c.id===data?.cardId);
    if(!card)return notice(socket,'Questa carta non è più disponibile.');
    const answer=text(data?.answer,70);
    if(r.mode==='written' && !answer)return notice(socket,'Scrivi la risposta per giocare la carta.');
    if(answer && normalize(answer)[0]!==card.letter)return notice(socket,`La risposta deve iniziare per ${card.letter}.`);
    if(answer && r.answers.some(a=>normalize(a.answer)===normalize(answer)))return notice(socket,'Questa parola è già stata usata per il tema.');
    r.pending={id:randomId(),playerId:p.id,playerName:p.name,cardId:card.id,letter:card.letter,
      answer:answer || '(detta a voce)',topicNumber:r.topicNumber,createdAt:Date.now()};
    saveAndEmit(r);
  });
  socket.on('review',data=>{
    const s=playerBySocket(socket);if(!s||s.room.phase!=='playing'||s.room.hostId!==s.player.id)return;
    const r=s.room,pending=r.pending;
    if(!pending||pending.id!==data?.pendingId)return;
    r.pending=null;
    if(data?.accept===true){
      const author=r.players.find(p=>p.id===pending.playerId);
      const index=author?.hand.findIndex(c=>c.id===pending.cardId)??-1;
      if(author&&index>=0&&r.topicNumber===pending.topicNumber){
        author.hand.splice(index,1);
        r.answers.push({playerId:author.id,playerName:author.name,letter:pending.letter,answer:pending.answer});
        if(!author.hand.length){finishRound(r,author);for(const p of r.players)activeMics.delete(p.id);notifyRoom(r,`🏆 ${author.name} ha vinto la manche!`);}
        else if(r.answers.length>=TOPIC_LIMIT){nextTopic(r);notifyRoom(r,'🎲 Nuovo argomento!');}
      }
    }else notifyRoom(r,'Risposta rifiutata: carta non scartata.');
    saveAndEmit(r);
  });
  socket.on('skipTopic',()=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||s.room.phase!=='playing'||s.room.pending)return;
    if(Date.now()-s.room.lastSkip<10000)return notice(socket,'Aspetta 10 secondi prima di cambiare di nuovo tema.');
    nextTopic(s.room);saveAndEmit(s.room);notifyRoom(s.room,'La host ha cambiato argomento.');
  });
  socket.on('kick',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id||s.room.phase==='playing')return;
    const target=s.room.players.find(p=>p.id===data?.playerId);
    if(!target||target.id===s.player.id)return;
    removePlayer(s.room,target.id);
  });
  socket.on('transferHost',data=>{
    const s=playerBySocket(socket);if(!s||s.room.hostId!==s.player.id)return;
    const target=s.room.players.find(p=>p.id===data?.playerId);
    if(!target||!presence(target))return;
    s.room.hostId=target.id;saveAndEmit(s.room);
  });
  socket.on('leave',()=>{
    const s=playerBySocket(socket);if(s)removePlayer(s.room,s.player.id);
  });
  socket.on('audio:ready',data=>{
    const s=playerBySocket(socket);if(!s)return;
    if(s.room.mode!=='voice'||s.room.phase!=='playing')return;
    if(data?.ready===true)activeMics.add(s.player.id);else activeMics.delete(s.player.id);
    emitRoom(s.room);
  });
  socket.on('rtc:signal',data=>{
    if(limited(socket,'signal',120,10000))return;
    const s=playerBySocket(socket);if(!s||s.room.mode!=='voice'||s.room.phase!=='playing'||!activeMics.has(s.player.id))return;
    const target=s.room.players.find(p=>p.id===data?.to);
    if(!target||!activeMics.has(target.id))return;
    const type=data?.signal?.type;
    if(!['offer','answer','candidate'].includes(type))return;
    const json=JSON.stringify(data.signal);
    if(json.length>5000)return;
    const sid=socketsByPlayer.get(target.id);
    if(sid)io.to(sid).emit('rtc:signal',{from:s.player.id,signal:data.signal});
  });
  socket.on('disconnect',()=>{
    const room=rooms.get(socket.data.code);
    const player=room?.players.find(p=>p.id===socket.data.playerId);
    if(!player||socketsByPlayer.get(player.id)!==socket.id)return;
    socketsByPlayer.delete(player.id);activeMics.delete(player.id);
    reassessHost(room);saveAndEmit(room);
  });
});
// Segnala esplicitamente l'obbligo di una host collegata per le risposte in sospeso.
const timer=setInterval(()=>{
  const now=Date.now();
  for (const room of rooms.values()) {
    if(room.pending && now-room.pending.createdAt>45000){room.pending=null;saveAndEmit(room);notifyRoom(room,'Tempo scaduto: risposta non confermata.');}
  }
},5000);
timer.unref();
const cleanup=setInterval(()=>{
  store.pruneRooms();
  for(const [code,room] of rooms){
    if(Date.now()-room.updatedAt>7*24*3600000){rooms.delete(code);continue;}
    if(room.phase!=='playing'){
      for(const p of [...room.players])if(!presence(p) && room.players.length>1 && Date.now()-room.updatedAt>2*3600000)removePlayer(room,p.id);
    }
  }
},3600000);
cleanup.unref();
const staticRoot=path.join(__dirname,'public');
function serveHttp(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  if(url.pathname==='/health'){
    const output=JSON.stringify({ok:true,version:'2.0.0',rooms:rooms.size,persistence:true});
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?'':output);return;
  }
  if(url.pathname.startsWith('/api/room/')){
    const room=rooms.get(text(url.pathname.slice(10),6).toUpperCase());
    const output=room?{exists:true,players:room.players.length,phase:room.phase,joinable:room.phase!=='playing'&&room.players.length<6}:{exists:false};
    res.writeHead(room?200:404,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?'':JSON.stringify(output));return;
  }
  const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css',
    '/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest'};
  const filename=files[url.pathname];
  if(!filename){res.writeHead(404);res.end('Not found');return;}
  const types={'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml','png':'image/png','webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':(types[filename.split('.').pop()]||'application/octet-stream')+'; charset=utf-8',
    'Cache-Control':filename==='index.html'||filename==='sw.js'?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD'){res.end();return;}
  fs.createReadStream(path.join(staticRoot,filename)).on('error',()=>res.destroy()).pipe(res);
}
if(require.main===module)server.listen(PORT,host,()=>console.log(`⚡ Quick Girls http://localhost:${PORT} · DB ${store.dbPath}`));
module.exports={server,io,rooms,store};
