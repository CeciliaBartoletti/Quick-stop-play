'use strict';
const crypto = require('node:crypto');
const {classic, girls} = require('./topics');
const LETTERS = [...'ABCDEFGHILMNOPQRSTUVZ'];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 3;
const HAND_SIZE = 5;
const TOPIC_LIMIT = 3;
const randomId = () => crypto.randomBytes(16).toString('hex');
const randomCode = () => Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const text = (raw, max = 80) => (typeof raw === 'string' ? raw : '').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
const normalize = (raw) => text(raw,100).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^[^A-Za-z]+/g,'').toLocaleUpperCase('it-IT');
const hand = () => {
  const pool = [...LETTERS];
  return Array.from({length:HAND_SIZE},()=>{
    const i = crypto.randomInt(pool.length);
    const letter = pool.splice(i,1)[0];
    return {id:randomId(), letter};
  });
};
function freshRoom(code, name, token) {
  const id = randomId();
  return {
    code, phase:'lobby', mode:'written', pack:'mixed', hostId:id, round:0,
    players:[{id,token,name,hand:[],score:0,wins:0}], topic:'', topicNumber:0,
    usedTopics:[], answers:[], pending:null, winnerId:null, history:[],
    customTopics:[], lastSkip:0, createdAt:Date.now(), updatedAt:Date.now()
  };
}
function availableTopics(room) {
  const base = room.pack === 'classic' ? classic : room.pack === 'girls' ? girls : [...classic,...girls];
  return [...base,...room.customTopics];
}
function nextTopic(room) {
  const topics = availableTopics(room);
  let available = topics.filter(t => !room.usedTopics.includes(t));
  if (!available.length) { room.usedTopics = []; available = topics; }
  let candidates = available.filter(t => t !== room.topic);
  if (!candidates.length) candidates = available;
  const picked = candidates[crypto.randomInt(candidates.length)];
  room.topic = picked;
  room.usedTopics.push(picked);
  room.topicNumber += 1;
  room.answers = [];
  room.pending = null;
  room.lastSkip = Date.now();
}
function beginRound(room) {
  room.round += 1;
  room.phase = 'playing';
  room.winnerId = null;
  for (const p of room.players) p.hand = hand();
  nextTopic(room);
}
function finishRound(room, winner) {
  room.phase = 'finished';
  room.winnerId = winner.id;
  winner.wins += 1;
  const earned = room.players.map(p => {
    const points = HAND_SIZE - p.hand.length + (p.id === winner.id ? 5 : 0);
    p.score += points;
    return {id:p.id, name:p.name, points, total:p.score};
  });
  room.history.unshift({round:room.round, winnerId:winner.id, winnerName:winner.name, earned, at:Date.now()});
  room.history = room.history.slice(0,20);
}
function publicState(room, player, connected, activeMics) {
  return {
    code:room.code, phase:room.phase, mode:room.mode, pack:room.pack,
    hostId:room.hostId, round:room.round, topic:room.topic, topicNumber:room.topicNumber,
    answers:room.answers, pending:room.pending ? {id:room.pending.id, playerId:room.pending.playerId,
      playerName:room.pending.playerName, letter:room.pending.letter, answer:room.pending.answer,
      createdAt:room.pending.createdAt} : null,
    winnerId:room.winnerId, history:room.history.slice(0,5), customTopics:room.customTopics,
    players:room.players.map(p=>({id:p.id,name:p.name,score:p.score,wins:p.wins,
      cardsLeft:p.hand.length,connected:connected.has(p.id),micReady:activeMics.has(p.id)})),
    you: {id:player.id, hand:player.hand}
  };
}
module.exports = {LETTERS,MIN_PLAYERS,MAX_PLAYERS,HAND_SIZE,TOPIC_LIMIT,randomId,randomCode,text,normalize,hand,
  freshRoom,availableTopics,nextTopic,beginRound,finishRound,publicState};
