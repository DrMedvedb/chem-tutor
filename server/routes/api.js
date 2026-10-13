// server/routes/api.js
const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db/connection');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ANSWER_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'answers');
if (!fs.existsSync(ANSWER_UPLOAD_DIR)) fs.mkdirSync(ANSWER_UPLOAD_DIR, { recursive: true });

const CHAT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

const VALID_GRADES = ['junior', '8', '9', '10', '11', 'adult'];
function isValidGrade(g) {
  return g === null || g === undefined || g === '' || VALID_GRADES.includes(g);
}
function normalizeGrade(g) {
  if (g === null || g === undefined || g === '') return null;
  return VALID_GRADES.includes(g) ? g : null;
}

const TUTOR_AVATARS = [
  '🧑‍🔬','👨‍🏫','👩‍🏫','🧙‍♂️','🧙‍♀️','🧑‍⚖️','👨‍🎓','👩‍🎓','👨‍💼','👩‍💼',
  '🔬','⚗️','⚛️','📚','📖','✏️','🎓','📐','🧭','🏛️'
];
const STUDENT_AVATARS = [
  '🧑‍🔬','🧑‍🎓','👨‍🎓','👩‍🎓','🧒','👦','👧','🧪','⚗️','🔬',
  '⚛️','🧬','💧','🔥','🌟','✨','💎','🎯','🚀','🦉','🐧','🦊','🐝','🐙'
];

function randomAvatar(role) {
  const pool = role === 'tutor' ? TUTOR_AVATARS : STUDENT_AVATARS;
  return {
    avatar: pool[Math.floor(Math.random() * pool.length)],
    avatar_bg: Math.floor(Math.random() * 12)
  };
}

function isTutor(req) {
  return !!(req.session && req.session.userId && req.session.role === 'tutor');
}
function isStudent(req) {
  return !!(req.session && req.session.userId && req.session.role === 'student');
}
function isModerator(req) {
  return !!(req.session && req.session.userId && req.session.role === 'moderator');
}

const LAST_SEEN_CACHE = new Map();
const LAST_SEEN_TTL_MS = 60 * 1000;

function touchLastSeen(userId) {
  const now = Date.now();
  const last = LAST_SEEN_CACHE.get(userId) || 0;
  if (now - last < LAST_SEEN_TTL_MS) return;
  LAST_SEEN_CACHE.set(userId, now);
  try {
    db.prepare("UPDATE users SET last_seen = datetime('now') WHERE id = ?").run(userId);
  } catch (e) {}
}

const ELEMENTS = [
  'hydrogen','helium','lithium','beryllium','boron','carbon','nitrogen','oxygen',
  'fluorine','neon','sodium','magnesium','aluminium','silicon','phosphorus','sulfur',
  'chlorine','argon','potassium','calcium','scandium','titanium','vanadium','chromium',
  'manganese','iron','cobalt','nickel','copper','zinc','gallium','germanium','arsenic',
  'selenium','bromine','krypton','rubidium','strontium','yttrium','zirconium','niobium',
  'molybdenum','technetium','ruthenium','rhodium','palladium','silver','cadmium','indium',
  'tin','antimony','tellurium','iodine','xenon','caesium','barium','lanthanum','cerium',
  'praseodymium','neodymium','promethium','samarium','europium','gadolinium','terbium',
  'dysprosium','holmium','erbium','thulium','ytterbium','lutetium','hafnium','tantalum',
  'tungsten','rhenium','osmium','iridium','platinum','gold','mercury','thallium','lead',
  'bismuth','polonium','astatine','radon','francium','radium','actinium','thorium',
  'protactinium','uranium','neptunium','plutonium'
];

function generateUniqueLogin() {
  for (let i = 0; i < 100; i++) {
    let login = '';
    for (let j = 0; j < 8; j++) login += Math.floor(Math.random() * 10);
    if (login[0] === '0') continue;
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(login);
    if (!exists) return login;
  }
  throw new Error('Не удалось сгенерировать уникальный логин');
}

function generateUniquePassword() {
  for (let i = 0; i < 200; i++) {
    const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    let digits = '';
    for (let j = 0; j < 4; j++) digits += Math.floor(Math.random() * 10);
    const pwd = el + digits;
    const exists = db.prepare('SELECT 1 FROM used_passwords WHERE plain_password = ?').get(pwd);
    if (!exists) return pwd;
  }
  throw new Error('Не удалось сгенерировать уникальный пароль');
}

function ownsTopic(topicId, tutorId) {
  const row = db.prepare('SELECT id FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, tutorId);
  return !!row;
}

function canSeeMaterials(studentId, topicId) {
  const topic = db.prepare('SELECT is_welcome, grade FROM topics WHERE id = ?').get(topicId);
  if (!topic) return false;
  if (topic.is_welcome === 1) return true;

  const student = db.prepare('SELECT grade FROM users WHERE id = ?').get(studentId);
  if (student && student.grade && topic.grade && student.grade === topic.grade) {
    return true;
  }

  const row = db.prepare(`
    SELECT can_materials FROM topic_access
    WHERE student_id = ? AND topic_id = ?
  `).get(studentId, topicId);
  return !!(row && row.can_materials === 1);
}

function canTakeTest(studentId, topicId) {
  const topic = db.prepare('SELECT is_welcome, grade FROM topics WHERE id = ?').get(topicId);
  if (!topic) return false;
  if (topic.is_welcome === 1) return true;

  const student = db.prepare('SELECT grade FROM users WHERE id = ?').get(studentId);
  if (student && student.grade && topic.grade && student.grade === topic.grade) {
    return true;
  }

  const row = db.prepare(`
    SELECT can_test FROM topic_access
    WHERE student_id = ? AND topic_id = ?
  `).get(studentId, topicId);
  return !!(row && row.can_test === 1);
}

function isWelcomeTopic(topicId) {
  const row = db.prepare('SELECT is_welcome FROM topics WHERE id = ?').get(topicId);
  return !!(row && row.is_welcome === 1);
}

function serializeQuestionForStudent(q) {
  const base = {
    id: q.id,
    position: q.position,
    text: q.text,
    type: q.type || 'single'
  };
  if (base.type === 'open') return base;
  const options = q.options_json ? JSON.parse(q.options_json) : [];
  return { ...base, options };
}

function serializeQuestionForTutor(q) {
  return {
    id: q.id,
    test_id: q.test_id,
    position: q.position,
    text: q.text,
    type: q.type || 'single',
    options: q.options_json ? JSON.parse(q.options_json) : [],
    correct: q.correct_json ? JSON.parse(q.correct_json) : [],
    correct_text: q.correct_text || '',
    option_a: q.option_a, option_b: q.option_b,
    option_c: q.option_c, option_d: q.option_d,
    correct_legacy: q.correct
  };
}

function createWelcomeTopicForTutor(tutorId) {
  try {
    const exists = db.prepare(
      'SELECT id FROM topics WHERE tutor_id = ? AND is_welcome = 1'
    ).get(tutorId);
    if (exists) return;

    const info = db.prepare(`
      INSERT INTO topics (tutor_id, title, description, position, is_welcome, grade)
      VALUES (?, ?, ?, ?, 1, NULL)
    `).run(tutorId, 'Введение', 'Знакомство с платформой', -1);

    db.prepare(`
      INSERT INTO materials (topic_id, title, type, content, position)
      VALUES (?, ?, 'text', ?, 0)
    `).run(
      info.lastInsertRowid,
      'Добро пожаловать на платформу «Алхимичка»!',
      `Добро пожаловать на платформу «Алхимичка»!

Здесь вы будете:
📚 Изучать темы, которые для вас открывает учитель
🧪 Проходить тесты и получать мгновенные результаты
📊 Следить за своим прогрессом в истории попыток
💬 Задавать вопросы учителю в чате

Что делать сейчас:
1. Прочитайте этот материал до конца
2. Откройте раздел «📚 Мои темы» — там появятся темы, когда учитель откроет вам доступ
3. Если понадобится помощь — пишите учителю в 💬 Чат

Удачи! 🚀`
    );
  } catch (e) {
    console.error('createWelcomeTopicForTutor error:', e);
  }
}

router.post('/register-tutor', (req, res) => {
  const { username, password, display_name } = req.body || {};
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'Логин минимум 3 символа' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });

  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Такой логин уже занят' });

  const { avatar, avatar_bg } = randomAvatar('tutor');
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    "INSERT INTO users (username, password_hash, role, display_name, avatar, avatar_bg, last_seen) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(username, hash, 'tutor', display_name, avatar, avatar_bg);

  req.session.userId = Number(info.lastInsertRowid);
  req.session.role = 'tutor';
  req.session.displayName = display_name;

  createWelcomeTopicForTutor(req.session.userId);

  res.json({
    ok: true,
    user: { id: req.session.userId, username, display_name, role: 'tutor', avatar, avatar_bg }
  });
});

// ═══════════════════════════════════════════════════
//  ЗАЯВКИ УЧИТЕЛЕЙ
// ═══════════════════════════════════════════════════

// POST /api/tutor-applications — публичный, приём заявки
router.post('/tutor-applications', (req, res) => {
  const { full_name, email, desired_login, password } = req.body || {};

  const name  = String(full_name || '').trim();
  const mail  = String(email || '').trim().toLowerCase();
  const login = String(desired_login || '').trim();
  const pwd   = String(password || '');

  if (name.length < 2) {
    return res.status(400).json({ error: 'Введите имя и фамилию (минимум 2 символа)' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }
  if (!/^[A-Za-z0-9_.\-]{3,30}$/.test(login)) {
    return res.status(400).json({ error: 'Логин: 3–30 символов, только латиница, цифры, _ - .' });
  }
  if (pwd.length < 6) {
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  }

  // Логин не занят в users
  const loginInUsers = db.prepare('SELECT 1 FROM users WHERE username = ?').get(login);
  if (loginInUsers) {
    return res.status(400).json({ error: 'Такой логин уже занят' });
  }

  // Логин не занят в активных заявках
  const loginInApps = db.prepare(`
    SELECT 1 FROM tutor_applications
    WHERE desired_login = ? AND status IN ('new','approved')
  `).get(login);
  if (loginInApps) {
    return res.status(400).json({ error: 'Заявка с таким логином уже есть' });
  }

  // Email не занят в users
  const emailInUsers = db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail);
  if (emailInUsers) {
    return res.status(400).json({ error: 'Этот email уже используется' });
  }

  // Email не занят в активных заявках
  const emailInApps = db.prepare(`
    SELECT 1 FROM tutor_applications
    WHERE email = ? AND status IN ('new','approved')
  `).get(mail);
  if (emailInApps) {
    return res.status(400).json({ error: 'Заявка с таким email уже есть' });
  }

  const hash = bcrypt.hashSync(pwd, 10);
  const info = db.prepare(`
    INSERT INTO tutor_applications (full_name, email, desired_login, password_hash, status)
    VALUES (?, ?, ?, ?, 'new')
  `).run(name, mail, login, hash);

  res.json({ ok: true, application_id: Number(info.lastInsertRowid) });
});

// GET /api/moder/tutor-applications — список заявок (модер)
router.get('/moder/tutor-applications', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT id, full_name, email, desired_login, status, reject_reason,
           created_user_id, reviewed_by, reviewed_at, created_at
    FROM tutor_applications
  `;
  const params = [];
  if (['new','approved','rejected'].includes(status)) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ` ORDER BY
    CASE status WHEN 'new' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
    id DESC`;

  const rows = db.prepare(sql).all(...params);
  res.json({ applications: rows });
});

// GET /api/moder/tutor-applications/count — счётчик новых (модер)
router.get('/moder/tutor-applications/count', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM tutor_applications WHERE status = 'new'"
  ).get();
  res.json({ count: row.c });
});

// POST /api/moder/tutor-applications/:id/approve — одобрить
router.post('/moder/tutor-applications/:id/approve', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const id = Number(req.params.id);
  const app = db.prepare('SELECT * FROM tutor_applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: 'Заявка не найдена' });
  if (app.status !== 'new') {
    return res.status(400).json({ error: 'Заявка уже рассмотрена' });
  }

  // Проверки на случай гонки
  const loginInUsers = db.prepare('SELECT 1 FROM users WHERE username = ?').get(app.desired_login);
  if (loginInUsers) {
    return res.status(400).json({ error: 'Логин уже занят — попросите учителя выбрать другой' });
  }
  const emailInUsers = db.prepare('SELECT 1 FROM users WHERE email = ?').get(app.email);
  if (emailInUsers) {
    return res.status(400).json({ error: 'Email уже используется' });
  }

  const { avatar, avatar_bg } = randomAvatar('tutor');

  let newUserId = null;
  try {
    db.exec('BEGIN');

    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, avatar, avatar_bg, last_seen, email)
      VALUES (?, ?, 'tutor', ?, ?, ?, datetime('now'), ?)
    `).run(app.desired_login, app.password_hash, app.full_name, avatar, avatar_bg, app.email);

    newUserId = Number(info.lastInsertRowid);

    db.prepare(`
      UPDATE tutor_applications
      SET status = 'approved',
          reviewed_at = datetime('now'),
          reviewed_by = ?,
          created_user_id = ?
      WHERE id = ?
    `).run(req.session.userId, newUserId, id);

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('approve application error:', e);
    return res.status(500).json({ error: 'Не удалось одобрить заявку' });
  }

  // Создаём вводную тему (как при обычной регистрации)
  createWelcomeTopicForTutor(newUserId);

  const user = db.prepare(`
    SELECT id, username, display_name, email, avatar, avatar_bg
    FROM users WHERE id = ?
  `).get(newUserId);

  res.json({
    ok: true,
    user,
    email_template: {
      to: app.email,
      subject: 'Ваша заявка на платформе «Алхимичка» одобрена',
      body:
`Здравствуйте, ${app.full_name}!

Ваша заявка на платформе «Алхимичка» одобрена. 🎉

Ваш логин: ${app.desired_login}
Пароль: тот, который вы указали при регистрации.

Войти в кабинет: https://<ваш-домен>/tutor-login.html

Если вы забыли пароль — напишите в ответ на это письмо, мы поможем восстановить доступ.

С уважением,
команда «Алхимичка»`
    }
  });
});

