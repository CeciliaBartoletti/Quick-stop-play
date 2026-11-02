'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'quickgirls.sqlite');
fs.mkdirSync(path.dirname(dbPath), {recursive:true});
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rooms_updated ON rooms(updated_at);');
const put = db.prepare('INSERT INTO rooms(code, data, updated_at) VALUES(?, ?, ?) ON CONFLICT(code) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at');
const del = db.prepare('DELETE FROM rooms WHERE code=?');
const list = db.prepare('SELECT data FROM rooms WHERE updated_at >= ?');
const pruneStatement = db.prepare('DELETE FROM rooms WHERE updated_at < ?');
const countStmt = db.prepare('SELECT COUNT(*) AS count FROM rooms');
function loadRooms() {
  const rooms = new Map();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  pruneStatement.run(cutoff);
  for (const row of list.all(cutoff)) {
    try { const room = JSON.parse(row.data); rooms.set(room.code,room); }
    catch (error) { console.error('Bad room row',error.message); }
  }
  return rooms;
}
function saveRoom(room) {room.updatedAt = Date.now(); put.run(room.code,JSON.stringify(room),room.updatedAt);}
function removeRoom(code) {del.run(code);}
function pruneRooms() {pruneStatement.run(Date.now() - 7 * 24 * 60 * 60 * 1000);}
function countRooms() {return countStmt.get().count;}
function closeStore() {db.close();}
module.exports = {dbPath,loadRooms,saveRoom,removeRoom,pruneRooms,countRooms,closeStore};
