// server/db/init.js
const db = require('./connection');
const bcrypt = require('bcryptjs');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tutor','student','moderator')),
  display_name TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS used_passwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plain_password TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_welcome INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('link','text')),
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Тест по теме',
  is_draft INTEGER NOT NULL DEFAULT 0,
  timer_min INTEGER DEFAULT NULL,
  max_attempts INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  option_a TEXT NOT NULL DEFAULT '',
  option_b TEXT NOT NULL DEFAULT '',
  option_c TEXT NOT NULL DEFAULT '',
  option_d TEXT NOT NULL DEFAULT '',
  correct TEXT NOT NULL DEFAULT 'a'
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  total INTEGER NOT NULL,
  answers_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  file_path TEXT DEFAULT NULL,
  file_name TEXT DEFAULT NULL,
  file_size INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS message_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS topic_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_materials INTEGER NOT NULL DEFAULT 0,
  can_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(topic_id, student_id)
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tutor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_start TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  subject TEXT DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lesson_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  override_date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('cancel','move')),
  new_time_start TEXT DEFAULT NULL,
  new_date TEXT DEFAULT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lesson_id, override_date)
);
CREATE TABLE IF NOT EXISTS tutor_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  desired_login TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','rejected')),
  reject_reason TEXT DEFAULT NULL,
  created_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_name TEXT DEFAULT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason TEXT DEFAULT NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  grade TEXT DEFAULT NULL,
  comment TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read')),
  read_at TEXT DEFAULT NULL,
  read_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_topics_tutor ON topics(tutor_id);