// POST /api/moder/tutor-applications/:id/reject — отклонить
router.post('/moder/tutor-applications/:id/reject', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const id = Number(req.params.id);
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);

  const app = db.prepare('SELECT * FROM tutor_applications WHERE id = ?').get(id);
  if (!app) return res.status(404).json({ error: 'Заявка не найдена' });
  if (app.status !== 'new') {
    return res.status(400).json({ error: 'Заявка уже рассмотрена' });
  }

  db.prepare(`
    UPDATE tutor_applications
    SET status = 'rejected',
        reviewed_at = datetime('now'),
        reviewed_by = ?,
        reject_reason = ?
    WHERE id = ?
  `).run(req.session.userId, reason || null, id);

  res.json({
    ok: true,
    email_template: {
      to: app.email,
      subject: 'Заявка на платформе «Алхимичка»',
      body:
`Здравствуйте, ${app.full_name}!

К сожалению, ваша заявка на платформе «Алхимичка» была отклонена.${reason ? '\n\nПричина: ' + reason : ''}

Если вы считаете, что это ошибка, ответьте на это письмо.

С уважением,
команда «Алхимичка»`
    }
  });
});

// ──────────── ДАЛЬШЕ — ВСЁ КАК БЫЛО ────────────
// (весь остальной код api.js без изменений: /login, /logout, /me,
//  /topics, /students, /my/*, /reviews/*, /chat/*, /lessons/*, /moder/*
//  и служебные функции handleMultipart, parseMultipart, expandWeek и т.д.)

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  if (user.deleted_at) {
    return res.status(403).json({ error: 'Аккаунт удалён. Обратитесь к администратору.' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.displayName = user.display_name;
  touchLastSeen(user.id);
  res.json({
    ok: true,
    user: {
      id: user.id, username: user.username, display_name: user.display_name,
      role: user.role, avatar: user.avatar, avatar_bg: user.avatar_bg
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  const user = db.prepare('SELECT id, role, display_name, avatar, avatar_bg, deleted_at FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });

  if (user.deleted_at) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: 'Аккаунт удалён' });
  }

  touchLastSeen(user.id);
  res.json({
    user: { id: user.id, role: user.role, display_name: user.display_name, avatar: user.avatar, avatar_bg: user.avatar_bg }
  });
});

// ──────────── ТЕМЫ (учитель) ────────────

router.get('/topics', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const rows = db.prepare(`
    SELECT t.id, t.title, t.description, t.position, t.created_at, t.is_welcome, t.grade,
      (SELECT COUNT(*) FROM materials m WHERE m.topic_id = t.id) AS materials_count,
      (SELECT COUNT(*) FROM questions q JOIN tests te ON te.id = q.test_id
        WHERE te.topic_id = t.id) AS questions_count,
      (SELECT is_draft FROM tests te2 WHERE te2.topic_id = t.id) AS test_is_draft,
      (SELECT id FROM tests te3 WHERE te3.topic_id = t.id) AS test_id
    FROM topics t WHERE t.tutor_id = ?
    ORDER BY t.is_welcome DESC, t.grade ASC, t.position ASC, t.id DESC
  `).all(req.session.userId);
  res.json({ topics: rows });
});

router.post('/topics', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const { title, description, grade } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Введите название темы' });
  if (!isValidGrade(grade)) return res.status(400).json({ error: 'Неверный класс' });
  const normGrade = normalizeGrade(grade);
  if (!normGrade) return res.status(400).json({ error: 'Выберите класс' });

  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS mx FROM topics WHERE tutor_id = ? AND grade = ?'
  ).get(req.session.userId, normGrade);
  const info = db.prepare(
    'INSERT INTO topics (tutor_id, title, description, position, is_welcome, grade) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(req.session.userId, title.trim(), (description || '').trim(), maxRow.mx + 1, normGrade);
  const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(info.lastInsertRowid);
  res.json({ topic });
});

