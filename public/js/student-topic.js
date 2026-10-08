/* public/js/student-topic.js */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const params = new URLSearchParams(location.search);
const topicId = Number(params.get('id'));
if (!topicId) location.href = 'dashboard-student.html';

async function api(url, opts = {}) {
  const res = await fetch('/api' + url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    const err = new Error(json.error || 'Нет доступа');
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(json.error || 'Ошибка');
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = 'toast', 2600);
}

function fileIcon(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return '📕';
  if (['doc','docx'].includes(ext)) return '📘';
  if (['xls','xlsx','csv'].includes(ext)) return '📗';
  if (['ppt','pptx'].includes(ext)) return '📙';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return '🖼';
  if (['txt','md','rtf'].includes(ext)) return '📄';
  return '📎';
}
function formatSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' Б';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' КБ';
  return (b/1024/1024).toFixed(2) + ' МБ';
}
function formatDuration(sec) {
  if (sec === null || sec === undefined) return '—';
  sec = Math.round(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return s + ' сек';
  return m + ' мин ' + s + ' сек';
}

// ⭐ Классы
const GRADES = {
  junior: { full: 'Младшая группа', cls: 'g-junior' },
  '8':    { full: '8 класс', cls: 'g-8' },
  '9':    { full: '9 класс', cls: 'g-9' },
  '10':   { full: '10 класс', cls: 'g-10' },
  '11':   { full: '11 класс', cls: 'g-11' },
  adult:  { full: 'Старшие', cls: 'g-adult' }
};

let topicData = null;

async function loadTopic() {
  try {
    const data = await api('/my/topics/' + topicId);
    topicData = data;

    $('#t-title').textContent = data.topic.title;
    $('#t-desc').textContent = data.topic.description || '';

    // ⭐ Бейдж класса
    const gradeWrap = $('#t-grade-wrap');
    if (gradeWrap) {
      if (data.topic.is_welcome === 1) {
        gradeWrap.innerHTML = `<span class="grade-badge" style="background:linear-gradient(135deg,rgba(255,170,0,.16),rgba(255,170,0,.05));color:#c47f00">⭐ Вводная</span>`;
      } else if (data.topic.grade && GRADES[data.topic.grade]) {
        const g = GRADES[data.topic.grade];
        gradeWrap.innerHTML = `<span class="grade-badge ${g.cls}">${g.full}</span>`;
      } else {
        gradeWrap.innerHTML = '';
      }
    }

    renderMaterials(data.materials);
    await renderTestBlock(data);

    handleHashHighlight();
  } catch (e) {
    if (e.status === 403) {
      showAccessDenied(e.payload?.error || 'Доступ к теме закрыт учителем');
      return;
    }
    if (e.status === 404) {
      showNotFound('Тема не найдена или была удалена учителем');
      return;
    }
    toast(e.message, 'error');
    setTimeout(() => location.href = 'dashboard-student.html', 1500);
  }
}

// ⭐ Заглушки
function showAccessDenied(msg) {
  document.querySelector('.st-wrap').innerHTML = `
    <a href="dashboard-student.html" class="st-back">← Мои темы</a>
    <div style="background:var(--white);border-radius:28px;padding:56px 40px;border:1.5px solid var(--border);text-align:center;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#e0435c,#ff7a8e)"></div>
      <div style="font-size:88px;line-height:1;margin-bottom:16px">🔒</div>
      <h2 style="font-size:28px;font-weight:800;margin-bottom:10px">Доступ закрыт</h2>
      <p style="color:var(--gray);font-size:15px;max-width:420px;margin:0 auto 28px;line-height:1.5">
        ${esc(msg)}.<br>
        Обратитесь к учителю, если считаете, что это ошибка.
      </p>
      <a href="dashboard-student.html" class="btn btn-accent" style="padding:14px 32px">
        ← Вернуться к темам
      </a>
    </div>
  `;
}

function showNotFound(msg) {
  document.querySelector('.st-wrap').innerHTML = `
    <a href="dashboard-student.html" class="st-back">← Мои темы</a>
    <div style="background:var(--white);border-radius:28px;padding:56px 40px;border:1.5px solid var(--border);text-align:center">
      <div style="font-size:88px;line-height:1;margin-bottom:16px">🤷</div>
      <h2 style="font-size:28px;font-weight:800;margin-bottom:10px">Не найдено</h2>
      <p style="color:var(--gray);font-size:15px;max-width:420px;margin:0 auto 28px;line-height:1.5">
        ${esc(msg)}
      </p>
      <a href="dashboard-student.html" class="btn btn-accent" style="padding:14px 32px">
        ← Вернуться к темам
      </a>
    </div>
  `;
}

function renderMaterials(mats) {
  const v = $('#materials');
  if (!mats.length) {
    v.innerHTML = `<div class="empty" style="padding:30px 20px">
      <span class="empty-icon" style="font-size:48px">📄</span>
      <h3 style="font-size:18px">Материалов пока нет</h3>
      <p>Учитель ещё не добавил материалы к этой теме</p>
    </div>`;
    return;
  }

  v.innerHTML = mats.map((m) => {
    const isFile = !!m.file_path;
    const icon = isFile ? fileIcon(m.file_name || '') : (m.type === 'link' ? '🔗' : '📝');

    let sub, body;
    if (isFile) {
      sub = '📥 Скачать файл' + (m.file_size ? ' · ' + formatSize(m.file_size) : '');
      body = `<a href="${esc(m.content)}" download="${esc(m.file_name || '')}" target="_blank" rel="noopener">
        📥 Скачать ${esc(m.file_name || 'файл')}
      </a>`;
    } else if (m.type === 'link') {
      sub = '🔗 Внешняя ссылка';
      body = `<a href="${esc(m.content)}" target="_blank" rel="noopener">${esc(m.content)}</a>`;
    } else {
      sub = '📝 Конспект';
      body = esc(m.content);
    }

    return `
      <div class="st-mat" data-mat-id="${m.id}" id="m-${m.id}">
        <div class="st-mat-head">
          <div class="ic">${icon}</div>
          <div class="body">
            <div class="title">${esc(m.title)}</div>
            <div class="sub">${sub}</div>
          </div>
          <div class="chev">▶</div>
        </div>
        <div class="st-mat-body">
          <div class="inner">${body}</div>
        </div>
      </div>
    `;
  }).join('');

  $$('.st-mat-head').forEach(h => {
    h.addEventListener('click', () => {
      h.closest('.st-mat').classList.toggle('open');
    });
  });

  $$('.st-mat').forEach(el => {
    const sub = $('.sub', el).textContent;
    if (sub.startsWith('🔗') || sub.startsWith('📥')) {
      el.classList.add('open');
    }
  });
}

async function renderTestBlock(data) {
  const v = $('#test-block');

  if (data.topic.is_welcome === 1) {
    v.innerHTML = `
      <div class="test-cta">
        <span class="emoji">⭐</span>
        <h3>Вводная тема</h3>
        <p>Эта тема — знакомство с платформой. Тест здесь не предусмотрен.</p>
      </div>
    `;
    return;
  }

  const hasTest = data.test && data.questions_count > 0;

  if (!hasTest) {
    v.innerHTML = `<div class="test-cta">
      <span class="emoji">⏳</span>
      <h3>Тест пока не готов</h3>
      <p>Учитель ещё не добавил вопросы к этой теме</p>
    </div>`;
    return;
  }

  const maxAttempts = data.test.max_attempts;
  const attemptsUsed = data.attempts_used || 0;
  const isLimitReached = maxAttempts && attemptsUsed >= maxAttempts;
  const canTakeTest = data.can_take_test === 1;

  if (!canTakeTest) {
    v.innerHTML = `
      <div class="test-cta" style="background:linear-gradient(135deg,rgba(224,67,92,.06),rgba(224,67,92,.02));border:1.5px solid rgba(224,67,92,.25)">
        <span class="emoji">🔒</span>
        <h3 style="color:var(--danger)">Тест закрыт</h3>
        <p>Учитель не открыл вам доступ к тесту по этой теме.<br>Материалы доступны — изучайте!</p>
      </div>
    `;
    return;
  }

  let best = null;
  let pending = null;
  try {
    const { attempts } = await api('/my/attempts');
    const my = attempts.filter(a => a.topic_id === topicId);
    const pendingList = my.filter(a => a.status === 'pending_review');
    if (pendingList.length) pending = pendingList[0];
    const reviewed = my.filter(a => a.status !== 'pending_review');
    if (reviewed.length) {
      best = reviewed.reduce((b, a) => {
        const p = a.score / a.total;
        return (!b || p > (b.score / b.total)) ? a : b;
      }, null);
    }
  } catch (e) {}

  let statusHtml = '';
  if (pending) {
    statusHtml = `<div class="best-result" style="background:rgba(255,170,0,.12);color:#c47f00;">
      ⏳ Ваша работа отправлена на проверку учителю
    </div>`;
  } else if (best) {
    statusHtml = `<div class="best-result">
      ⭐ Ваш лучший результат: ${Math.round(best.score / best.total * 100)}%
      (${best.score} из ${best.total})
    </div>`;
  }

  const infoBits = [];
  if (data.test.timer_min) infoBits.push(`⏱ ${data.test.timer_min} мин`);
  if (maxAttempts) {
    infoBits.push(`🔁 Попыток: ${attemptsUsed} из ${maxAttempts}`);
  } else {
    infoBits.push(`🔁 Без ограничения попыток`);
  }
  const infoHtml = infoBits.length
    ? `<div style="font-size:13.5px;color:var(--gray);font-weight:600;margin-bottom:12px">${infoBits.join(' · ')}</div>`
    : '';

  let buttonLabel;
  if (isLimitReached) {
    buttonLabel = 'Попытки закончились';
  } else {
    buttonLabel = pending ? 'Пройти ещё раз'
                : best ? 'Пройти заново'
                : 'Начать тест';
  }

  v.innerHTML = `<div class="test-cta">
    <span class="emoji">🧪</span>
    <h3>${esc(data.test.title)}</h3>
    <p>Вопросов: <b>${data.questions_count}</b></p>
    ${infoHtml}
    ${statusHtml}
    <br>
    ${isLimitReached
      ? `<button class="btn btn-ghost" disabled style="padding:16px 40px;font-size:16px;opacity:.55;cursor:not-allowed">
           🚫 ${buttonLabel}
         </button>`
      : `<a class="btn btn-accent" href="take-test.html?id=${topicId}" style="padding:16px 40px;font-size:16px">
           ${buttonLabel} →
         </a>`
    }
  </div>`;
}

function handleHashHighlight() {
  const hash = location.hash;
  if (!hash || !hash.startsWith('#m-')) return;

  const matId = hash.slice(3);
  const tile = document.getElementById('m-' + matId);
  if (!tile) return;

  setTimeout(() => {
    tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);

  tile.classList.add('open');

  setTimeout(() => {
    tile.classList.add('highlight-material');
    setTimeout(() => tile.classList.remove('highlight-material'), 2600);
  }, 400);

  history.replaceState(null, '', location.pathname + location.search);
}

(async function boot() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'student') {
      location.href = 'tutor-login.html';
      return;
    }
    loadTopic();
  } catch (e) {}
})();