CREATE INDEX IF NOT EXISTS idx_materials_topic ON materials(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_test ON questions(test_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);
CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(to_user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_access_topic ON topic_access(topic_id);
CREATE INDEX IF NOT EXISTS idx_access_student ON topic_access(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_tutor ON lessons(tutor_id);
CREATE INDEX IF NOT EXISTS idx_lessons_student ON lessons(student_id);
CREATE INDEX IF NOT EXISTS idx_lessons_dow ON lessons(day_of_week);
CREATE INDEX IF NOT EXISTS idx_overrides_lesson ON lesson_overrides(lesson_id);
CREATE INDEX IF NOT EXISTS idx_overrides_date ON lesson_overrides(override_date);
CREATE INDEX IF NOT EXISTS idx_applications_status ON tutor_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_email ON tutor_applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_login ON tutor_applications(desired_login);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
`;

const MODER_LOGIN = 'admin';
const MODER_PASSWORD = 'moder12345';
const MODER_NAME = 'Администратор';
const TRASH_DAYS = 30;

function initDb() {
  db.exec(schema);

  migrateUsersRoleCheck();

  // ─── МИГРАЦИИ ──────────────────────────────────────

  const matCols = db.prepare("PRAGMA table_info(materials)").all().map(c => c.name);
  if (!matCols.includes('file_path')) {
    db.exec("ALTER TABLE materials ADD COLUMN file_path TEXT DEFAULT NULL");
    console.log('🔧 materials.file_path');
  }
  if (!matCols.includes('file_name')) {
    db.exec("ALTER TABLE materials ADD COLUMN file_name TEXT DEFAULT NULL");
    console.log('🔧 materials.file_name');
  }
  if (!matCols.includes('file_size')) {
    db.exec("ALTER TABLE materials ADD COLUMN file_size INTEGER DEFAULT NULL");
    console.log('🔧 materials.file_size');
  }

  const attCols = db.prepare("PRAGMA table_info(attempts)").all().map(c => c.name);
  if (!attCols.includes('duration_sec')) {
    db.exec("ALTER TABLE attempts ADD COLUMN duration_sec INTEGER DEFAULT NULL");
    console.log('🔧 attempts.duration_sec');
  }
  if (!attCols.includes('status')) {
    db.exec("ALTER TABLE attempts ADD COLUMN status TEXT NOT NULL DEFAULT 'auto_checked'");
    console.log('🔧 attempts.status');
  }
  if (!attCols.includes('review_json')) {
    db.exec("ALTER TABLE attempts ADD COLUMN review_json TEXT DEFAULT NULL");
    console.log('🔧 attempts.review_json');
  }
  if (!attCols.includes('reviewed_at')) {
    db.exec("ALTER TABLE attempts ADD COLUMN reviewed_at TEXT DEFAULT NULL");
    console.log('🔧 attempts.reviewed_at');
  }
  if (!attCols.includes('seen_by_tutor')) {
    db.exec("ALTER TABLE attempts ADD COLUMN seen_by_tutor INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 attempts.seen_by_tutor');
  }

  const qCols = db.prepare("PRAGMA table_info(questions)").all().map(c => c.name);
  if (!qCols.includes('type')) {
    db.exec("ALTER TABLE questions ADD COLUMN type TEXT NOT NULL DEFAULT 'single'");
    console.log('🔧 questions.type');
  }
  if (!qCols.includes('options_json')) {
    db.exec("ALTER TABLE questions ADD COLUMN options_json TEXT DEFAULT NULL");
    console.log('🔧 questions.options_json');
  }
  if (!qCols.includes('correct_json')) {
    db.exec("ALTER TABLE questions ADD COLUMN correct_json TEXT DEFAULT NULL");
    console.log('🔧 questions.correct_json');
  }
  if (!qCols.includes('correct_text')) {
    db.exec("ALTER TABLE questions ADD COLUMN correct_text TEXT DEFAULT NULL");
    console.log('🔧 questions.correct_text');
  }

  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('avatar')) {
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL");
    console.log('🔧 users.avatar');
  }
  if (!userCols.includes('avatar_bg')) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_bg INTEGER DEFAULT NULL");
    console.log('🔧 users.avatar_bg');
  }
  if (!userCols.includes('last_seen')) {
    db.exec("ALTER TABLE users ADD COLUMN last_seen TEXT DEFAULT NULL");
    console.log('🔧 users.last_seen');
  }
  if (!userCols.includes('grade')) {
    db.exec("ALTER TABLE users ADD COLUMN grade TEXT DEFAULT NULL");
    console.log('🔧 users.grade');
  }
  if (!userCols.includes('deleted_at')) {
    db.exec("ALTER TABLE users ADD COLUMN deleted_at TEXT DEFAULT NULL");
    console.log('🔧 users.deleted_at');
  }
  if (!userCols.includes('deleted_by')) {
    db.exec("ALTER TABLE users ADD COLUMN deleted_by INTEGER DEFAULT NULL");
    console.log('🔧 users.deleted_by');
  }
  if (!userCols.includes('email')) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT NULL");
    console.log('🔧 users.email');
  }

  const testCols = db.prepare("PRAGMA table_info(tests)").all().map(c => c.name);
  if (!testCols.includes('is_draft')) {
    db.exec("ALTER TABLE tests ADD COLUMN is_draft INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 tests.is_draft');
  }
  if (!testCols.includes('timer_min')) {
    db.exec("ALTER TABLE tests ADD COLUMN timer_min INTEGER DEFAULT NULL");
    console.log('🔧 tests.timer_min');
  }
  if (!testCols.includes('max_attempts')) {
    db.exec("ALTER TABLE tests ADD COLUMN max_attempts INTEGER DEFAULT NULL");
    console.log('🔧 tests.max_attempts');
  }

  const topicCols = db.prepare("PRAGMA table_info(topics)").all().map(c => c.name);
  if (!topicCols.includes('is_welcome')) {
    db.exec("ALTER TABLE topics ADD COLUMN is_welcome INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 topics.is_welcome');
  }
  if (!topicCols.includes('grade')) {
    db.exec("ALTER TABLE topics ADD COLUMN grade TEXT DEFAULT NULL");
    console.log('🔧 topics.grade');
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_users_grade ON users(grade)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_topics_grade ON topics(grade)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");

  // ─── Переливка старых вопросов ───
  const oldQuestions = db.prepare(`
    SELECT id, option_a, option_b, option_c, option_d, correct
    FROM questions
    WHERE options_json IS NULL
  `).all();

  if (oldQuestions.length) {
    const upd = db.prepare(`
      UPDATE questions
      SET options_json = ?, correct_json = ?, type = 'single'
      WHERE id = ?
    `);
    const idxMap = { a: 0, b: 1, c: 2, d: 3 };
    for (const q of oldQuestions) {
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
      const correctIdx = idxMap[q.correct] ?? 0;
      upd.run(JSON.stringify(opts), JSON.stringify([correctIdx]), q.id);
    }
    console.log(`♻️  Переливка ${oldQuestions.length} старых вопросов`);
  }

  // ─── Раздача аватарок ───
  const usersWithoutAvatar = db.prepare(`
    SELECT id, role FROM users WHERE avatar IS NULL AND role IN ('tutor','student')
  `).all();

  if (usersWithoutAvatar.length) {
    const TUTOR_AVATARS = [
      '🧑‍🔬','👨‍🏫','👩‍🏫','🧙‍♂️','🧙‍♀️','🧑‍⚖️','👨‍🎓','👩‍🎓','👨‍💼','👩‍💼',
      '🔬','⚗️','⚛️','📚','📖','✏️','🎓','📐','🧭','🏛️'
    ];
    const STUDENT_AVATARS = [
      '🧑‍🔬','🧑‍🎓','👨‍🎓','👩‍🎓','🧒','👦','👧','🧪','⚗️','🔬',
      '⚛️','🧬','💧','🔥','🌟','✨','💎','🎯','🚀','🦉','🐧','🦊','🐝','🐙'
    ];
    const upd = db.prepare('UPDATE users SET avatar = ?, avatar_bg = ? WHERE id = ?');
    for (const u of usersWithoutAvatar) {
      const pool = u.role === 'tutor' ? TUTOR_AVATARS : STUDENT_AVATARS;
      const emoji = pool[Math.floor(Math.random() * pool.length)];
      const bg = Math.floor(Math.random() * 12);
      upd.run(emoji, bg, u.id);
    }
    console.log(`🎨 Аватарки выданы ${usersWithoutAvatar.length} пользователям`);
  }

  ensureModerator();
  ensureWelcomeTopics();
  openExistingTopicsForAll();
  cleanTrash();

  console.log('✅ БД готова (15 таблиц)');
}

// ─── МИГРАЦИЯ: CHECK role на 'moderator' ───

function migrateUsersRoleCheck() {
  try {
    const row = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).get();

    if (!row || !row.sql) return;
    if (row.sql.includes("'moderator'")) return;

    console.log('🔧 Миграция users: расширяем CHECK role');

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN');

    try {
      db.exec('ALTER TABLE users RENAME TO users_old;');

      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('tutor','student','moderator')),
          display_name TEXT NOT NULL,
          created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          avatar TEXT DEFAULT NULL,
          avatar_bg INTEGER DEFAULT NULL,
          last_seen TEXT DEFAULT NULL,
          grade TEXT DEFAULT NULL,
          deleted_at TEXT DEFAULT NULL,
          deleted_by INTEGER DEFAULT NULL,
          email TEXT DEFAULT NULL
        );
      `);

      db.exec(`
        INSERT INTO users (id, username, password_hash, role, display_name, created_by,
                           created_at, avatar, avatar_bg, last_seen, grade, deleted_at, deleted_by)
        SELECT id, username, password_hash, role, display_name, created_by,
               created_at, avatar, avatar_bg, last_seen, grade, deleted_at, deleted_by
        FROM users_old;
      `);

      db.exec('DROP TABLE users_old;');

      db.exec('COMMIT');
      console.log('✅ users пересоздана, роль moderator разрешена');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  } catch (e) {
    console.error('migrateUsersRoleCheck error:', e);
  }
}