router.post('/topics/:id/duplicate', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const { grade, title } = req.body || {};

  const source = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!source) return res.status(404).json({ error: 'Тема не найдена' });
  if (source.is_welcome === 1) {
    return res.status(400).json({ error: 'Вводную тему нельзя копировать' });
  }
  if (!isValidGrade(grade)) return res.status(400).json({ error: 'Неверный класс' });
  const normGrade = normalizeGrade(grade);
  if (!normGrade) return res.status(400).json({ error: 'Выберите класс' });

  const newTitle = (title || '').trim() || `${source.title} — ${normGrade}`;

  let newTopicId = null;
  try {
    db.exec('BEGIN');

    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(position), 0) AS mx FROM topics WHERE tutor_id = ? AND grade = ?'
    ).get(req.session.userId, normGrade);

    const topicInfo = db.prepare(`
      INSERT INTO topics (tutor_id, title, description, position, is_welcome, grade)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(req.session.userId, newTitle, source.description, maxRow.mx + 1, normGrade);
    newTopicId = Number(topicInfo.lastInsertRowid);

    const mats = db.prepare('SELECT * FROM materials WHERE topic_id = ? ORDER BY position ASC, id ASC').all(id);
    const insMat = db.prepare(`
      INSERT INTO materials (topic_id, title, type, content, position, file_path, file_name, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of mats) {
      let newFilePath = m.file_path;
      if (m.file_path) {
        try {
          const srcPath = path.join(UPLOAD_DIR, path.basename(m.file_path));
          if (fs.existsSync(srcPath)) {
            const ext = path.extname(srcPath);
            const newName = crypto.randomBytes(16).toString('hex') + ext;
            fs.copyFileSync(srcPath, path.join(UPLOAD_DIR, newName));
            newFilePath = newName;
          }
        } catch (e) {
          console.error('copy file error:', e);
        }
      }
      insMat.run(newTopicId, m.title, m.type, m.content, m.position,
                 newFilePath, m.file_name, m.file_size);
    }

    const test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(id);
    if (test) {
      const testInfo = db.prepare(`
        INSERT INTO tests (topic_id, title, is_draft, timer_min, max_attempts)
        VALUES (?, ?, 1, ?, ?)
      `).run(newTopicId, test.title, test.timer_min, test.max_attempts);
      const newTestId = Number(testInfo.lastInsertRowid);

      const qs = db.prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY position ASC, id ASC').all(test.id);
      const insQ = db.prepare(`
        INSERT INTO questions
          (test_id, position, text, type, options_json, correct_json, correct_text,
           option_a, option_b, option_c, option_d, correct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const q of qs) {
        insQ.run(
          newTestId, q.position, q.text, q.type || 'single',
          q.options_json, q.correct_json, q.correct_text,
          q.option_a, q.option_b, q.option_c, q.option_d, q.correct
        );
      }
    }

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('duplicate topic error:', e);
    return res.status(500).json({ error: 'Не удалось скопировать тему' });
  }

  const newTopic = db.prepare('SELECT * FROM topics WHERE id = ?').get(newTopicId);
  res.json({ topic: newTopic });
});

// ──────────── УПРАВЛЕНИЕ ДОСТУПОМ ────────────

router.get('/topics/:id/access', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.id);
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, req.session.userId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });

  const isWelcome = topic.is_welcome === 1;

  const students = db.prepare(`
    SELECT id, display_name, username, avatar, avatar_bg, grade
    FROM users
    WHERE role = 'student' AND created_by = ?
    ORDER BY display_name ASC
  `).all(req.session.userId);

  const accessMap = {};
  if (!isWelcome) {
    const rows = db.prepare(`
      SELECT student_id, can_materials, can_test
      FROM topic_access WHERE topic_id = ?
    `).all(topicId);
    for (const r of rows) {
      accessMap[r.student_id] = {
        can_materials: r.can_materials,
        can_test: r.can_test
      };
    }
  }

  const studentsWithAccess = students.map(s => {
    const autoAccess = !isWelcome && topic.grade && s.grade && topic.grade === s.grade;
    return {
      ...s,
      can_materials: isWelcome || autoAccess ? 1 : (accessMap[s.id]?.can_materials || 0),
      can_test:      isWelcome || autoAccess ? 1 : (accessMap[s.id]?.can_test      || 0),
      auto_access:   autoAccess ? 1 : 0
    };
  });

  res.json({
    topic: { id: topic.id, title: topic.title, is_welcome: topic.is_welcome, grade: topic.grade },
    students: studentsWithAccess
  });
});

router.patch('/topics/:id/access', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.id);
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, req.session.userId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.is_welcome === 1) {
    return res.status(400).json({ error: 'Вводная тема всегда открыта всем' });
  }

  const { student_id, can_materials, can_test } = req.body || {};
  const sid = Number(student_id);
  if (!sid) return res.status(400).json({ error: 'Не указан ученик' });

  const student = db.prepare(`
    SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(sid, req.session.userId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const cm = can_materials ? 1 : 0;
  const ct = can_test ? 1 : 0;

  const existing = db.prepare(`
    SELECT id FROM topic_access WHERE topic_id = ? AND student_id = ?
  `).get(topicId, sid);

  if (existing) {
    db.prepare(`
      UPDATE topic_access SET can_materials = ?, can_test = ?
      WHERE id = ?
    `).run(cm, ct, existing.id);
  } else {
    db.prepare(`
      INSERT INTO topic_access (topic_id, student_id, can_materials, can_test)
      VALUES (?, ?, ?, ?)
    `).run(topicId, sid, cm, ct);
  }

  res.json({ ok: true, student_id: sid, can_materials: cm, can_test: ct });
});

router.post('/topics/:id/access/bulk', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.id);
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, req.session.userId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.is_welcome === 1) {
    return res.status(400).json({ error: 'Вводная тема всегда открыта всем' });
  }

  const { action, scope } = req.body || {};
  if (!['all', 'none'].includes(action)) return res.status(400).json({ error: 'Неверный action' });
  if (!['materials', 'test', 'both'].includes(scope)) return res.status(400).json({ error: 'Неверный scope' });

  const students = db.prepare(`
    SELECT id FROM users WHERE role = 'student' AND created_by = ?
  `).all(req.session.userId);

  const value = action === 'all' ? 1 : 0;

  const selectStmt = db.prepare('SELECT * FROM topic_access WHERE topic_id = ? AND student_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO topic_access (topic_id, student_id, can_materials, can_test)
    VALUES (?, ?, ?, ?)
  `);
  const updateStmt = db.prepare(`
    UPDATE topic_access SET can_materials = ?, can_test = ? WHERE id = ?
  `);

  for (const s of students) {
    const cur = selectStmt.get(topicId, s.id);
    let cm = cur ? cur.can_materials : 0;
    let ct = cur ? cur.can_test : 0;

    if (scope === 'materials' || scope === 'both') cm = value;
    if (scope === 'test'      || scope === 'both') ct = value;

    if (cur) {
      updateStmt.run(cm, ct, cur.id);
    } else {
      insertStmt.run(topicId, s.id, cm, ct);
    }
  }

  res.json({ ok: true, action, scope });
});

router.get('/students/:id/access', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const studentId = Number(req.params.id);
  const student = db.prepare(`
    SELECT id, display_name, grade FROM users
    WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(studentId, req.session.userId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const topics = db.prepare(`
    SELECT id, title, is_welcome, grade FROM topics
    WHERE tutor_id = ?
    ORDER BY is_welcome DESC, grade ASC, position ASC, id ASC
  `).all(req.session.userId);

  const accessRows = db.prepare(`
    SELECT topic_id, can_materials, can_test
    FROM topic_access WHERE student_id = ?
  `).all(studentId);

  const map = {};
  for (const r of accessRows) map[r.topic_id] = r;

  const topicsWithAccess = topics.map(t => {
    const autoAccess = t.is_welcome === 0 && t.grade && student.grade && t.grade === student.grade;
    return {
      ...t,
      can_materials: t.is_welcome === 1 || autoAccess ? 1 : (map[t.id]?.can_materials || 0),
      can_test:      t.is_welcome === 1 || autoAccess ? 1 : (map[t.id]?.can_test      || 0),
      auto_access:   autoAccess ? 1 : 0
    };
  });

  res.json({ student, topics: topicsWithAccess });
});

router.patch('/students/:id/access', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const studentId = Number(req.params.id);
  const student = db.prepare(`
    SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(studentId, req.session.userId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const { topic_id, can_materials, can_test } = req.body || {};
  const topicId = Number(topic_id);
  if (!topicId) return res.status(400).json({ error: 'Не указана тема' });

  const topic = db.prepare(`
    SELECT id, is_welcome FROM topics WHERE id = ? AND tutor_id = ?
  `).get(topicId, req.session.userId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.is_welcome === 1) {
    return res.status(400).json({ error: 'Вводная тема всегда открыта всем' });
  }

  const cm = can_materials ? 1 : 0;
  const ct = can_test ? 1 : 0;

  const existing = db.prepare(`
    SELECT id FROM topic_access WHERE topic_id = ? AND student_id = ?
  `).get(topicId, studentId);

  if (existing) {
    db.prepare(`
      UPDATE topic_access SET can_materials = ?, can_test = ?
      WHERE id = ?
    `).run(cm, ct, existing.id);
  } else {
    db.prepare(`
      INSERT INTO topic_access (topic_id, student_id, can_materials, can_test)
      VALUES (?, ?, ?, ?)
    `).run(topicId, studentId, cm, ct);
  }

  res.json({ ok: true, topic_id: topicId, student_id: studentId, can_materials: cm, can_test: ct });
});

// ──────────── ТЕМА (учитель) ────────────

router.get('/topics/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  res.json({ topic });
});

router.patch('/topics/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  if (!ownsTopic(id, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  const { title, description } = req.body || {};
  const current = db.prepare('SELECT * FROM topics WHERE id = ?').get(id);
  const newTitle = title !== undefined ? title.trim() : current.title;
  const newDesc  = description !== undefined ? description.trim() : current.description;
  if (!newTitle) return res.status(400).json({ error: 'Название не может быть пустым' });
  db.prepare('UPDATE topics SET title = ?, description = ? WHERE id = ?').run(newTitle, newDesc, id);
  res.json({ topic: db.prepare('SELECT * FROM topics WHERE id = ?').get(id) });
});

router.delete('/topics/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  if (!ownsTopic(id, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });

  const topic = db.prepare('SELECT is_welcome FROM topics WHERE id = ?').get(id);
  if (topic && topic.is_welcome === 1) {
    return res.status(400).json({ error: 'Вводную тему нельзя удалить' });
  }

  db.prepare('DELETE FROM topics WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ──────────── МАТЕРИАЛЫ ────────────

router.get('/topics/:topicId/materials', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  const materials = db.prepare(
    'SELECT * FROM materials WHERE topic_id = ? ORDER BY position ASC, id ASC'
  ).all(topicId);
  res.json({ materials });
});

router.post('/topics/:topicId/materials', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  const { title, type, content } = req.body || {};
  if (!title || !type || !content) return res.status(400).json({ error: 'Заполните все поля' });
  if (!['link', 'text'].includes(type)) return res.status(400).json({ error: 'type: link или text' });
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS mx FROM materials WHERE topic_id = ?'
  ).get(topicId);
  const info = db.prepare(
    'INSERT INTO materials (topic_id, title, type, content, position) VALUES (?, ?, ?, ?, ?)'
  ).run(topicId, title.trim(), type, content.trim(), maxRow.mx + 1);
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(info.lastInsertRowid);
  res.json({ material });
});

router.patch('/materials/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const mat = db.prepare(`
    SELECT m.* FROM materials m JOIN topics t ON t.id = m.topic_id
    WHERE m.id = ? AND t.tutor_id = ?
  `).get(id, req.session.userId);
  if (!mat) return res.status(404).json({ error: 'Материал не найден' });
  const { title, type, content } = req.body || {};
  const newTitle   = title   !== undefined ? title.trim()   : mat.title;
  const newType    = type    !== undefined ? type           : mat.type;
  const newContent = content !== undefined ? content.trim() : mat.content;
  if (!newTitle || !newContent) return res.status(400).json({ error: 'Пустые поля' });
  if (!['link','text'].includes(newType)) return res.status(400).json({ error: 'Неверный type' });
  db.prepare('UPDATE materials SET title = ?, type = ?, content = ? WHERE id = ?')
    .run(newTitle, newType, newContent, id);
  res.json({ material: db.prepare('SELECT * FROM materials WHERE id = ?').get(id) });
});

router.delete('/materials/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const mat = db.prepare(`
    SELECT m.id, m.file_path FROM materials m JOIN topics t ON t.id = m.topic_id
    WHERE m.id = ? AND t.tutor_id = ?
  `).get(id, req.session.userId);
  if (!mat) return res.status(404).json({ error: 'Материал не найден' });
  if (mat.file_path) {
    const fileOnDisk = path.join(UPLOAD_DIR, mat.file_path);
    try { if (fs.existsSync(fileOnDisk)) fs.unlinkSync(fileOnDisk); } catch (e) {}
  }
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/topics/:topicId/upload', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  handleMultipart(req, res, UPLOAD_DIR, (file, fields) => {
    const title = (fields.title || file.filename || 'Файл').trim();
    const maxRow = db.prepare(
      'SELECT COALESCE(MAX(position), 0) AS mx FROM materials WHERE topic_id = ?'
    ).get(topicId);
    const info = db.prepare(`
      INSERT INTO materials
        (topic_id, title, type, content, position, file_path, file_name, file_size)
      VALUES (?, ?, 'link', ?, ?, ?, ?, ?)
    `).run(
      topicId, title, '/uploads/' + file.storedName, maxRow.mx + 1,
      file.storedName, file.filename, file.data.length
    );
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(info.lastInsertRowid);
    res.json({ material });
  });
});

function handleMultipart(req, res, uploadDir, onDone) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Ожидается multipart/form-data' });
  }
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) return res.status(400).json({ error: 'Нет boundary' });
  const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]);

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('error', () => res.status(500).json({ error: 'Ошибка чтения тела' }));
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      const parsed = parseMultipart(buf, boundary);
      const rawFile = parsed.files[0];
      if (!rawFile) return res.status(400).json({ error: 'Файл не получен' });

      const ext = path.extname(rawFile.filename).toLowerCase();
      const ALLOWED = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
                       '.txt', '.md', '.rtf', '.csv',
                       '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
      if (!ALLOWED.includes(ext)) return res.status(400).json({ error: 'Недопустимый тип файла' });
      if (rawFile.data.length > 20 * 1024 * 1024) {
        return res.status(400).json({ error: 'Файл больше 20 МБ' });
      }

      const storedName = crypto.randomBytes(16).toString('hex') + ext;
      fs.writeFileSync(path.join(uploadDir, storedName), rawFile.data);

      onDone({ storedName, filename: rawFile.filename, data: rawFile.data }, parsed.fields);
    } catch (e) {
      console.error('Upload error:', e);
      res.status(500).json({ error: 'Ошибка обработки файла' });
    }
  });
}

function parseMultipart(buf, boundary) {
  const files = [];
  const fields = {};
  const boundaryBuf = Buffer.from(boundary);

  let start = buf.indexOf(boundaryBuf);
  if (start === -1) throw new Error('Boundary не найден');
  start += boundaryBuf.length;

  while (start < buf.length) {
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    else break;

    const next = buf.indexOf(boundaryBuf, start);
    if (next === -1) break;

    const partEnd = next - 2;
    const part = buf.slice(start, partEnd);

    const sep = part.indexOf('\r\n\r\n');
    if (sep === -1) { start = next + boundaryBuf.length; continue; }
    const headersRaw = part.slice(0, sep).toString('utf8');
    const body = part.slice(sep + 4);

    const nameMatch = /name="([^"]+)"/i.exec(headersRaw);
    const filenameMatch = /filename="([^"]*)"/i.exec(headersRaw);
    const name = nameMatch ? nameMatch[1] : null;

    if (filenameMatch && filenameMatch[1]) {
      files.push({ field: name, filename: filenameMatch[1], data: body });
    } else if (name) {
      fields[name] = body.toString('utf8');
    }

    start = next + boundaryBuf.length;
  }
  return { files, fields };
}

// ──────────── ТЕСТЫ И ВОПРОСЫ ────────────

router.post('/topics/:topicId/test', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) {
    return res.status(404).json({ error: 'Тема не найдена' });
  }
  if (isWelcomeTopic(topicId)) {
    return res.status(400).json({ error: 'Вводная тема — без теста' });
  }
  let test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) {
    const info = db.prepare('INSERT INTO tests (topic_id, title, is_draft) VALUES (?, ?, 1)')
      .run(topicId, 'Тест по теме');
    test = db.prepare('SELECT * FROM tests WHERE id = ?').get(info.lastInsertRowid);
  }
  const questions = db.prepare(
    'SELECT * FROM questions WHERE test_id = ? ORDER BY position ASC, id ASC'
  ).all(test.id);
  res.json({ test, questions: questions.map(serializeQuestionForTutor) });
});

router.get('/topics/:topicId/test', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });

  if (isWelcomeTopic(topicId)) {
    return res.json({ test: null, questions: [] });
  }

  const test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) {
    return res.json({ test: null, questions: [] });
  }

  const raw = db.prepare(
    'SELECT * FROM questions WHERE test_id = ? ORDER BY position ASC, id ASC'
  ).all(test.id);
  res.json({ test, questions: raw.map(serializeQuestionForTutor) });
});

router.patch('/topics/:topicId/test', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  if (isWelcomeTopic(topicId)) {
    return res.status(400).json({ error: 'Вводная тема — без теста' });
  }
  const test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });

  const { is_draft, title, timer_min, max_attempts } = req.body || {};
  const newIsDraft = is_draft !== undefined ? (is_draft ? 1 : 0) : test.is_draft;
  const newTitle   = title !== undefined ? String(title).trim() : test.title;

  let newTimer = test.timer_min;
  if (timer_min !== undefined) {
    if (timer_min === null || timer_min === '' || timer_min === 0) newTimer = null;
    else {
      const n = Number(timer_min);
      newTimer = (Number.isFinite(n) && n > 0) ? Math.round(n) : null;
    }
  }

  let newMax = test.max_attempts;
  if (max_attempts !== undefined) {
    if (max_attempts === null || max_attempts === '' || max_attempts === 0) newMax = null;
    else {
      const n = Number(max_attempts);
      newMax = (Number.isFinite(n) && n > 0) ? Math.round(n) : null;
    }
  }

  db.prepare('UPDATE tests SET is_draft = ?, title = ?, timer_min = ?, max_attempts = ? WHERE id = ?')
    .run(newIsDraft, newTitle, newTimer, newMax, test.id);

  const updated = db.prepare('SELECT * FROM tests WHERE id = ?').get(test.id);
  res.json({ test: updated });
});

router.post('/topics/:topicId/questions', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const topicId = Number(req.params.topicId);
  if (!ownsTopic(topicId, req.session.userId)) return res.status(404).json({ error: 'Тема не найдена' });
  if (isWelcomeTopic(topicId)) {
    return res.status(400).json({ error: 'Вводная тема — без теста' });
  }

  const { type, text, options, correct, correct_text } = req.body || {};
  const err = validateQuestion({ type, text, options, correct, correct_text });
  if (err) return res.status(400).json({ error: err });

  let test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) {
    const info = db.prepare('INSERT INTO tests (topic_id, title, is_draft) VALUES (?, ?, 1)')
      .run(topicId, 'Тест по теме');
    test = db.prepare('SELECT * FROM tests WHERE id = ?').get(info.lastInsertRowid);
  }
  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(position), 0) AS mx FROM questions WHERE test_id = ?'
  ).get(test.id);

  const optsJson = type === 'open' ? null : JSON.stringify(options);
  const correctJson = type === 'open' ? null : JSON.stringify(correct);
  const ct = type === 'open' ? (correct_text || '').trim() : null;

  const info = db.prepare(`
    INSERT INTO questions
      (test_id, position, text, type, options_json, correct_json, correct_text,
       option_a, option_b, option_c, option_d, correct)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', 'a')
  `).run(test.id, maxRow.mx + 1, text.trim(), type, optsJson, correctJson, ct);

  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid);
  res.json({ question: serializeQuestionForTutor(q) });
});

function validateQuestion({ type, text, options, correct, correct_text }) {
  if (!type || !['single','multi','open'].includes(type)) return 'Неверный тип вопроса';
  if (!text || !text.trim()) return 'Введите текст вопроса';
  if (type === 'single') {
    if (!Array.isArray(options) || options.length !== 4) return 'Для одного варианта — ровно 4 ответа';
    if (options.some(o => !o || !String(o).trim())) return 'Заполните все 4 варианта';
    if (!Array.isArray(correct) || correct.length !== 1) return 'Выберите один правильный ответ';
  }
  if (type === 'multi') {
    if (!Array.isArray(options) || options.length < 4 || options.length > 9) {
      return 'Для нескольких вариантов — от 4 до 9 ответов';
    }
    if (options.some(o => !o || !String(o).trim())) return 'Заполните все варианты';
    if (!Array.isArray(correct) || correct.length < 2) return 'Отметьте минимум 2 правильных';
    if (correct.length >= options.length) return 'Не все варианты могут быть правильными';
  }
  return null;
}

router.patch('/questions/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const q = db.prepare(`
    SELECT q.* FROM questions q JOIN tests te ON te.id = q.test_id
    JOIN topics t ON t.id = te.topic_id
    WHERE q.id = ? AND t.tutor_id = ?
  `).get(id, req.session.userId);
  if (!q) return res.status(404).json({ error: 'Вопрос не найден' });

  const type = req.body.type ?? q.type ?? 'single';
  const text = req.body.text ?? q.text;
  const options = req.body.options ?? (q.options_json ? JSON.parse(q.options_json) : []);
  const correct = req.body.correct ?? (q.correct_json ? JSON.parse(q.correct_json) : []);
  const correct_text = req.body.correct_text ?? q.correct_text;

  const err = validateQuestion({ type, text, options, correct, correct_text });
  if (err) return res.status(400).json({ error: err });

  const optsJson = type === 'open' ? null : JSON.stringify(options);
  const correctJson = type === 'open' ? null : JSON.stringify(correct);
  const ct = type === 'open' ? (correct_text || '').trim() : null;

  db.prepare(`
    UPDATE questions
    SET text = ?, type = ?, options_json = ?, correct_json = ?, correct_text = ?
    WHERE id = ?
  `).run(text.trim(), type, optsJson, correctJson, ct, id);

  const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  res.json({ question: serializeQuestionForTutor(updated) });
});

router.delete('/questions/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const q = db.prepare(`
    SELECT q.id FROM questions q JOIN tests te ON te.id = q.test_id
    JOIN topics t ON t.id = te.topic_id
    WHERE q.id = ? AND t.tutor_id = ?
  `).get(id, req.session.userId);
  if (!q) return res.status(404).json({ error: 'Вопрос не найден' });
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ──────────── УЧЕНИКИ ────────────

router.get('/students', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const rows = db.prepare(`
    SELECT id, username, display_name, created_at, avatar, avatar_bg, last_seen, grade
    FROM users
    WHERE role = 'student' AND created_by = ?
    ORDER BY grade ASC, display_name ASC, id DESC  `).all(req.session.userId);
  res.json({ students: rows });
});

router.post('/students', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const { display_name, grade } = req.body || {};
  if (!display_name || !display_name.trim()) {
    return res.status(400).json({ error: 'Введите имя ученика' });
  }
  if (!isValidGrade(grade)) return res.status(400).json({ error: 'Неверный класс' });
  const normGrade = normalizeGrade(grade);
  if (!normGrade) return res.status(400).json({ error: 'Выберите класс ученика' });

  const login = generateUniqueLogin();
  const pwd   = generateUniquePassword();
  const hash  = bcrypt.hashSync(pwd, 10);
  const { avatar, avatar_bg } = randomAvatar('student');

  const info = db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, created_by, avatar, avatar_bg, grade)
    VALUES (?, ?, 'student', ?, ?, ?, ?, ?)
  `).run(login, hash, display_name.trim(), req.session.userId, avatar, avatar_bg, normGrade);
  db.prepare('INSERT INTO used_passwords (plain_password) VALUES (?)').run(pwd);
  res.json({
    student: { id: Number(info.lastInsertRowid), username: login, display_name: display_name.trim(), password: pwd, avatar, avatar_bg, grade: normGrade }
  });
});

