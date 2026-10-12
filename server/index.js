// server/index.js
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const initDb = require('./db/init');
const apiRoutes = require('./routes/api');
const db = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// ⭐ Для работы за прокси (туннель, Render и т.п.)
app.set('trust proxy', 1);

initDb();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ⭐ SESSION_SECRET: из env, иначе генерируем при старте
const SESSION_SECRET = process.env.SESSION_SECRET
  || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.log('⚠️  SESSION_SECRET не задан — сгенерирован случайный.');
  console.log('   При перезапуске сервера все сессии сбросятся.');
  console.log('   Для постоянных сессий создай .env с SESSION_SECRET=...');
}

// ⭐ Сессия с auto-secure — работает и на localhost, и за HTTPS-туннелем
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: 'auto',        // ⭐ secure только если req.secure (HTTPS)
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7  // 7 дней
  }
}));

app.use('/api', apiRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res) => res.status(404).send('Not found'));

// ⭐ АВТООЧИСТКА КОРЗИНЫ
const TRASH_DAYS = 30;
const CLEAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

function cleanTrash() {
  try {
    const result = db.prepare(`
      DELETE FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < datetime('now', '-' || ? || ' days')
    `).run(TRASH_DAYS);

    if (result.changes > 0) {
      console.log(`🔥 Автоочистка: удалено ${result.changes} аккаунтов старше ${TRASH_DAYS} дней`);
    }
  } catch (e) {
    console.error('cleanTrash error:', e);
  }
}

cleanTrash();
setInterval(cleanTrash, CLEAN_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`🧪 Chem-tutor: http://localhost:${PORT}`);
  console.log(`🗑 Автоочистка корзины: каждые 24 часа (срок ${TRASH_DAYS} дней)`);
});