// ─── МОДЕР ───

function ensureModerator() {
  const exists = db.prepare("SELECT id FROM users WHERE role = 'moderator'").get();
  if (exists) return;

  const hash = bcrypt.hashSync(MODER_PASSWORD, 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, avatar, avatar_bg, last_seen)
    VALUES (?, ?, 'moderator', ?, '👑', 9, datetime('now'))
  `).run(MODER_LOGIN, hash, MODER_NAME);

  console.log(`👑 Модер создан: логин «${MODER_LOGIN}», пароль «${MODER_PASSWORD}»`);
  console.log(`   ⚠️  Смените пароль в server/db/init.js и перезапустите сервер.`);
}

// ─── АВТООЧИСТКА КОРЗИНЫ ───

function cleanTrash() {
  const result = db.prepare(`
    DELETE FROM users
    WHERE deleted_at IS NOT NULL
      AND deleted_at < datetime('now', '-' || ? || ' days')
  `).run(TRASH_DAYS);

  if (result.changes > 0) {
    console.log(`🔥 Очищено ${result.changes} аккаунтов из корзины (старше ${TRASH_DAYS} дней)`);
  }
}

// ─── Вводная тема ───

const WELCOME_TOPIC_TITLE = 'Введение';
const WELCOME_TOPIC_DESCRIPTION = 'Знакомство с платформой';
const WELCOME_MATERIAL_TITLE = 'Добро пожаловать на платформу «Алхимичка»!';
const WELCOME_MATERIAL_TEXT = `Добро пожаловать на платформу «Алхимичка»!

Здесь вы будете:
📚 Изучать темы, которые для вас открывает учитель
🧪 Проходить тесты и получать мгновенные результаты
📊 Следить за своим прогрессом в истории попыток
💬 Задавать вопросы учителю в чате

Что делать сейчас:
1. Прочитайте этот материал до конца
2. Откройте раздел «📚 Мои темы» — там появятся темы, когда учитель откроет вам доступ
3. Если понадобится помощь — пишите учителю в 💬 Чат

Удачи! 🚀`;

function ensureWelcomeTopics() {
  const tutors = db.prepare(`
    SELECT u.id FROM users u
    WHERE u.role = 'tutor'
      AND u.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM topics t WHERE t.tutor_id = u.id AND t.is_welcome = 1)
  `).all();

  if (!tutors.length) return;

  const insertTopic = db.prepare(`
    INSERT INTO topics (tutor_id, title, description, position, is_welcome, grade)
    VALUES (?, ?, ?, ?, 1, NULL)
  `);
  const insertMaterial = db.prepare(`
    INSERT INTO materials (topic_id, title, type, content, position)
    VALUES (?, ?, 'text', ?, 0)
  `);

  for (const t of tutors) {
    const info = insertTopic.run(
      t.id,
      WELCOME_TOPIC_TITLE,
      WELCOME_TOPIC_DESCRIPTION,
      -1
    );
    insertMaterial.run(info.lastInsertRowid, WELCOME_MATERIAL_TITLE, WELCOME_MATERIAL_TEXT);
  }
  console.log(`⭐ Вводные темы созданы для ${tutors.length} учителей`);
}

// ─── Миграция: открыть старые темы всем ───

function openExistingTopicsForAll() {
  const accessCount = db.prepare('SELECT COUNT(*) AS c FROM topic_access').get().c;
  if (accessCount > 0) return;

  const topicsCount = db.prepare('SELECT COUNT(*) AS c FROM topics WHERE is_welcome = 0').get().c;
  if (topicsCount === 0) return;

  const students = db.prepare("SELECT id, created_by FROM users WHERE role = 'student' AND deleted_at IS NULL").all();
  if (!students.length) return;

  const topics = db.prepare('SELECT id, tutor_id FROM topics WHERE is_welcome = 0').all();
  if (!topics.length) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO topic_access (topic_id, student_id, can_materials, can_test)
    VALUES (?, ?, 1, 1)
  `);

  let count = 0;
  for (const s of students) {
    for (const t of topics) {
      if (t.tutor_id === s.created_by) {
        insert.run(t.id, s.id);
        count++;
      }
    }
  }
  console.log(`🔓 Открыто ${count} доступов (миграция)`);
}

initDb.TRASH_DAYS = TRASH_DAYS;
initDb.cleanTrash = cleanTrash;

module.exports = initDb;