router.delete('/students/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const s = db.prepare(`
    SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(id, req.session.userId);
  if (!s) return res.status(404).json({ error: 'Ученик не найден' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/students/:id/reset-password', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const s = db.prepare(`
    SELECT id, username, display_name, avatar, avatar_bg FROM users
    WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(id, req.session.userId);
  if (!s) return res.status(404).json({ error: 'Ученик не найден' });
  const pwd  = generateUniquePassword();
  const hash = bcrypt.hashSync(pwd, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  db.prepare('INSERT INTO used_passwords (plain_password) VALUES (?)').run(pwd);
  res.json({
    student: { id: s.id, username: s.username, display_name: s.display_name, password: pwd, avatar: s.avatar, avatar_bg: s.avatar_bg }
  });
});

router.patch('/students/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const s = db.prepare(`
    SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(id, req.session.userId);
  if (!s) return res.status(404).json({ error: 'Ученик не найден' });

  const { grade } = req.body || {};
  if (!isValidGrade(grade)) return res.status(400).json({ error: 'Неверный класс' });
  const normGrade = normalizeGrade(grade);
  if (!normGrade) return res.status(400).json({ error: 'Выберите класс' });

  db.prepare('UPDATE users SET grade = ? WHERE id = ?').run(normGrade, id);
  res.json({ ok: true, id, grade: normGrade });
});

// ──────────── УЧЕНИК ────────────

router.get('/my/topics', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const me = db.prepare('SELECT created_by, grade, deleted_at FROM users WHERE id = ?').get(req.session.userId);
  if (!me || me.deleted_at) return res.json({ topics: [] });
  if (!me.created_by) return res.json({ topics: [] });

  const tutor = db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(me.created_by);
  if (!tutor || tutor.deleted_at) return res.json({ topics: [] });

  const rows = db.prepare(`
    SELECT t.id, t.title, t.description, t.created_at, t.is_welcome, t.grade,
      (SELECT COUNT(*) FROM materials m WHERE m.topic_id = t.id) AS materials_count,
      (SELECT COUNT(*) FROM questions q JOIN tests te ON te.id = q.test_id
        WHERE te.topic_id = t.id) AS questions_count,
      (SELECT MAX(CASE WHEN a.status = 'reviewed' OR a.status = 'auto_checked'
              THEN CAST(a.score AS REAL) / a.total * 100 END)
        FROM attempts a JOIN tests te ON te.id = a.test_id
        WHERE te.topic_id = t.id AND a.student_id = ?) AS best_percent,
      (SELECT COUNT(*) FROM attempts a JOIN tests te ON te.id = a.test_id
        WHERE te.topic_id = t.id AND a.student_id = ? AND a.status = 'pending_review')
        AS pending_count,
      (SELECT can_materials FROM topic_access ta
        WHERE ta.topic_id = t.id AND ta.student_id = ?) AS acc_mat,
      (SELECT can_test FROM topic_access ta
        WHERE ta.topic_id = t.id AND ta.student_id = ?) AS acc_test
    FROM topics t WHERE t.tutor_id = ?
    ORDER BY t.is_welcome DESC, t.grade ASC, t.position ASC, t.id ASC
  `).all(req.session.userId, req.session.userId, req.session.userId, req.session.userId, me.created_by);

  const visible = rows.filter(r => {
    if (r.is_welcome === 1) return true;
    if (r.grade && me.grade && r.grade === me.grade) return true;
    if (r.acc_mat === 1) return true;
    return false;
  });

  const result = visible.map(r => {
    const { acc_mat, acc_test, ...rest } = r;
    const autoByGrade = r.grade && me.grade && r.grade === me.grade;
    return {
      ...rest,
      can_take_test: (r.is_welcome === 1 || autoByGrade || acc_test === 1) ? 1 : 0
    };
  });

  res.json({ topics: result });
});

router.get('/my/topics/:id', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const topicId = Number(req.params.id);
  const me = db.prepare('SELECT created_by, grade, deleted_at FROM users WHERE id = ?').get(req.session.userId);
  if (!me || me.deleted_at || !me.created_by) return res.status(404).json({ error: 'Нет доступа' });
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, me.created_by);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });

  if (!canSeeMaterials(req.session.userId, topicId)) {
    return res.status(403).json({ error: 'Доступ к теме закрыт учителем' });
  }

  const materials = db.prepare(
    'SELECT id, title, type, content, position, file_path, file_name, file_size FROM materials WHERE topic_id = ? ORDER BY position ASC, id ASC'
  ).all(topicId);

  if (topic.is_welcome === 1) {
    return res.json({
      topic: { id: topic.id, title: topic.title, description: topic.description, is_welcome: 1, grade: topic.grade },
      materials,
      test: null,
      questions_count: 0,
      attempts_used: 0,
      can_take_test: 0
    });
  }

  const rawTest = db.prepare('SELECT id, title, is_draft, timer_min, max_attempts FROM tests WHERE topic_id = ?').get(topicId);
  const test = (rawTest && !rawTest.is_draft) ? rawTest : null;

  const questionsCount = test
    ? db.prepare('SELECT COUNT(*) AS c FROM questions WHERE test_id = ?').get(test.id).c
    : 0;

  let attemptsUsed = 0;
  if (test) {
    attemptsUsed = db.prepare(
      'SELECT COUNT(*) AS c FROM attempts WHERE test_id = ? AND student_id = ?'
    ).get(test.id, req.session.userId).c;
  }

  const accessTest = canTakeTest(req.session.userId, topicId);

  res.json({
    topic: { id: topic.id, title: topic.title, description: topic.description, is_welcome: 0, grade: topic.grade },
    materials,
    test,
    questions_count: questionsCount,
    attempts_used: attemptsUsed,
    can_take_test: accessTest ? 1 : 0
  });
});

router.get('/my/tests/:topicId', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const topicId = Number(req.params.topicId);
  const me = db.prepare('SELECT created_by, deleted_at FROM users WHERE id = ?').get(req.session.userId);
  if (!me || me.deleted_at || !me.created_by) return res.status(404).json({ error: 'Нет учителя' });
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, me.created_by);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.is_welcome === 1) {
    return res.status(404).json({ error: 'Вводная тема — без теста' });
  }

  if (!canTakeTest(req.session.userId, topicId)) {
    return res.status(403).json({ error: 'Учитель не открыл доступ к тесту' });
  }

  const test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) return res.status(404).json({ error: 'Теста по этой теме ещё нет' });
  if (test.is_draft) return res.status(404).json({ error: 'Тест ещё не опубликован' });

  const attemptsUsed = db.prepare(
    'SELECT COUNT(*) AS c FROM attempts WHERE test_id = ? AND student_id = ?'
  ).get(test.id, req.session.userId).c;

  if (test.max_attempts && attemptsUsed >= test.max_attempts) {
    return res.status(403).json({ error: 'Попытки закончились', attempts_used: attemptsUsed, max_attempts: test.max_attempts });
  }

  const raw = db.prepare(
    'SELECT * FROM questions WHERE test_id = ? ORDER BY position ASC, id ASC'
  ).all(test.id);
  if (raw.length === 0) return res.status(400).json({ error: 'В тесте ещё нет вопросов' });

  res.json({
    test: {
      id: test.id, title: test.title, topic_title: topic.title,
      timer_min: test.timer_min, max_attempts: test.max_attempts, attempts_used: attemptsUsed
    },
    questions: raw.map(serializeQuestionForStudent)
  });
});

