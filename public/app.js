'use strict';
(() => {
  const $ = id => document.getElementById(id);
  // WebSocket nativo con riconnessione automatica. Nessuna libreria esterna richiesta.
  const socket = (() => {
    const listeners = new Map();
    let ws=null, retry=500, closed=false;
    const api = {
      connected:false,
      on(event,callback){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(callback);},
      emit(event,data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:event,data}));}
    };
    const dispatch=(event,data)=>(listeners.get(event)||[]).forEach(fn=>{try{fn(data);}catch(e){console.error(e);}});
    function connect(){
      if(closed)return;
      ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
      ws.onopen=()=>{api.connected=true;retry=500;dispatch('connect');};
      ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(typeof m.type==='string')dispatch(m.type,m.data);}catch(error){console.warn('Messaggio non leggibile',error);}};
      ws.onclose=()=>{api.connected=false;dispatch('disconnect');if(!closed){setTimeout(connect,retry);retry=Math.min(retry*1.6,5000);}};
      ws.onerror=()=>{};
    }
    connect();return api;
  })();
  const roomFromUrl = new URLSearchParams(location.search).get('room')?.trim().toUpperCase() || '';
  const palettes = ['linear-gradient(140deg,#ff7fba,#ed4e97)','linear-gradient(145deg,#ae83fc,#7155e9)','linear-gradient(145deg,#7bd7fa,#418df2)','linear-gradient(145deg,#ffd16f,#f49d42)','linear-gradient(145deg,#74e1c5,#23b7a4)'];
  const stateData = {state:null, session:null, selectedCard:null, lastTopic:null, lastRound:null, pendingId:null, iceServers:[], audioStream:null, peers:new Map(), audioOn:false, muted:false, toastTimer:null, busy:false};
  const store = {
    get(k){try{return localStorage.getItem(k);}catch{return null;}},
    set(k,v){try{localStorage.setItem(k,v);}catch{}},
    del(k){try{localStorage.removeItem(k);}catch{}}
  };
  const roomKey=code=>`quickgirls-v2-room-${code}`;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const visible=(id,show)=>{$(id).hidden=!show;};
  const me=()=>stateData.state?.you?.id;
  const isHost=()=>stateData.state?.hostId===me();
  const send=(ev,data={})=>{if(!socket.connected){toast('Connessione non disponibile. Riprova tra poco.');return;}socket.emit(ev,data);};
  function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(stateData.toastTimer);stateData.toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
  function savedSession(code){if(!code)return null;try{return JSON.parse(store.get(roomKey(code))||'null');}catch{return null;}}
  function saveSession(obj){stateData.session=obj;store.set(roomKey(obj.code),JSON.stringify(obj));store.set('quickgirls-last',obj.code);store.set('quickgirls-name',obj.name);}
  function cleanSession(){const code=stateData.session?.code; if(code)store.del(roomKey(code));store.del('quickgirls-last');stateData.session=null;stateData.state=null;stateData.selectedCard=null;stateData.pendingId=null;stopAudio(false);history.replaceState(null,'','/');visible('welcome',true);visible('game',false);$('joinCode').value='';}
  function connectAsSaved(){if(!stateData.session||!socket.connected)return;socket.emit('join',{code:stateData.session.code,token:stateData.session.token,name:stateData.session.name});}
  function handleEnter(create){
    if(stateData.busy)return;
    const name=$('nickname').value.trim();
    if(name.length<2){toast('Scrivi un nickname di almeno 2 caratteri.');$('nickname').focus();return;}
    store.set('quickgirls-name',name);
    if(!socket.connected)return toast('Non sei online. Verifica la connessione.');
    const code=$('joinCode').value.trim().toUpperCase();
    if(!create&&code.length!==6)return toast('Inserisci un codice di 6 caratteri.');
    stateData.busy=true;setTimeout(()=>stateData.busy=false,700);
    socket.emit(create?'create':'join',create?{name}:{name,code,token:savedSession(code)?.token});
  }
  $('nickname').value=store.get('quickgirls-name')||'';
  $('joinCode').value=roomFromUrl||'';
  const initialCode=roomFromUrl||store.get('quickgirls-last');
  const prevSession=savedSession(initialCode);
  if(prevSession)stateData.session=prevSession;
  $('createBtn').addEventListener('click',()=>handleEnter(true));
  $('joinBtn').addEventListener('click',()=>handleEnter(false));
  ['nickname','joinCode'].forEach(id=>$(id).addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();handleEnter(id==='nickname' && !$('joinCode').value.trim());}}));
  $('shareBtn').addEventListener('click',async()=>{
    if(!stateData.session)return;
    const url=new URL('/',location.origin);url.searchParams.set('room',stateData.session.code);
    const link=url.toString();
    if(navigator.share){try{await navigator.share({title:'Giochiamo a Quick Girls! ⚡',text:`Entra nella stanza ${stateData.session.code} 💖`,url:link});return;}catch(e){if(e.name==='AbortError')return;}}
    try{await navigator.clipboard.writeText(link);toast('Link copiato! Condividilo nella chat 💗');}catch{window.prompt('Copia questo link e mandalo alle amiche:',link);}
  });
  $('leaveBtn').addEventListener('click',()=>{if(!confirm('Vuoi davvero uscire dalla stanza? Perderai il posto nella partita.'))return;send('leave');cleanSession();});
  $('modeWritten').addEventListener('click',()=>send('mode',{mode:'written'}));
  $('modeVoice').addEventListener('click',()=>send('mode',{mode:'voice'}));
  $('modeWrittenResults').addEventListener('click',()=>send('mode',{mode:'written'}));
  $('modeVoiceResults').addEventListener('click',()=>send('mode',{mode:'voice'}));
  document.querySelectorAll('[data-pack]').forEach(el=>el.addEventListener('click',()=>send('pack',{pack:el.dataset.pack})));
  $('startBtn').addEventListener('click',()=>send('start'));
  $('againBtn').addEventListener('click',()=>send('start'));
  $('addTopicBtn').addEventListener('click',()=>{const value=$('customTopicInput').value.trim();send('customTopic',{topic:value});$('customTopicInput').value='';});
  $('customTopicInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('addTopicBtn').click();});
  $('skipBtn').addEventListener('click',()=>{if(confirm('Cambiamo l’argomento per tutte?'))send('skipTopic');});
  $('playBtn').addEventListener('click',()=>{
    const s=stateData.state;
    if(!s||s.phase!=='playing'||s.pending)return;
    if(!stateData.selectedCard){toast('Seleziona una carta-lettera prima!');return;}
    const answer=$('answerInput').value.trim();
    if(s.mode==='written'&&!answer){toast('Scrivi una risposta.');$('answerInput').focus();return;}
    send('play',{cardId:stateData.selectedCard,answer,topicNumber:s.topicNumber,round:s.round});
  });
  $('answerInput').addEventListener('keydown',e=>{if(e.key==='Enter'){$('playBtn').click();e.preventDefault();}});
  const review=accept=>{const pending=stateData.state?.pending;if(pending)send('review',{pendingId:pending.id,accept});};
  $('acceptBtn').addEventListener('click',()=>review(true));
  $('rejectBtn').addEventListener('click',()=>review(false));
  const dialog=$('helpDialog');
  $('helpBtn').addEventListener('click',()=>dialog.showModal());
  $('closeHelp').addEventListener('click',()=>dialog.close());
  $('okayHelp').addEventListener('click',()=>dialog.close());
  $('audioBtn').addEventListener('click',()=>stateData.audioOn?stopAudio(true):startAudio());
  $('muteBtn').addEventListener('click',()=>{
    stateData.muted=!stateData.muted;
    stateData.audioStream?.getAudioTracks().forEach(t=>t.enabled=!stateData.muted);
    renderAudio();
  });
  function renderStatus(online){
    $('connection').classList.toggle('online',online);
    $('connection').classList.toggle('offline',!online);
    $('connection').lastChild.textContent=online?' Online':' Offline';
    visible('connectionWarning',!!stateData.session&&!online);
  }
  socket.on('connect',()=>{renderStatus(true);stateData.busy=false;connectAsSaved();});
  socket.on('disconnect',()=>{renderStatus(false);stopAudio(false);});
  socket.on('joined',d=>{
    stateData.busy=false;
    stateData.iceServers=d.rtcIceServers||[];
    saveSession({code:d.code,token:d.token,name:d.name,id:d.id});
    history.replaceState(null,'',`/?room=${encodeURIComponent(d.code)}`);
    $('joinCode').value=d.code;
    visible('welcome',false);visible('game',true);
  });
  socket.on('removed',msg=>{toast(msg);cleanSession();});
  socket.on('notice',msg=>{stateData.busy=false;toast(msg);if(typeof msg==='string'&&msg.startsWith('Stanza non trovata'))cleanSession();});
  socket.on('activity',msg=>{if(stateData.state)toast(msg);});
  socket.on('state',s=>{
    const old=stateData.state;
    if(old && (s.topicNumber!==old.topicNumber||s.round!==old.round)){$('answerInput').value='';stateData.selectedCard=null;}
    if(old?.pending && !s.pending && old.pending.playerId===me())$('answerInput').value='';
    if(s.phase!=='playing'||s.mode!=='voice')stopAudio(false);
    stateData.state=s;
    const isSelectedPresent=s.you.hand.some(c=>c.id===stateData.selectedCard);
    if(!isSelectedPresent)stateData.selectedCard=s.you.hand[0]?.id||null;
    render();
    if(stateData.audioOn)syncPeers();
  });
  function playerRow(p,i,controls=false){
    const row=node('div',undefined,'player');
    const avatar=node('div',p.name?.charAt(0).toUpperCase()||'✨',`avatar p${i%6}`);
    const body=node('div',undefined,'player-main');
    const nameRow=node('div',p.name,'player-name');
    if(p.id===me())nameRow.append(node('span',' (tu)'));
    if(p.id===stateData.state.hostId)nameRow.append(node('span',' 👑'));
    const extra=node('div',`${p.connected?'🟢 Online':'⚪ Offline'} · ${p.score} punti · ${p.cardsLeft} carte`,'player-sub');
    body.append(nameRow,extra);row.append(avatar,body);
    if(controls && isHost() && p.id!==me()){
      const actions=node('div',undefined,'player-actions');
      if(p.connected){const pass=node('button','👑 Host','micro-btn');pass.title=`Passa il ruolo di host a ${p.name}`;pass.onclick=()=>{if(confirm(`Passare la gestione della partita a ${p.name}?`))send('transferHost',{playerId:p.id});};actions.append(pass);}
      if(stateData.state.phase!=='playing'){const kick=node('button','✕ Rimuovi','micro-btn danger');kick.onclick=()=>{if(confirm(`Rimuovere ${p.name} dalla stanza?`))send('kick',{playerId:p.id});};actions.append(kick);}
      row.append(actions);
    }
    return row;
  }
  function leaderboard(target){
    const list=[...stateData.state.players].sort((a,b)=>b.score-a.score||b.wins-a.wins||a.name.localeCompare(b.name));
    const output=list.map((p,i)=>{
      const row=node('div',undefined,'rank-row');
      row.append(node('span',i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`,'rank-number'),node('span',p.name,'rank-name'),node('span',`${p.score} pt`,'rank-score'));
      return row;
    });$(target).replaceChildren(...output);
  }
  function render(){
    const s=stateData.state;if(!s)return;
    visible('welcome',false);visible('game',true);
    $('roomCode').textContent=s.code;
    $('roomPhase').textContent=s.phase==='lobby'?'LOBBY':s.phase==='playing'?'IN GIOCO':'FINE MANCHE';
    visible('lobby',s.phase==='lobby');visible('playArea',s.phase==='playing');visible('resultsArea',s.phase==='finished');
    const offline=s.players.filter(p=>!p.connected);
    visible('offlineWarning',offline.length>0);
    $('offlineWarning').textContent=offline.length?`⚠️ Offline: ${offline.map(p=>p.name).join(', ')}. Puoi aspettare il loro rientro.`:'';
    renderLobby(s);
    if(s.phase==='playing')renderPlaying(s);
    if(s.phase==='finished')renderResults(s);
  }
  function renderLobby(s){
    $('playerCount').textContent=`${s.players.length}/6`;
    $('lobbyPlayers').replaceChildren(...s.players.map((p,i)=>playerRow(p,i,true)));
    $('readyMessage').textContent=s.players.length<3?'Invita almeno 2 amiche (servono almeno 3 giocatrici).':s.players.some(p=>!p.connected)?'Aspetta che tutte siano connesse.':'Tutte pronte! La host può iniziare 🎉';
    const canConfigure=isHost();
    visible('hostSetup',canConfigure);
    visible('guestWaiting',!canConfigure);
    visible('topicEditor',canConfigure);
    $('modeWritten').classList.toggle('selected',s.mode==='written');
    $('modeVoice').classList.toggle('selected',s.mode==='voice');
    document.querySelectorAll('[data-pack]').forEach(el=>el.classList.toggle('selected',el.dataset.pack===s.pack));
    $('startBtn').disabled=s.players.length<3||s.players.some(p=>!p.connected)||!socket.connected;
    $('startBtn').textContent=`⚡ Iniziamo! (${s.players.length}/6)`;
    const tags=s.customTopics.map(t=>{const tag=node('div',t,'topic-tag');if(canConfigure){const b=node('button','✕');b.title='Rimuovi argomento';b.onclick=()=>send('deleteTopic',{topic:t});tag.append(b);}return tag;});
    if(!tags.length)tags.push(node('p','Nessun tema personalizzato per ora.','tiny'));
    $('customTopics').replaceChildren(...tags);
  }
  function renderPlaying(s){
    $('topicText').textContent=s.topic;
    $('roundTag').textContent=`MANCHE ${s.round}`;
    $('progressLabel').textContent=`${s.answers.length} di 3 risposte`;
    $('topicProgress').replaceChildren(...[0,1,2].map(i=>{const el=node('div');if(i<s.answers.length)el.classList.add('done');return el;}));
    $('topicAnswers').replaceChildren(...s.answers.map(a=>node('span',`${a.letter} · ${a.answer} (${a.playerName})`,'answer-bubble')));
    visible('hostTopicActions',isHost()&&!s.pending);
    $('cardsRemaining').textContent=`${s.you.hand.length} rimaste`;
    $('playInstruction').textContent=s.mode==='written'?'Tocca una delle tue lettere e scrivi una risposta che inizi con quella lettera.':'Dì una parola che inizi con la lettera scelta. Poi registra il tuo scarto: la host confermerà.';
    $('answerLabel').textContent=s.mode==='written'?'LA TUA RISPOSTA':'PAROLA DETTA (FACOLTATIVA)';
    $('answerInput').placeholder=s.mode==='written'?'Es. Mascara':'Puoi anche lasciare vuoto…';
    visible('voiceTip',s.mode==='voice');
    $('playBtn').textContent=s.mode==='written'?'⚡ Gioca questa carta':'🎤 Ho detto la parola!';
    const cards=s.you.hand.map((c,i)=>{
      const b=node('button',c.letter,'letter-card');b.type='button';b.style.setProperty('--color',palettes[i%palettes.length]);
      b.classList.toggle('chosen',c.id===stateData.selectedCard);b.title=`Carta ${c.letter}`;
      b.setAttribute('aria-pressed',c.id===stateData.selectedCard?'true':'false');
      b.disabled=!!s.pending||!socket.connected;
      b.onclick=()=>{stateData.selectedCard=c.id;renderCardsOnly();};return b;
    });
    if(!cards.length)cards.push(node('div','Hai finito le carte! Aspettiamo la classifica 🥳','empty-hand'));
    $('hand').replaceChildren(...cards);
    $('answerInput').disabled=!!s.pending||!socket.connected||s.you.hand.length===0;
    $('playBtn').disabled=!!s.pending||!socket.connected||s.you.hand.length===0;
    $('liveModeBadge').textContent=s.mode==='written'?'⌨️ Scritto':'🎙️ Voce';
    $('livePlayers').replaceChildren(...s.players.map((p,i)=>{
      const el=playerRow(p,i,true);
      if(s.mode==='voice' && p.micReady)el.querySelector('.player-sub').append(node('span',' · 🎙 Audio attivo'));
      return el;
    }));
    const pending=s.pending;
    visible('reviewCard',!!pending);
    if(pending){
      $('pendingName').textContent=`${pending.playerName} propone la ${pending.letter}`;
      $('pendingAnswer').textContent=pending.answer;
      $('pendingDetail').textContent=isHost()?'La parola inizia con la lettera ed è pertinente al tema?':'Aspettiamo la conferma della host…';
      visible('reviewControls',isHost());
    }
    visible('audioCard',s.mode==='voice');
    renderAudio();
    leaderboard('gameLeaderboard');
  }
  function renderCardsOnly(){document.querySelectorAll('.letter-card').forEach((el,i)=>{const selected=stateData.state.you.hand[i]?.id===stateData.selectedCard;el.classList.toggle('chosen',selected);el.setAttribute('aria-pressed',String(selected));});}
  function renderResults(s){
    const winner=s.players.find(p=>p.id===s.winnerId);
    $('winnerText').textContent=winner?`${winner.name} ha vinto! 🎊`:'Manche conclusa';
    const last=s.history[0];
    $('roundResults').replaceChildren(...(last?.earned||[]).sort((a,b)=>b.points-a.points).map(p=>{const row=node('div',undefined,'results-item');row.append(node('span',p.name),node('strong',`+${p.points} punti`));return row;}));
    visible('hostResults',isHost());visible('guestResults',!isHost());
    $('againBtn').disabled=s.players.length<3||s.players.some(p=>!p.connected);
    $('modeWrittenResults').classList.toggle('selected',s.mode==='written');
    $('modeVoiceResults').classList.toggle('selected',s.mode==='voice');
    leaderboard('finalLeaderboard');
  }
  function renderAudio(){
    const on=stateData.audioOn;
    $('audioBadge').textContent=on?'🎙️ Audio attivo':'Audio spento';
    $('audioBtn').textContent=on?'📴 Esci dall’audio':'🎙️ Attiva audio';
    visible('muteBtn',on);
    $('muteBtn').textContent=stateData.muted?'🔊 Riattiva':'🔇 Silenzia';
    $('audioStatus').textContent=on?(stateData.muted?'Microfono silenziato.':`Microfono acceso · ${stateData.peers.size} connessioni audio`):'L’accesso al microfono richiede HTTPS e il permesso del telefono.';
  }

  // Mini stanza audio WebRTC: nessun file registrato e nessun audio salvato.
  async function startAudio(){
    if(stateData.audioOn)return;
    if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)return toast('Il tuo browser non supporta l’audio integrato. Usate una chiamata esterna.');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      stateData.audioStream=stream;stateData.audioOn=true;stateData.muted=false;
      send('audio:ready',{ready:true});renderAudio();syncPeers();toast('Microfono attivo 🎙️');
    }catch(e){toast('Microfono non disponibile. Controlla i permessi del telefono o usa una chiamata esterna.');}
  }
  function closePeer(id){
    const pc=stateData.peers.get(id);if(pc){pc.close();stateData.peers.delete(id);}
    document.getElementById(`remote-${id}`)?.remove();
  }
  function stopAudio(signal){
    if(signal&&stateData.audioOn&&socket.connected)send('audio:ready',{ready:false});
    for(const id of [...stateData.peers.keys()])closePeer(id);
    stateData.audioStream?.getTracks().forEach(t=>t.stop());stateData.audioStream=null;
    stateData.audioOn=false;stateData.muted=false;
    renderAudio();
  }
  function getPeer(remoteId){
    if(stateData.peers.has(remoteId))return stateData.peers.get(remoteId);
    const pc=new RTCPeerConnection({iceServers:stateData.iceServers.length?stateData.iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    pc._candidateQueue=[];pc._offered=false;
    stateData.audioStream.getTracks().forEach(track=>pc.addTrack(track,stateData.audioStream));
    pc.onicecandidate=event=>{if(event.candidate)send('rtc:signal',{to:remoteId,signal:{type:'candidate',candidate:event.candidate}});};
    pc.ontrack=event=>{
      let audio=document.getElementById(`remote-${remoteId}`);
      if(!audio){audio=document.createElement('audio');audio.id=`remote-${remoteId}`;audio.autoplay=true;audio.playsInline=true;$('remoteAudio').append(audio);}
      audio.srcObject=event.streams[0]||new MediaStream([event.track]);
      audio.play().catch(()=>{toast('Tocca lo schermo o attiva l’audio per ascoltare le altre.');});
    };
    pc.onconnectionstatechange=()=>{
      if(['closed','failed'].includes(pc.connectionState))closePeer(remoteId);
      renderAudio();
    };
    stateData.peers.set(remoteId,pc);return pc;
  }
  async function syncPeers(){
    if(!stateData.audioOn||!stateData.state)return;
    const selfId=me();
    const ready=stateData.state.players.filter(p=>p.id!==selfId&&p.micReady&&p.connected).map(p=>p.id);
    for(const id of [...stateData.peers.keys()])if(!ready.includes(id))closePeer(id);
    for(const id of ready){
      const pc=getPeer(id);
      if(selfId<id&&!pc._offered&&pc.signalingState==='stable'){
        pc._offered=true;
        try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);send('rtc:signal',{to:id,signal:{type:'offer',sdp:offer.sdp}});}catch(e){closePeer(id);}
      }
    }
    renderAudio();
  }
  socket.on('rtc:signal',async({from,signal})=>{
    if(!stateData.audioOn||!stateData.state?.players.some(p=>p.id===from&&p.micReady))return;
    const pc=getPeer(from);
    try{
      if(signal.type==='offer'){
        if(pc.signalingState!=='stable')return;
        await pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
        for(const c of pc._candidateQueue.splice(0))await pc.addIceCandidate(c);
        const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
        send('rtc:signal',{to:from,signal:{type:'answer',sdp:answer.sdp}});
      }else if(signal.type==='answer'){
        if(pc.signalingState!=='have-local-offer')return;
        await pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
        for(const c of pc._candidateQueue.splice(0))await pc.addIceCandidate(c);
      }else if(signal.type==='candidate'&&signal.candidate){
        if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);
        else pc._candidateQueue.push(signal.candidate);
      }
    }catch(e){console.warn('Audio WebRTC:',e.message);}
  });
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
})();
