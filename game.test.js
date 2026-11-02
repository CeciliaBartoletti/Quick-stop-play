'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {hand,normalize,freshRoom,nextTopic,beginRound,finishRound,publicState}=require('../game');
test('mani di cinque lettere senza doppioni e con ID univoci',()=>{
  for(let n=0;n<200;n++){
    const h=hand();assert.equal(h.length,5);
    assert.equal(new Set(h.map(c=>c.letter)).size,5);
    assert.equal(new Set(h.map(c=>c.id)).size,5);
  }
});
test('gestione lettere italiane e punteggi',()=>{
  assert.equal(normalize('  Èstate! '),'ESTATE!');
  const room=freshRoom('ABC123','Giulia','secret');
  room.players.push({id:'two',token:'two',name:'Sara',hand:[],score:0,wins:0});
  beginRound(room);assert.equal(room.phase,'playing');assert.equal(room.round,1);
  assert.equal(room.players[0].hand.length,5);
  const first=room.topic;nextTopic(room);assert.notEqual(first,room.topic);
  room.players[0].hand=[];room.players[1].hand=room.players[1].hand.slice(0,3);
  finishRound(room,room.players[0]);
  assert.equal(room.players[0].score,10);assert.equal(room.players[0].wins,1);
  assert.equal(room.players[1].score,2);assert.equal(room.phase,'finished');
});
test('mani private e stato pubblico',()=>{
  const r=freshRoom('ABC123','Giulia','secret');
  r.players.push({id:'other',name:'Sara',hand:hand(),score:3,wins:0,token:'private-token'});
  beginRound(r);
  const state=publicState(r,r.players[0],new Set([r.players[0].id]),new Set());
  assert.equal(state.you.hand.length,5);
  assert.equal(state.players[1].hand,undefined);
  assert.equal(state.players[1].token,undefined);
  assert.equal(state.hostId,r.players[0].id);
});