router.post('/my/upload-answer', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  handleMultipart(req, res, ANSWER_UPLOAD_DIR, (file) => {
    res.json({
      file_path: '/uploads/answers/' + file.storedName,
      file_name: file.filename,
      file_size: file.data.length
    });
  });
});

router.post('/my/tests/:topicId/submit', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const topicId = Number(req.params.topicId);
  const { answers, duration_sec } = req.body || {};
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Нет ответов' });
  }
  const me = db.prepare('SELECT created_by, deleted_at FROM users WHERE id = ?').get(req.session.userId);
  if (!me || me.deleted_at || !me.created_by) return res.status(404).json({ error: 'Нет учителя' });
  const topic = db.prepare('SELECT * FROM topics WHERE id = ? AND tutor_id = ?')
    .get(topicId, me.created_by);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });
  if (topic.is_welcome === 1) return res.status(404).json({ error: 'Вводная тема — без теста' });

  if (!canTakeTest(req.session.userId, topicId)) {
    return res.status(403).json({ error: 'Учитель не открыл доступ к тесту' });
  }

  const test = db.prepare('SELECT * FROM tests WHERE topic_id = ?').get(topicId);
  if (!test) return res.status(404).json({ error: 'Теста нет' });
  if (test.is_draft) return res.status(404).json({ error: 'Тест ещё не опубликован' });

  const questions = db.prepare(
    'SELECT * FROM questions WHERE test_id = ? ORDER BY position ASC, id ASC'
  ).all(test.id);
  if (questions.length === 0) return res.status(400).json({ error: 'Нет вопросов' });

  let score = 0;
  let hasOpen = false;
  const detail = [];

  for (const q of questions) {
    const given = answers[String(q.id)];
    const type = q.type || 'single';
    const opts = q.options_json ? JSON.parse(q.options_json) : [];
    const correctIdx = q.correct_json ? JSON.parse(q.correct_json) : [];

    if (type === 'open') {
      hasOpen = true;
      detail.push({
        question_id: q.id, type: 'open', text: q.text,
        correct_text: q.correct_text || '',
        given_text: (given?.text || '').trim(),
        given_file: given?.file || null,
        given_file_name: given?.file_name || null,
        grade: null, comment: null, score: null
      });
      continue;
    }

    let autoCorrect = false;
    let givenValue = given?.value;

    if (type === 'single') {
      if (typeof givenValue === 'number' && correctIdx.length === 1 && givenValue === correctIdx[0]) {
        autoCorrect = true;
      }
      detail.push({
        question_id: q.id, type: 'single', text: q.text,
        options: opts, correct: correctIdx,
        given: typeof givenValue === 'number' ? givenValue : null,
        auto_correct: autoCorrect
      });
    } else {
      const givenArr = Array.isArray(givenValue) ? [...new Set(givenValue)].sort((a,b)=>a-b) : [];
      const corrArr = [...correctIdx].sort((a,b)=>a-b);
      autoCorrect = givenArr.length === corrArr.length &&
                    givenArr.every((v, i) => v === corrArr[i]);
      detail.push({
        question_id: q.id, type: 'multi', text: q.text,
        options: opts, correct: correctIdx,
        given: givenArr, auto_correct: autoCorrect
      });
    }

    if (autoCorrect) score += 1;
  }

  const status = hasOpen ? 'pending_review' : 'auto_checked';
  const dur = Number.isFinite(Number(duration_sec)) ? Math.max(0, Math.round(Number(duration_sec))) : null;

  const info = db.prepare(`
    INSERT INTO attempts
      (test_id, student_id, score, total, answers_json, duration_sec, status, seen_by_tutor)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(test.id, req.session.userId, score, questions.length, JSON.stringify(detail), dur, status);

  res.json({
    attempt: {
      id: Number(info.lastInsertRowid),
      score, total: questions.length,
      percent: Math.round((score / questions.length) * 100),
      duration_sec: dur, status
    },
    detail
  });
});

router.get('/my/attempts', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const rows = db.prepare(`
    SELECT a.id, a.score, a.total, a.created_at, a.duration_sec, a.status,
      t.id AS test_id, t.title AS test_title,
      tp.id AS topic_id, tp.title AS topic_title
    FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE a.student_id = ?
    ORDER BY a.id DESC
  `).all(req.session.userId);
  res.json({ attempts: rows });
});

router.get('/my/attempts/:id', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const id = Number(req.params.id);
  const a = db.prepare(`
    SELECT a.*, t.title AS test_title, tp.title AS topic_title
    FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE a.id = ? AND a.student_id = ?
  `).get(id, req.session.userId);
  if (!a) return res.status(404).json({ error: 'Попытка не найдена' });
  res.json({
    attempt: {
      id: a.id, score: a.score, total: a.total,
      percent: Math.round((a.score / a.total) * 100),
      duration_sec: a.duration_sec, status: a.status,
      created_at: a.created_at, reviewed_at: a.reviewed_at,
      topic_title: a.topic_title, test_title: a.test_title
    },
    detail: JSON.parse(a.answers_json || '[]')
  });
});

// ──────────── РЕЗУЛЬТАТЫ (учитель) ────────────

router.get('/results', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const rows = db.prepare(`
    SELECT a.id, a.score, a.total, a.created_at, a.duration_sec, a.status, a.seen_by_tutor,
      u.id AS student_id, u.display_name AS student_name, u.username AS student_login,
      u.avatar AS student_avatar, u.avatar_bg AS student_avatar_bg, u.grade AS student_grade,
      t.title AS test_title,
      tp.id AS topic_id, tp.title AS topic_title, tp.grade AS topic_grade
    FROM attempts a
    JOIN users u ON u.id = a.student_id
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE tp.tutor_id = ?
    ORDER BY a.id DESC
    LIMIT 500
  `).all(req.session.userId);
  res.json({ results: rows });
});

router.get('/results/unseen', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const count = db.prepare(`
    SELECT COUNT(*) AS c FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE tp.tutor_id = ? AND a.seen_by_tutor = 0
  `).get(req.session.userId).c;

  const rows = db.prepare(`
    SELECT a.id, a.score, a.total, a.created_at, a.status,
      u.display_name AS student_name, u.avatar AS student_avatar, u.avatar_bg AS student_avatar_bg,
      tp.title AS topic_title
    FROM attempts a
    JOIN users u ON u.id = a.student_id
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE tp.tutor_id = ? AND a.seen_by_tutor = 0
    ORDER BY a.id DESC
    LIMIT 30
  `).all(req.session.userId);

  res.json({ count, items: rows });
});

router.post('/results/:attemptId/seen', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const attemptId = Number(req.params.attemptId);
  const a = db.prepare(`
    SELECT a.id FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE a.id = ? AND tp.tutor_id = ?
  `).get(attemptId, req.session.userId);
  if (!a) return res.status(404).json({ error: 'Попытка не найдена' });
  db.prepare('UPDATE attempts SET seen_by_tutor = 1 WHERE id = ?').run(attemptId);
  res.json({ ok: true });
});

// ──────────── ПРОВЕРКА РАБОТ ────────────

router.get('/reviews/count', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE tp.tutor_id = ? AND a.status = 'pending_review'
  `).get(req.session.userId);
  res.json({ count: row.c });
});

router.get('/reviews/pending', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const rows = db.prepare(`
    SELECT a.id, a.score, a.total, a.created_at, a.duration_sec,
      u.id AS student_id, u.display_name AS student_name, u.username AS student_login,
      u.avatar AS student_avatar, u.avatar_bg AS student_avatar_bg, u.grade AS student_grade,
      t.title AS test_title,
      tp.id AS topic_id, tp.title AS topic_title, tp.grade AS topic_grade
    FROM attempts a
    JOIN users u ON u.id = a.student_id
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE tp.tutor_id = ? AND a.status = 'pending_review'
    ORDER BY a.id ASC
  `).all(req.session.userId);
  res.json({ reviews: rows });
});

router.get('/reviews/:attemptId', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.attemptId);
  const a = db.prepare(`
    SELECT a.*, t.title AS test_title,
      tp.title AS topic_title,
      u.display_name AS student_name, u.username AS student_login,
      u.avatar AS student_avatar, u.avatar_bg AS student_avatar_bg
    FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    JOIN users u ON u.id = a.student_id
    WHERE a.id = ? AND tp.tutor_id = ?
  `).get(id, req.session.userId);
  if (!a) return res.status(404).json({ error: 'Попытка не найдена' });

  db.prepare('UPDATE attempts SET seen_by_tutor = 1 WHERE id = ?').run(id);

  res.json({
    attempt: {
      id: a.id, score: a.score, total: a.total, status: a.status,
      duration_sec: a.duration_sec, created_at: a.created_at, reviewed_at: a.reviewed_at,
      topic_title: a.topic_title, test_title: a.test_title,
      student_name: a.student_name, student_login: a.student_login,
      student_avatar: a.student_avatar, student_avatar_bg: a.student_avatar_bg
    },
    detail: JSON.parse(a.answers_json || '[]'),
    review: a.review_json ? JSON.parse(a.review_json) : {}
  });
});

router.post('/reviews/:attemptId', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.attemptId);
  const a = db.prepare(`
    SELECT a.*, t.id AS test_id, tp.title AS topic_title
    FROM attempts a
    JOIN tests t ON t.id = a.test_id
    JOIN topics tp ON tp.id = t.topic_id
    WHERE a.id = ? AND tp.tutor_id = ?
  `).get(id, req.session.userId);
  if (!a) return res.status(404).json({ error: 'Попытка не найдена' });

  const { reviews } = req.body || {};
  if (!reviews || typeof reviews !== 'object') {
    return res.status(400).json({ error: 'Нет данных проверки' });
  }

  const detail = JSON.parse(a.answers_json || '[]');
  const gradeScore = { correct: 1, partial: 0.5, wrong: 0 };

  let totalScore = 0;
  for (const item of detail) {
    if (item.type === 'open') {
      const rev = reviews[String(item.question_id)];
      const g = rev?.grade;
      item.grade = g || null;
      item.comment = rev?.comment || null;
      item.score = g ? gradeScore[g] : 0;
      totalScore += item.score;
    } else {
      if (item.auto_correct) totalScore += 1;
    }
  }

  const reviewMap = {};
  for (const item of detail) {
    if (item.type === 'open') {
      reviewMap[String(item.question_id)] = {
        grade: item.grade, comment: item.comment, score: item.score
      };
    }
  }

  db.prepare(`
    UPDATE attempts
    SET score = ?, answers_json = ?, review_json = ?, status = 'reviewed',
        reviewed_at = datetime('now'), seen_by_tutor = 1
    WHERE id = ?
  `).run(totalScore, JSON.stringify(detail), JSON.stringify(reviewMap), id);

  const updated = db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
  res.json({
    ok: true,
    attempt: {
      id: updated.id, score: updated.score, total: updated.total,
      percent: Math.round((updated.score / updated.total) * 100),
      status: updated.status
    }
  });
});

// ═══════════════════════════════════════════════════
//  ПОИСК
// ═══════════════════════════════════════════════════

router.get('/search', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, topics: [], students: [], questions: [] });
  const like = '%' + q.toLowerCase() + '%';

  const topics = db.prepare(`
    SELECT id, title, description, is_welcome, grade,
      (SELECT COUNT(*) FROM materials m WHERE m.topic_id = topics.id) AS materials_count,
      (SELECT COUNT(*) FROM questions q2 JOIN tests te ON te.id = q2.test_id
        WHERE te.topic_id = topics.id) AS questions_count
    FROM topics
    WHERE tutor_id = ? AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)
    ORDER BY is_welcome DESC, id DESC LIMIT 10
  `).all(req.session.userId, like, like);

  const students = db.prepare(`
    SELECT id, username, display_name, created_at, avatar, avatar_bg, grade
    FROM users
    WHERE role = 'student' AND created_by = ?
      AND (LOWER(display_name) LIKE ? OR LOWER(username) LIKE ?)
    ORDER BY id DESC LIMIT 10
  `).all(req.session.userId, like, like);

  const questions = db.prepare(`
    SELECT q.id, q.text, q.type, q.position, te.id AS test_id,
      t.id AS topic_id, t.title AS topic_title
    FROM questions q
    JOIN tests te ON te.id = q.test_id
    JOIN topics t ON t.id = te.topic_id
    WHERE t.tutor_id = ? AND LOWER(q.text) LIKE ?
    ORDER BY q.id DESC LIMIT 10
  `).all(req.session.userId, like);

  res.json({ query: q, topics, students, questions });
});

