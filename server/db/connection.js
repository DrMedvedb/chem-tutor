// server/db/connection.js
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// ⭐ Путь к БД — можно переопределить через переменную окружения (для Render)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'chem-tutor.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

console.log('📦 SQLite:', DB_PATH);
module.exports = db;