router.get('/my/search', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, topics: [], materials: [] });
  const me = db.prepare('SELECT created_by, grade, deleted_at FROM users WHERE id = ?').get(req.session.userId);
  if (!me || me.deleted_at || !me.created_by) return res.json({ query: q, topics: [], materials: [] });
  const like = '%' + q.toLowerCase() + '%';

  const topics = db.prepare(`
    SELECT t.id, t.title, t.description, t.is_welcome, t.grade,
      (SELECT COUNT(*) FROM materials m WHERE m.topic_id = t.id) AS materials_count,
      (SELECT COUNT(*) FROM questions q2 JOIN tests te ON te.id = q2.test_id
        WHERE te.topic_id = t.id) AS questions_count,
      (SELECT can_materials FROM topic_access ta
        WHERE ta.topic_id = t.id AND ta.student_id = ?) AS acc_mat
    FROM topics t
    WHERE t.tutor_id = ? AND (LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ?)
    ORDER BY t.is_welcome DESC, t.position ASC LIMIT 10
  `).all(req.session.userId, me.created_by, like, like);

  const visibleTopics = topics.filter(t => {
    if (t.is_welcome === 1) return true;
    if (t.grade && me.grade && t.grade === me.grade) return true;
    return t.acc_mat === 1;
  });

  const materials = db.prepare(`
    SELECT m.id, m.title, m.type, m.content, m.file_name, m.position,
      t.id AS topic_id, t.title AS topic_title, t.is_welcome, t.grade,
      (SELECT can_materials FROM topic_access ta
        WHERE ta.topic_id = t.id AND ta.student_id = ?) AS acc_mat
    FROM materials m
    JOIN topics t ON t.id = m.topic_id
    WHERE t.tutor_id = ?
      AND (LOWER(m.title) LIKE ? OR LOWER(m.content) LIKE ? OR LOWER(COALESCE(m.file_name,'')) LIKE ?)
    ORDER BY m.id DESC LIMIT 20
  `).all(req.session.userId, me.created_by, like, like, like);

  const visibleMaterials = materials.filter(m => {
    if (m.is_welcome === 1) return true;
    if (m.grade && me.grade && m.grade === me.grade) return true;
    return m.acc_mat === 1;
  }).map(m => {
    const { acc_mat, is_welcome, grade, ...rest } = m;
    return rest;
  });

  const cleanTopics = visibleTopics.map(t => {
    const { acc_mat, ...rest } = t;
    return rest;
  });

  res.json({ query: q, topics: cleanTopics, materials: visibleMaterials });
});

// ═══════════════════════════════════════════════════
//  ЧАТ
// ═══════════════════════════════════════════════════

function chatUserInfo(u) {
  if (!u) return null;
  return {
    id: u.id, display_name: u.display_name,
    avatar: u.avatar, avatar_bg: u.avatar_bg,
    last_seen: u.last_seen || null
  };
}

router.get('/chat/dialogs', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;
  const role = req.session.role;

  let contacts = [];
  if (role === 'tutor') {
    contacts = db.prepare(`
      SELECT id, display_name, avatar, avatar_bg, last_seen
      FROM users WHERE role = 'student' AND created_by = ?
      ORDER BY display_name ASC
    `).all(meId);
  } else {
    const me = db.prepare('SELECT created_by, deleted_at FROM users WHERE id = ?').get(meId);
    if (me && me.created_by && !me.deleted_at) {
      contacts = db.prepare(`
        SELECT id, display_name, avatar, avatar_bg, last_seen
        FROM users WHERE id = ?
      `).all(me.created_by);
    }
  }

  const lastStmt = db.prepare(`
    SELECT text, file_name, from_user_id, to_user_id, created_at
    FROM messages
    WHERE (from_user_id = ? AND to_user_id = ?)
       OR (from_user_id = ? AND to_user_id = ?)
    ORDER BY id DESC LIMIT 1
  `);
  const unreadStmt = db.prepare(`
    SELECT COUNT(*) AS c FROM messages
    WHERE from_user_id = ? AND to_user_id = ? AND read_at IS NULL
  `);

  const dialogs = contacts.map(c => {
    const last = lastStmt.get(meId, c.id, c.id, meId);
    const unread = unreadStmt.get(c.id, meId).c;
    return {
      user: chatUserInfo(c),
      last_message: last ? {
        text: last.text || '', file_name: last.file_name || null,
        from_me: last.from_user_id === meId, created_at: last.created_at
      } : null,
      unread_count: unread
    };
  });

  dialogs.sort((a, b) => {
    if (a.last_message && !b.last_message) return -1;
    if (!a.last_message && b.last_message) return 1;
    if (!a.last_message && !b.last_message) {
      return (a.user.display_name || '').localeCompare(b.user.display_name || '');
    }
    return (b.last_message.created_at || '').localeCompare(a.last_message.created_at || '');
  });

  const totalUnread = dialogs.reduce((sum, d) => sum + d.unread_count, 0);
  res.json({ dialogs, total_unread: totalUnread });
});

router.get('/chat/unread', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;

  const rows = db.prepare(`
    SELECT m.id, m.from_user_id, m.text, m.file_name, m.created_at,
           u.display_name, u.avatar, u.avatar_bg
    FROM messages m
    JOIN users u ON u.id = m.from_user_id
    WHERE m.to_user_id = ? AND m.read_at IS NULL
    ORDER BY m.id DESC LIMIT 30
  `).all(meId);

  const map = new Map();
  for (const r of rows) {
    const key = r.from_user_id;
    if (!map.has(key)) {
      map.set(key, {
        user: { id: r.from_user_id, display_name: r.display_name, avatar: r.avatar, avatar_bg: r.avatar_bg },
        count: 0, latest: null
      });
    }
    const item = map.get(key);
    item.count++;
    if (!item.latest) {
      item.latest = { id: r.id, text: r.text || '', file_name: r.file_name || null, created_at: r.created_at };
    }
  }

  const items = Array.from(map.values());
  const total = rows.length;
  res.json({ items, total });
});

router.get('/chat/with/:userId', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;
  const otherId = Number(req.params.userId);

  const other = db.prepare('SELECT id, role, display_name, avatar, avatar_bg, last_seen, created_by, deleted_at FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'Пользователь не найден' });
  if (other.deleted_at) return res.status(404).json({ error: 'Пользователь удалён' });

  if (req.session.role === 'tutor') {
    if (other.role !== 'student' || other.created_by !== meId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
  } else {
    const me = db.prepare('SELECT created_by FROM users WHERE id = ?').get(meId);
    if (!me || other.id !== me.created_by) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
  }

  const messages = db.prepare(`
    SELECT m.id, m.from_user_id, m.to_user_id, m.text,
           m.file_path, m.file_name, m.file_size, m.created_at, m.read_at
    FROM messages m
    WHERE (m.from_user_id = ? AND m.to_user_id = ?)
       OR (m.from_user_id = ? AND m.to_user_id = ?)
    ORDER BY m.id ASC LIMIT 500
  `).all(meId, otherId, otherId, meId);

  const ids = messages.map(m => m.id);
  let reactions = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    reactions = db.prepare(`
      SELECT r.message_id, r.user_id, r.emoji, u.display_name
      FROM message_reactions r
      JOIN users u ON u.id = r.user_id
      WHERE r.message_id IN (${placeholders})
      ORDER BY r.id ASC
    `).all(...ids);
  }

  const reactionsByMsg = {};
  for (const r of reactions) {
    if (!reactionsByMsg[r.message_id]) reactionsByMsg[r.message_id] = {};
    if (!reactionsByMsg[r.message_id][r.emoji]) reactionsByMsg[r.message_id][r.emoji] = [];
    reactionsByMsg[r.message_id][r.emoji].push({ user_id: r.user_id, display_name: r.display_name });
  }

  const decorated = messages.map(m => ({
    id: m.id, from_user_id: m.from_user_id, to_user_id: m.to_user_id,
    from_me: m.from_user_id === meId,
    text: m.text || '', file_path: m.file_path, file_name: m.file_name, file_size: m.file_size,
    created_at: m.created_at, read_at: m.read_at,
    reactions: reactionsByMsg[m.id] || {}
  }));

  res.json({ user: chatUserInfo(other), messages: decorated });
});

router.post('/chat/send', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;
  const { to_user_id, text, file_path, file_name, file_size } = req.body || {};
  const toId = Number(to_user_id);

  if (!toId) return res.status(400).json({ error: 'Не указан получатель' });
  const cleanText = (text || '').trim();
  const hasFile = !!file_path;

  if (!cleanText && !hasFile) return res.status(400).json({ error: 'Пустое сообщение' });

  const other = db.prepare('SELECT id, role, created_by, deleted_at FROM users WHERE id = ?').get(toId);
  if (!other) return res.status(404).json({ error: 'Пользователь не найден' });
  if (other.deleted_at) return res.status(404).json({ error: 'Пользователь удалён' });

  if (req.session.role === 'tutor') {
    if (other.role !== 'student' || other.created_by !== meId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
  } else {
    const me = db.prepare('SELECT created_by FROM users WHERE id = ?').get(meId);
    if (!me || other.id !== me.created_by) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
  }

  const info = db.prepare(`
    INSERT INTO messages (from_user_id, to_user_id, text, file_path, file_name, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(meId, toId, cleanText, file_path || null, file_name || null, file_size || null);

  const msg = db.prepare(`
    SELECT id, from_user_id, to_user_id, text, file_path, file_name, file_size, created_at
    FROM messages WHERE id = ?
  `).get(info.lastInsertRowid);

  res.json({
    message: {
      id: msg.id, from_user_id: msg.from_user_id, to_user_id: msg.to_user_id,
      from_me: true, text: msg.text || '',
      file_path: msg.file_path, file_name: msg.file_name, file_size: msg.file_size,
      created_at: msg.created_at, read_at: null, reactions: {}
    }
  });
});

router.post('/chat/upload', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  handleMultipart(req, res, CHAT_UPLOAD_DIR, (file) => {
    res.json({
      file_path: '/uploads/chat/' + file.storedName,
      file_name: file.filename,
      file_size: file.data.length
    });
  });
});

router.post('/chat/read/:userId', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;
  const otherId = Number(req.params.userId);
  db.prepare(`
    UPDATE messages SET read_at = datetime('now')
    WHERE to_user_id = ? AND from_user_id = ? AND read_at IS NULL
  `).run(meId, otherId);
  res.json({ ok: true });
});

router.post('/chat/react', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const meId = req.session.userId;
  const { message_id, emoji } = req.body || {};
  const msgId = Number(message_id);

  if (!msgId || !emoji) return res.status(400).json({ error: 'Неверные данные' });
  if (String(emoji).length > 4) return res.status(400).json({ error: 'Неверный эмодзи' });

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });

  const meInvolved = msg.from_user_id === meId || msg.to_user_id === meId;
  if (!meInvolved) return res.status(403).json({ error: 'Нет доступа' });

  const existing = db.prepare(`
    SELECT id FROM message_reactions
    WHERE message_id = ? AND user_id = ? AND emoji = ?
  `).get(msgId, meId, String(emoji));

  let action;
  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
    action = 'removed';
  } else {
    db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
      .run(msgId, meId, String(emoji));
    action = 'added';
  }

  const reactions = db.prepare(`
    SELECT r.user_id, r.emoji, u.display_name
    FROM message_reactions r
    JOIN users u ON u.id = r.user_id
    WHERE r.message_id = ?
  `).all(msgId);

  const byEmoji = {};
  for (const r of reactions) {
    if (!byEmoji[r.emoji]) byEmoji[r.emoji] = [];
    byEmoji[r.emoji].push({ user_id: r.user_id, display_name: r.display_name });
  }

  res.json({ ok: true, action, reactions: byEmoji });
});

router.get('/chat/online/:userId', (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Не авторизован' });
  const uid = Number(req.params.userId);
  const u = db.prepare('SELECT last_seen FROM users WHERE id = ?').get(uid);
  if (!u) return res.status(404).json({ error: 'Пользователь не найден' });
  let online = false;
  if (u.last_seen) {
    const last = new Date(u.last_seen.replace(' ', 'T') + 'Z').getTime();
    online = (Date.now() - last) < 2 * 60 * 1000;
  }
  res.json({ online, last_seen: u.last_seen || null });
});

// ═══════════════════════════════════════════════════
//  РАСПИСАНИЕ
// ═══════════════════════════════════════════════════

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOf(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function expandWeek(lessons, overrides, mondayDate) {
  const result = [];
  const monday = new Date(mondayDate);

  for (const l of lessons) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + l.day_of_week);
    const dateStrVal = dateStr(d);

    const ov = overrides.find(o =>
      o.lesson_id === l.id && o.override_date === dateStrVal
    );

    if (ov && ov.action === 'cancel') continue;

    if (ov && ov.action === 'move') {
      result.push({
        ...l,
        date: ov.new_date || dateStrVal,
        time_start: ov.new_time_start || l.time_start,
        is_override: 1,
        override_note: ov.note || ''
      });
    } else {
      result.push({
        ...l,
        date: dateStrVal,
        is_override: 0
      });
    }
  }

  return result;
}

router.get('/lessons', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const rows = db.prepare(`
    SELECT l.*,
      u.display_name AS student_name,
      u.username AS student_login,
      u.avatar AS student_avatar,
      u.avatar_bg AS student_avatar_bg,
      u.grade AS student_grade
    FROM lessons l
    JOIN users u ON u.id = l.student_id
    WHERE l.tutor_id = ? AND l.is_active = 1
    ORDER BY l.day_of_week ASC, l.time_start ASC
  `).all(req.session.userId);
  res.json({ lessons: rows });
});

router.get('/lessons/week', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const { start } = req.query;
  if (!start) return res.status(400).json({ error: 'Нужен параметр start' });

  const monday = mondayOf(new Date(start + 'T00:00:00'));
  const mondayStr = dateStr(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sundayStr = dateStr(sunday);

  const lessons = db.prepare(`
    SELECT l.*,
      u.display_name AS student_name,
      u.avatar AS student_avatar,
      u.avatar_bg AS student_avatar_bg,
      u.grade AS student_grade
    FROM lessons l
    JOIN users u ON u.id = l.student_id
    WHERE l.tutor_id = ? AND l.is_active = 1
    ORDER BY l.day_of_week ASC, l.time_start ASC
  `).all(req.session.userId);

  const overrides = db.prepare(`
    SELECT * FROM lesson_overrides
    WHERE override_date BETWEEN ? AND ?
  `).all(mondayStr, sundayStr);

  const expanded = expandWeek(lessons, overrides, monday);

  res.json({
    monday: mondayStr,
    sunday: sundayStr,
    lessons: expanded
  });
});

router.post('/lessons', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const { student_id, day_of_week, time_start, duration_min, subject } = req.body || {};

  const sid = Number(student_id);
  const dow = Number(day_of_week);
  const dur = Number(duration_min) || 60;

  if (!sid) return res.status(400).json({ error: 'Выберите ученика' });
  if (dow < 0 || dow > 6) return res.status(400).json({ error: 'Неверный день недели' });
  if (!time_start || !/^\d{1,2}:\d{2}$/.test(time_start)) {
    return res.status(400).json({ error: 'Неверное время (нужно ЧЧ:ММ)' });
  }
  if (dur < 15 || dur > 480) return res.status(400).json({ error: 'Длительность 15–480 мин' });

  const student = db.prepare(`
    SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
  `).get(sid, req.session.userId);
  if (!student) return res.status(404).json({ error: 'Ученик не найден' });

  const info = db.prepare(`
    INSERT INTO lessons (tutor_id, student_id, day_of_week, time_start, duration_min, subject)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.session.userId, sid, dow, time_start, dur, (subject || '').trim());

  const lesson = db.prepare(`
    SELECT l.*, u.display_name AS student_name, u.avatar AS student_avatar,
           u.avatar_bg AS student_avatar_bg, u.grade AS student_grade
    FROM lessons l JOIN users u ON u.id = l.student_id
    WHERE l.id = ?
  `).get(info.lastInsertRowid);

  res.json({ lesson });
});

router.patch('/lessons/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

  const { day_of_week, time_start, duration_min, subject, student_id } = req.body || {};

  let newDow = lesson.day_of_week;
  let newTime = lesson.time_start;
  let newDur = lesson.duration_min;
  let newSubject = lesson.subject;
  let newStudent = lesson.student_id;

  if (day_of_week !== undefined) {
    const d = Number(day_of_week);
    if (d < 0 || d > 6) return res.status(400).json({ error: 'Неверный день недели' });
    newDow = d;
  }
  if (time_start !== undefined) {
    if (!/^\d{1,2}:\d{2}$/.test(time_start)) {
      return res.status(400).json({ error: 'Неверное время' });
    }
    newTime = time_start;
  }
  if (duration_min !== undefined) {
    const d = Number(duration_min);
    if (d < 15 || d > 480) return res.status(400).json({ error: 'Длительность 15–480 мин' });
    newDur = d;
  }
  if (subject !== undefined) newSubject = String(subject).trim();
  if (student_id !== undefined) {
    const sid = Number(student_id);
    const st = db.prepare(`
      SELECT id FROM users WHERE id = ? AND role = 'student' AND created_by = ?
    `).get(sid, req.session.userId);
    if (!st) return res.status(404).json({ error: 'Ученик не найден' });
    newStudent = sid;
  }

  db.prepare(`
    UPDATE lessons
    SET day_of_week = ?, time_start = ?, duration_min = ?, subject = ?, student_id = ?
    WHERE id = ?
  `).run(newDow, newTime, newDur, newSubject, newStudent, id);

  const updated = db.prepare(`
    SELECT l.*, u.display_name AS student_name, u.avatar AS student_avatar,
           u.avatar_bg AS student_avatar_bg, u.grade AS student_grade
    FROM lessons l JOIN users u ON u.id = l.student_id
    WHERE l.id = ?
  `).get(id);

  res.json({ lesson: updated });
});

router.delete('/lessons/:id', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/lessons/:id/override', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

  const { override_date, action, new_time_start, new_date, note } = req.body || {};
  if (!override_date || !/^\d{4}-\d{2}-\d{2}$/.test(override_date)) {
    return res.status(400).json({ error: 'Неверная дата' });
  }
  if (!['cancel', 'move'].includes(action)) {
    return res.status(400).json({ error: 'action: cancel или move' });
  }
  if (action === 'move') {
    if (!new_time_start && !new_date) {
      return res.status(400).json({ error: 'Для переноса нужна новая дата или время' });
    }
  }

  db.prepare(`
    INSERT INTO lesson_overrides (lesson_id, override_date, action, new_time_start, new_date, note)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lesson_id, override_date) DO UPDATE SET
      action = excluded.action,
      new_time_start = excluded.new_time_start,
      new_date = excluded.new_date,
      note = excluded.note
  `).run(
    id, override_date, action,
    new_time_start || null, new_date || null, (note || '').trim()
  );

  res.json({ ok: true });
});

router.delete('/lessons/:id/override/:date', (req, res) => {
  if (!isTutor(req)) return res.status(403).json({ error: 'Только для учителя' });
  const id = Number(req.params.id);
  const date = req.params.date;
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ? AND tutor_id = ?')
    .get(id, req.session.userId);
  if (!lesson) return res.status(404).json({ error: 'Занятие не найдено' });

  db.prepare('DELETE FROM lesson_overrides WHERE lesson_id = ? AND override_date = ?')
    .run(id, date);
  res.json({ ok: true });
});

router.get('/my/lessons', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const meId = req.session.userId;

  const lessons = db.prepare(`
    SELECT l.*,
      u.display_name AS tutor_name,
      u.avatar AS tutor_avatar,
      u.avatar_bg AS tutor_avatar_bg
    FROM lessons l
    JOIN users u ON u.id = l.tutor_id
    WHERE l.student_id = ? AND l.is_active = 1
    ORDER BY l.day_of_week ASC, l.time_start ASC
  `).all(meId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = mondayOf(today);

  const result = [];
  for (let w = 0; w < 4; w++) {
    const wMonday = new Date(monday);
    wMonday.setDate(monday.getDate() + w * 7);
    const wSunday = new Date(wMonday);
    wSunday.setDate(wMonday.getDate() + 6);
    const wMondayStr = dateStr(wMonday);
    const wSundayStr = dateStr(wSunday);

    const overrides = db.prepare(`
      SELECT * FROM lesson_overrides
      WHERE override_date BETWEEN ? AND ?
        AND lesson_id IN (${lessons.map(() => '?').join(',') || 'NULL'})
    `).all(wMondayStr, wSundayStr, ...lessons.map(l => l.id));

    const expanded = expandWeek(lessons, overrides, wMonday);
    result.push(...expanded);
  }

  const now = Date.now();
  const upcoming = result
    .filter(l => {
      const dt = new Date(l.date + 'T' + l.time_start + ':00');
      return dt.getTime() + (l.duration_min * 60 * 1000) > now;
    })
    .sort((a, b) => {
      const da = new Date(a.date + 'T' + a.time_start + ':00').getTime();
      const db2 = new Date(b.date + 'T' + b.time_start + ':00').getTime();
      return da - db2;
    });

  res.json({ lessons: upcoming });
});

router.get('/my/lessons/next', (req, res) => {
  if (!isStudent(req)) return res.status(403).json({ error: 'Только для ученика' });
  const meId = req.session.userId;

  const lessons = db.prepare(`
    SELECT l.*,
      u.display_name AS tutor_name,
      u.avatar AS tutor_avatar,
      u.avatar_bg AS tutor_avatar_bg
    FROM lessons l
    JOIN users u ON u.id = l.tutor_id
    WHERE l.student_id = ? AND l.is_active = 1
  `).all(meId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = mondayOf(today);
  const now = Date.now();

  let next = null;
  for (let w = 0; w < 4 && !next; w++) {
    const wMonday = new Date(monday);
    wMonday.setDate(monday.getDate() + w * 7);
    const wSunday = new Date(wMonday);
    wSunday.setDate(wMonday.getDate() + 6);

    const overrides = db.prepare(`
      SELECT * FROM lesson_overrides
      WHERE override_date BETWEEN ? AND ?
        AND lesson_id IN (${lessons.map(() => '?').join(',') || 'NULL'})
    `).all(dateStr(wMonday), dateStr(wSunday), ...lessons.map(l => l.id));

    const expanded = expandWeek(lessons, overrides, wMonday);

    for (const l of expanded) {
      const dt = new Date(l.date + 'T' + l.time_start + ':00');
      if (dt.getTime() + (l.duration_min * 60 * 1000) > now) {
        if (!next || dt.getTime() < new Date(next.date + 'T' + next.time_start + ':00').getTime()) {
          next = l;
        }
      }
    }
  }

  if (!next) return res.json({ lesson: null });

  const dt = new Date(next.date + 'T' + next.time_start + ':00');
  const minutesUntil = Math.round((dt.getTime() - now) / 60000);

  res.json({ lesson: next, minutes_until: minutesUntil });
});

// ═══════════════════════════════════════════════════
//  МОДЕР
// ═══════════════════════════════════════════════════

router.post('/moder/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'moderator'").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  if (user.deleted_at) return res.status(403).json({ error: 'Аккаунт удалён' });

  req.session.userId = user.id;
  req.session.role = 'moderator';
  req.session.displayName = user.display_name;
  touchLastSeen(user.id);

  res.json({
    ok: true,
    user: {
      id: user.id, username: user.username, display_name: user.display_name,
      role: 'moderator', avatar: user.avatar, avatar_bg: user.avatar_bg
    }
  });
});

router.get('/moder/me', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const user = db.prepare('SELECT id, role, display_name, avatar, avatar_bg FROM users WHERE id = ?')
    .get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  touchLastSeen(user.id);
  res.json({
    user: { id: user.id, role: user.role, display_name: user.display_name, avatar: user.avatar, avatar_bg: user.avatar_bg }
  });
});

router.post('/moder/change-password', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Заполните текущий и новый пароль' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Новый пароль минимум 6 символов' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Неверный текущий пароль' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId);

  res.json({ ok: true });
});

router.get('/moder/stats', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const tutors = db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'tutor' AND deleted_at IS NULL"
  ).get().c;
  const students = db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND deleted_at IS NULL"
  ).get().c;
  const topics = db.prepare('SELECT COUNT(*) AS c FROM topics').get().c;
  const attempts = db.prepare('SELECT COUNT(*) AS c FROM attempts').get().c;
  const messages = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
  const applications = db.prepare(
    "SELECT COUNT(*) AS c FROM tutor_applications WHERE status = 'new'"
  ).get().c;
  const feedbackPending = db.prepare(
    "SELECT COUNT(*) AS c FROM feedback WHERE status = 'pending'"
  ).get().c;
  const leadsNew = db.prepare(
    "SELECT COUNT(*) AS c FROM leads WHERE status = 'new'"
  ).get().c;

  const trashTutors = db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'tutor' AND deleted_at IS NOT NULL"
  ).get().c;
  const trashStudents = db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND deleted_at IS NOT NULL"
  ).get().c;

  res.json({
    tutors, students, topics, attempts, messages, applications,
    feedback_pending: feedbackPending,
    leads_new: leadsNew,
    trash_tutors: trashTutors,
    trash_students: trashStudents
  });
});

router.get('/moder/tutors', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.avatar, u.avatar_bg, u.created_at, u.last_seen,
      (SELECT COUNT(*) FROM users s WHERE s.created_by = u.id AND s.role = 'student' AND s.deleted_at IS NULL) AS students_count,
      (SELECT COUNT(*) FROM topics t WHERE t.tutor_id = u.id) AS topics_count,
      (SELECT COUNT(*) FROM attempts a JOIN tests te ON te.id = a.test_id JOIN topics t2 ON t2.id = te.topic_id WHERE t2.tutor_id = u.id) AS attempts_count
    FROM users u
    WHERE u.role = 'tutor' AND u.deleted_at IS NULL
    ORDER BY u.id DESC
  `).all();

  res.json({ tutors: rows });
});

router.get('/moder/students', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const rows = db.prepare(`
    SELECT s.id, s.username, s.display_name, s.avatar, s.avatar_bg, s.grade,
      s.created_at, s.last_seen,
      t.id AS tutor_id, t.display_name AS tutor_name, t.username AS tutor_login,
      (SELECT COUNT(*) FROM attempts a WHERE a.student_id = s.id) AS attempts_count
    FROM users s
    LEFT JOIN users t ON t.id = s.created_by
    WHERE s.role = 'student' AND s.deleted_at IS NULL
    ORDER BY s.id DESC
  `).all();

  res.json({ students: rows });
});

router.get('/moder/trash', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const tutors = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.avatar_bg,
      u.created_at, u.deleted_at, u.deleted_by,
      CAST((julianday(datetime('now')) - julianday(u.deleted_at)) AS INTEGER) AS days_in_trash,
      (SELECT COUNT(*) FROM users s WHERE s.created_by = u.id AND s.role = 'student') AS students_count,
      (SELECT COUNT(*) FROM topics t WHERE t.tutor_id = u.id) AS topics_count
    FROM users u
    WHERE u.role = 'tutor' AND u.deleted_at IS NOT NULL
    ORDER BY u.deleted_at DESC
  `).all();

  const students = db.prepare(`
    SELECT s.id, s.username, s.display_name, s.avatar, s.avatar_bg, s.grade,
      s.created_at, s.deleted_at, s.deleted_by,
      CAST((julianday(datetime('now')) - julianday(s.deleted_at)) AS INTEGER) AS days_in_trash,
      t.id AS tutor_id, t.display_name AS tutor_name,
      (SELECT COUNT(*) FROM attempts a WHERE a.student_id = s.id) AS attempts_count
    FROM users s
    LEFT JOIN users t ON t.id = s.created_by
    WHERE s.role = 'student' AND s.deleted_at IS NOT NULL
    ORDER BY s.deleted_at DESC
  `).all();

  res.json({ tutors, students, trash_days: 30 });
});

router.post('/moder/users/:id/reset-password', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const userId = Number(req.params.id);

  const user = db.prepare(
    "SELECT id, username, display_name, role, avatar, avatar_bg FROM users WHERE id = ? AND role IN ('tutor','student')"
  ).get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const pwd = generateUniquePassword();
  const hash = bcrypt.hashSync(pwd, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  db.prepare('INSERT INTO used_passwords (plain_password) VALUES (?)').run(pwd);

  res.json({
    user: {
      id: user.id, username: user.username, display_name: user.display_name,
      role: user.role, avatar: user.avatar, avatar_bg: user.avatar_bg,
      password: pwd
    }
  });
});

router.delete('/moder/users/:id', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const userId = Number(req.params.id);

  const user = db.prepare(
    "SELECT id, role, deleted_at FROM users WHERE id = ? AND role IN ('tutor','student')"
  ).get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.deleted_at) return res.status(400).json({ error: 'Уже в корзине' });

  const moderId = req.session.userId;

  try {
    db.exec('BEGIN');

    db.prepare(`
      UPDATE users SET deleted_at = datetime('now'), deleted_by = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(moderId, userId);

    if (user.role === 'tutor') {
      db.prepare(`
        UPDATE users SET deleted_at = datetime('now'), deleted_by = ?
        WHERE created_by = ? AND role = 'student' AND deleted_at IS NULL
      `).run(moderId, userId);
    }

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('moder delete user error:', e);
    return res.status(500).json({ error: 'Не удалось удалить' });
  }

  res.json({ ok: true });
});

router.post('/moder/users/:id/restore', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const userId = Number(req.params.id);

  const user = db.prepare(
    "SELECT id, role, deleted_at FROM users WHERE id = ? AND deleted_at IS NOT NULL"
  ).get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден в корзине' });

  try {
    db.exec('BEGIN');

    if (user.role === 'tutor') {
      db.prepare(`
        UPDATE users SET deleted_at = NULL, deleted_by = NULL
        WHERE created_by = ? AND role = 'student' AND deleted_at IS NOT NULL
      `).run(userId);
    }

    db.prepare('UPDATE users SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').run(userId);

    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('moder restore user error:', e);
    return res.status(500).json({ error: 'Не удалось восстановить' });
  }

  res.json({ ok: true });
});

router.delete('/moder/users/:id/purge', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const userId = Number(req.params.id);

  const user = db.prepare(
    "SELECT id, role FROM users WHERE id = ? AND role IN ('tutor','student')"
  ).get(userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
//  ОТЗЫВЫ (feedback)
// ═══════════════════════════════════════════════════

// POST /api/feedback — публичный, приём отзыва
router.post('/feedback', (req, res) => {
  const { author_name, rating, text } = req.body || {};

  const name = String(author_name || '').trim().slice(0, 60);
  const r = Number(rating);
  const body = String(text || '').trim();

  if (!Number.isInteger(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'Поставьте оценку от 1 до 5' });
  }
  if (body.length < 5) {
    return res.status(400).json({ error: 'Отзыв слишком короткий (минимум 5 символов)' });
  }
  if (body.length > 1000) {
    return res.status(400).json({ error: 'Отзыв слишком длинный (максимум 1000 символов)' });
  }

  const info = db.prepare(`
    INSERT INTO feedback (author_name, rating, text, status)
    VALUES (?, ?, ?, 'pending')
  `).run(name || null, r, body);

  res.json({ ok: true, feedback_id: Number(info.lastInsertRowid) });
});

// GET /api/feedback/approved — публичный, одобренные отзывы (для визитки)
router.get('/feedback/approved', (req, res) => {
  const rows = db.prepare(`
    SELECT id, author_name, rating, text, created_at
    FROM feedback
    WHERE status = 'approved'
    ORDER BY id DESC
    LIMIT 50
  `).all();
  res.json({ feedback: rows });
});

// GET /api/moder/feedback — все отзывы (модер)
router.get('/moder/feedback', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT id, author_name, rating, text, status, reject_reason,
           reviewed_at, reviewed_by, created_at
    FROM feedback
  `;
  const params = [];
  if (['pending','approved','rejected'].includes(status)) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ` ORDER BY
    CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
    id DESC`;

  const rows = db.prepare(sql).all(...params);
  res.json({ feedback: rows });
});

// GET /api/moder/feedback/count — счётчик pending (модер)
router.get('/moder/feedback/count', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM feedback WHERE status = 'pending'"
  ).get();
  res.json({ count: row.c });
});

// POST /api/moder/feedback/:id/approve — одобрить отзыв
router.post('/moder/feedback/:id/approve', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const id = Number(req.params.id);

  const fb = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!fb) return res.status(404).json({ error: 'Отзыв не найден' });
  if (fb.status !== 'pending') {
    return res.status(400).json({ error: 'Отзыв уже рассмотрен' });
  }

  db.prepare(`
    UPDATE feedback
    SET status = 'approved',
        reviewed_at = datetime('now'),
        reviewed_by = ?
    WHERE id = ?
  `).run(req.session.userId, id);

  res.json({ ok: true });
});

// POST /api/moder/feedback/:id/reject — отклонить отзыв
router.post('/moder/feedback/:id/reject', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const id = Number(req.params.id);
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);

  const fb = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!fb) return res.status(404).json({ error: 'Отзыв не найден' });
  if (fb.status !== 'pending') {
    return res.status(400).json({ error: 'Отзыв уже рассмотрен' });
  }

  db.prepare(`
    UPDATE feedback
    SET status = 'rejected',
        reviewed_at = datetime('now'),
        reviewed_by = ?,
        reject_reason = ?
    WHERE id = ?
  `).run(req.session.userId, reason || null, id);

  res.json({ ok: true });
});

// DELETE /api/moder/feedback/:id — удалить отзыв навсегда
router.delete('/moder/feedback/:id', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const id = Number(req.params.id);
  const fb = db.prepare('SELECT id FROM feedback WHERE id = ?').get(id);
  if (!fb) return res.status(404).json({ error: 'Отзыв не найден' });
  db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
//  ЗАЯВКИ ОТ УЧЕНИКОВ (leads)
// ═══════════════════════════════════════════════════

// POST /api/leads — публичный, приём заявки
router.post('/leads', (req, res) => {
  const { name, phone, grade, comment } = req.body || {};

  const n = String(name || '').trim().slice(0, 80);
  const p = String(phone || '').trim().slice(0, 25);
  const g = String(grade || '').trim().slice(0, 20);
  const c = String(comment || '').trim().slice(0, 500);

  if (n.length < 2) {
    return res.status(400).json({ error: 'Введите имя' });
  }
  const digits = p.replace(/\D/g, '');
  if (digits.length < 10) {
    return res.status(400).json({ error: 'Введите корректный телефон' });
  }

  const validGrades = ['junior','8','9','10','11','adult'];
  const gradeVal = validGrades.includes(g) ? g : null;

  const info = db.prepare(`
    INSERT INTO leads (name, phone, grade, comment, status)
    VALUES (?, ?, ?, ?, 'new')
  `).run(n, p, gradeVal, c || null);

  res.json({ ok: true, lead_id: Number(info.lastInsertRowid) });
});

// GET /api/moder/leads — список заявок (модер)
router.get('/moder/leads', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const status = String(req.query.status || '').trim();
  let sql = `
    SELECT id, name, phone, grade, comment, status, read_at, read_by, created_at
    FROM leads
  `;
  const params = [];
  if (['new','read'].includes(status)) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ` ORDER BY
    CASE status WHEN 'new' THEN 0 ELSE 1 END,
    id DESC`;

  const rows = db.prepare(sql).all(...params);
  res.json({ leads: rows });
});

// GET /api/moder/leads/count — счётчик новых (модер)
router.get('/moder/leads/count', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const row = db.prepare("SELECT COUNT(*) AS c FROM leads WHERE status = 'new'").get();
  res.json({ count: row.c });
});

// POST /api/moder/leads/mark-read — отметить все как прочитанные
router.post('/moder/leads/mark-read', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });

  const result = db.prepare(`
    UPDATE leads
    SET status = 'read',
        read_at = datetime('now'),
        read_by = ?
    WHERE status = 'new'
  `).run(req.session.userId);

  res.json({ ok: true, updated: result.changes });
});

// POST /api/moder/leads/:id/read — отметить одну как прочитанную
router.post('/moder/leads/:id/read', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const id = Number(req.params.id);

  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Заявка не найдена' });

  db.prepare(`
    UPDATE leads
    SET status = 'read',
        read_at = datetime('now'),
        read_by = ?
    WHERE id = ?
  `).run(req.session.userId, id);

  res.json({ ok: true });
});

// DELETE /api/moder/leads/:id — удалить заявку
router.delete('/moder/leads/:id', (req, res) => {
  if (!isModerator(req)) return res.status(403).json({ error: 'Только для модератора' });
  const id = Number(req.params.id);
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(id);
  if (!lead) return res.status(404).json({ error: 'Заявка не найдена' });
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;