/* public/js/dashboard-tutor.js */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, opts = {}) {
  const res = await fetch('/api' + url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    location.href = 'tutor-login.html';
    throw new Error('unauth');
  }
  if (!res.ok) throw new Error(json.error || 'Ошибка');
  return json;
}

function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.className = 'toast', 2600);
}

function openModal(id)  { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }

$$('.modal-backdrop').forEach(bd => {
  bd.addEventListener('click', (e) => {
    if (e.target === bd) bd.classList.remove('open');
  });
});
$$('[data-close]').forEach(b => {
  b.addEventListener('click', () => b.closest('.modal-backdrop').classList.remove('open'));
});

document.addEventListener('click', (e) => {
  const f = e.target.closest('.copy-field');
  if (!f) return;
  const val = $('.val', f).textContent;
  navigator.clipboard.writeText(val).then(() => {
    const old = $('.cpy', f).textContent;
    $('.cpy', f).textContent = 'Скопировано';
    f.style.borderColor = 'var(--accent)';
    setTimeout(() => {
      $('.cpy', f).textContent = old;
      f.style.borderColor = '';
    }, 1400);
  });
});

$('#menu-btn')?.addEventListener('click', () => {
  $('#sidebar').classList.add('open');
  $('#backdrop').classList.add('show');
});
$('#backdrop')?.addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('show');
});

// ═══ SVG-иконки для динамики ═══
function ico(id, cls = 'ico') {
  return `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
}

function skeletonTiles(n = 4) {
  let html = '';
  for (let i = 0; i < n; i++) {
    html += `<div class="tile"><div class="skeleton sk-line w60"></div>
      <div class="skeleton sk-line w40"></div>
      <div class="skeleton sk-line"></div>
      <div class="skeleton sk-line w60" style="margin-bottom:0"></div></div>`;
  }
  return html;
}

function formatDuration(sec) {
  if (sec === null || sec === undefined) return '—';
  sec = Math.round(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return s + ' сек';
  return m + ' мин ' + s + ' сек';
}

function letterFor(i) { return String.fromCharCode(65 + i); }

// ⭐ Классы
const GRADES = [
  { id: 'junior', label: 'Младшая', full: 'Младшая группа', cls: 'g-junior' },
  { id: '8',      label: '8 кл.',  full: '8 класс',       cls: 'g-8' },
  { id: '9',      label: '9 кл.',  full: '9 класс',       cls: 'g-9' },
  { id: '10',     label: '10 кл.', full: '10 класс',      cls: 'g-10' },
  { id: '11',     label: '11 кл.', full: '11 класс',      cls: 'g-11' },
  { id: 'adult',  label: 'Старшие', full: 'Старшие',      cls: 'g-adult' }
];
function gradeInfo(id) { return GRADES.find(g => g.id === id) || null; }
function gradeBadge(id) {
  const g = gradeInfo(id);
  if (!g) return '';
  return `<span class="grade-badge ${g.cls}">${esc(g.full)}</span>`;
}

const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

let me = null;
let topicsCache = [];
let studentsCache = [];
let reviewsCache = [];
let reviewsPollTimer = null;
let resultsPollTimer = null;
let currentReviewAttempt = null;
let currentReviewDetail = [];
let currentReviewGrades = {};
let currentAccessStudent = null;
let currentDuplicateTopic = null;

let topicsGradeFilter = 'all';
let studentsGradeFilter = 'all';

let scheduleMonday = null;
let scheduleLessonsCache = [];
let currentLessonCard = null;
let editingLessonId = null;

function switchView(view) {
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  ['topics', 'students', 'chat', 'reviews', 'results', 'schedule'].forEach(v => {
    $('#view-' + v).style.display = (v === view) ? '' : 'none';
  });
  const titles = {
    topics:   ['Мои темы', 'Управляйте темами, материалами и тестами'],
    students: ['Мои ученики', 'Создавайте аккаунты и сбрасывайте пароли'],
    chat:     ['Чат', 'Переписка с учениками'],
    reviews:  ['Проверка работ', 'Ответы, ожидающие вашей оценки'],
    results:  ['Результаты', 'Все попытки ваших учеников — кликните, чтобы посмотреть ответы'],
    schedule: ['Расписание', 'Еженедельные занятия с учениками']
  };
  $('#page-title').textContent = titles[view][0];
  $('#page-sub').textContent = titles[view][1];
  $('#head-action').innerHTML = '';

  if (view === 'topics') {
    $('#head-action').innerHTML =
      `<button class="btn btn-primary" id="btn-add-topic">${ico('plus','ico ico-sm')} Новая тема</button>`;
    $('#btn-add-topic').onclick = () => {
      $('#new-topic-title').value = '';
      $('#new-topic-desc').value = '';
      $('#new-topic-grade').value = '';
      openModal('modal-topic');
      setTimeout(() => $('#new-topic-title').focus(), 100);
    };
    loadTopics();
  }
  if (view === 'students') {
    $('#head-action').innerHTML =
      `<button class="btn btn-primary" id="btn-add-student">${ico('plus','ico ico-sm')} Новый ученик</button>`;
    $('#btn-add-student').onclick = () => {
      $('#new-student-name').value = '';
      $('#new-student-grade').value = '';
      openModal('modal-student');
      setTimeout(() => $('#new-student-name').focus(), 100);
    };
    loadStudents();
  }
  if (view === 'reviews') loadReviews();
  if (view === 'results') loadResults();
  if (view === 'schedule') loadSchedule();
}

$$('.nav-item').forEach(n => n.addEventListener('click', () => {
  switchView(n.dataset.view);
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('show');
}));

window.switchToChatSection = function () {
  switchView('chat');
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('show');
};

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.href = 'index.html';
});

// ═══ СЧЁТЧИКИ ═══

async function refreshReviewCounter() {
  try {
    const { count } = await api('/reviews/count');
    const badge = $('#cnt-reviews');
    const nav = $('#nav-reviews');
    if (!badge || !nav) return;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = '';
      nav.classList.add('has-alert');
    } else {
      badge.style.display = 'none';
      nav.classList.remove('has-alert');
    }
  } catch (e) {}
}

function startReviewsPolling() {
  refreshReviewCounter();
  if (reviewsPollTimer) clearInterval(reviewsPollTimer);
  reviewsPollTimer = setInterval(refreshReviewCounter, 15000);
}

async function refreshUnseenCounter() {
  try {
    const data = await api('/results/unseen');
    const count = data.count || 0;

    const nav = $$('.nav-item').find(n => n.dataset.view === 'results');
    if (!nav) return;

    let badge = nav.querySelector('.unseen-badge');

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'chat-nav-badge unseen-badge';
        badge.style.marginLeft = 'auto';
        nav.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = '';
      nav.classList.add('has-chat');
    } else {
      if (badge) badge.style.display = 'none';
      nav.classList.remove('has-chat');
    }
  } catch (e) {}
}

function startUnseenPolling() {
  refreshUnseenCounter();
  if (resultsPollTimer) clearInterval(resultsPollTimer);
  resultsPollTimer = setInterval(refreshUnseenCounter, 10000);
}

// ═══ ФИЛЬТР-ТАБЫ ПО КЛАССАМ ═══

function renderGradeTabs(items, active) {
  const counts = {};
  for (const g of GRADES) counts[g.id] = 0;
  for (const it of items) {
    if (it.grade && counts[it.grade] !== undefined) counts[it.grade]++;
  }
  const total = items.length;

  let html = '<div class="grade-tabs">';
  html += `<button class="grade-tab ${active === 'all' ? 'active' : ''}" data-grade="all">Все <span class="cnt">${total}</span></button>`;
  for (const g of GRADES) {
    html += `<button class="grade-tab ${active === g.id ? 'active' : ''}" data-grade="${g.id}">
      ${esc(g.full)} <span class="cnt">${counts[g.id]}</span>
    </button>`;
  }
  html += '</div>';

  return html;
}

function wireGradeTabs(container, onSelect) {
  $$('.grade-tab', container).forEach(tab => {
    tab.addEventListener('click', () => {
      onSelect(tab.dataset.grade);
    });
  });
}

// ═══ ТЕМЫ ═══

async function loadTopics() {
  const v = $('#view-topics');
  v.innerHTML = `<div class="grid grid-2">${skeletonTiles(4)}</div>`;
  try {
    const { topics } = await api('/topics');
    topicsCache = topics;
    $('#cnt-topics').textContent = topics.length;

    if (!topics.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon">${ico('book','ico-xl')}</span>
        <h3>Пока нет тем</h3>
        <p>Создайте первую тему и добавьте в неё материалы и тест</p>
        <button class="btn btn-primary" id="empty-add-topic">Создать тему</button>
      </div>`;
      $('#empty-add-topic').onclick = () => $('#btn-add-topic').click();
      return;
    }

    const filtered = topicsGradeFilter === 'all'
      ? topics
      : topics.filter(t => t.is_welcome === 1 || t.grade === topicsGradeFilter);

    let html = renderGradeTabs(topics, topicsGradeFilter);

    if (!filtered.length) {
      html += `<div class="empty" style="padding:40px 20px">
        <span class="empty-icon" style="font-size:48px">${ico('folder','ico-lg')}</span>
        <h3 style="font-size:18px">В этом классе пока нет тем</h3>
        <p>Создайте новую тему или скопируйте существующую</p>
      </div>`;
      v.innerHTML = html;
      wireGradeTabs(v, (g) => {
        topicsGradeFilter = g;
        loadTopics();
      });
      return;
    }

    html += `<div class="grid grid-2">${filtered.map(t => {
      const isWelcome = t.is_welcome === 1;
      const welcomeBadge = isWelcome
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,rgba(255,170,0,.16),rgba(255,170,0,.05));color:#c47f00;font-size:11px;font-weight:700;margin-left:8px;vertical-align:middle">${ico('star','ico-sm')} Вводная</span>`
        : '';
      const draftBadge = (t.test_is_draft === 1 && !isWelcome)
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;background:rgba(255,170,0,.14);color:#c47f00;font-size:11px;font-weight:700;margin-left:8px;vertical-align:middle">${ico('pencil','ico-sm')} Черновик</span>`
        : '';

      const gradeBadgeHtml = !isWelcome && t.grade ? gradeBadge(t.grade) : '';

      const deleteBtn = isWelcome
        ? ''
        : `<button class="btn btn-ghost btn-only-icon" data-del="${t.id}" title="Удалить">${ico('trash','ico')}</button>`;

      const duplicateBtn = isWelcome
        ? ''
        : `<button class="btn btn-ghost btn-only-icon" data-dup="${t.id}" title="Скопировать в другой класс">${ico('copy','ico')}</button>`;

      return `
      <div class="tile">
        <div class="tile-title">${esc(t.title)}${welcomeBadge}${draftBadge}</div>
        ${gradeBadgeHtml ? `<div style="margin-top:6px;margin-bottom:8px">${gradeBadgeHtml}</div>` : ''}
        <div class="tile-desc">${esc(t.description || 'Без описания')}</div>
        <div class="tile-meta">
          <span>${ico('file-text','ico-sm')} <b>${t.materials_count}</b> материалов</span>
          ${isWelcome
            ? `<span style="color:#c47f00;font-weight:600">без теста</span>`
            : `<span>${ico('help','ico-sm')} <b>${t.questions_count}</b> вопросов</span>`
          }
        </div>
        <div class="tile-actions">
          <a class="btn btn-primary" href="topic.html?id=${t.id}" style="flex:1">Открыть</a>
          ${duplicateBtn}
          ${deleteBtn}
        </div>
      </div>
    `;
    }).join('')}</div>`;

    v.innerHTML = html;

    wireGradeTabs(v, (g) => {
      topicsGradeFilter = g;
      loadTopics();
    });

    $$('[data-del]', v).forEach(b => {
      b.onclick = () => {
        const id = Number(b.dataset.del);
        const t = topicsCache.find(x => x.id === id);
        askConfirm('Удалить тему?',
          `«${t.title}» будет удалена вместе с материалами и тестом.`,
          async () => {
            try {
              await api('/topics/' + id, { method: 'DELETE' });
              toast('Тема удалена', 'success');
              loadTopics();
            } catch (e) { toast(e.message, 'error'); }
          });
      };
    });

    $$('[data-dup]', v).forEach(b => {
      b.onclick = () => {
        const id = Number(b.dataset.dup);
        const t = topicsCache.find(x => x.id === id);
        openDuplicateModal(t);
      };
    });
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

function openDuplicateModal(topic) {
  currentDuplicateTopic = topic;
  $('#dup-source-info').textContent = `Из темы: «${topic.title}»`;
  $('#dup-title').value = `${topic.title} — копия`;
  $('#dup-grade').value = '';
  openModal('modal-duplicate');
  setTimeout(() => $('#dup-title').focus(), 100);
}

$('#do-duplicate')?.addEventListener('click', async () => {
  if (!currentDuplicateTopic) return;
  const title = $('#dup-title').value.trim();
  const grade = $('#dup-grade').value;
  if (!title) return toast('Введите название', 'error');
  if (!grade) return toast('Выберите класс', 'error');

  const btn = $('#do-duplicate');
  btn.disabled = true;
  btn.textContent = 'Копируем…';

  try {
    await api('/topics/' + currentDuplicateTopic.id + '/duplicate', {
      method: 'POST',
      body: { title, grade }
    });
    toast('Тема скопирована', 'success');
    closeModal('modal-duplicate');
    loadTopics();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${ico('copy','ico ico-sm')} Скопировать`;
  }
});

// ═══ УЧЕНИКИ ═══

async function loadStudents() {
  const v = $('#view-students');
  v.innerHTML = `<div class="grid grid-3">${skeletonTiles(3)}</div>`;
  try {
    const { students } = await api('/students');
    studentsCache = students;
    $('#cnt-students').textContent = students.length;

    if (!students.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon">${ico('users','ico-xl')}</span>
        <h3>Пока нет учеников</h3>
        <p>Создайте первого — система сгенерирует логин и пароль</p>
        <button class="btn btn-primary" id="empty-add-student">Создать ученика</button>
      </div>`;
      $('#empty-add-student').onclick = () => $('#btn-add-student').click();
      return;
    }

    const filtered = studentsGradeFilter === 'all'
      ? students
      : students.filter(s => s.grade === studentsGradeFilter);

    let html = renderGradeTabs(students, studentsGradeFilter);

    if (!filtered.length) {
      html += `<div class="empty" style="padding:40px 20px">
        <span class="empty-icon" style="font-size:48px">${ico('folder','ico-lg')}</span>
        <h3 style="font-size:18px">В этом классе пока нет учеников</h3>
        <p>Создайте нового или измените класс существующего</p>
      </div>`;
      v.innerHTML = html;
      wireGradeTabs(v, (g) => {
        studentsGradeFilter = g;
        loadStudents();
      });
      return;
    }

    html += `<div class="grid grid-2">${filtered.map(s => `
      <div class="tile" data-student-tile="${s.id}">
        <div class="student-tile-head">
          ${window.Avatars.html(s, { size: 'md', title: s.display_name })}
          <div class="st-info">
            <div class="st-name">${esc(s.display_name)}</div>
            <div class="st-login">Логин: <b>${esc(s.username)}</b></div>
            <div class="st-grade">${gradeBadge(s.grade)}</div>
          </div>
        </div>
        <div class="tile-actions" style="flex-wrap:wrap;gap:6px;margin-top:14px">
          <button class="btn btn-ghost" data-access="${s.id}" style="flex:1;min-width:130px;padding:10px 14px;font-size:13.5px" title="Доступ к темам">${ico('folder','ico ico-sm')} Доступ</button>
          <button class="btn btn-ghost btn-only-icon" data-change-grade="${s.id}" style="width:44px;padding:10px 0" title="Сменить класс">${ico('cap','ico')}</button>
          <button class="btn btn-ghost btn-only-icon" data-reset="${s.id}" style="width:44px;padding:10px 0" title="Сбросить пароль">${ico('key','ico')}</button>
          <button class="btn btn-ghost btn-only-icon" data-chat-to="${s.id}" style="width:44px;padding:10px 0" title="Написать в чат">${ico('message','ico')}</button>
          <button class="btn btn-ghost btn-only-icon" data-del-student="${s.id}" style="width:44px;padding:10px 0;color:var(--danger);border-color:rgba(224,67,92,.3)" title="Удалить">${ico('trash','ico')}</button>
        </div>
      </div>
    `).join('')}</div>`;

    v.innerHTML = html;

    wireGradeTabs(v, (g) => {
      studentsGradeFilter = g;
      loadStudents();
    });

    $$('[data-access]', v).forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const sid = Number(b.dataset.access);
        openStudentAccessModal(sid);
      };
    });

    $$('[data-change-grade]', v).forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = Number(b.dataset.changeGrade);
        const s = studentsCache.find(x => x.id === id);
        openChangeGradeModal(s);
      };
    });

    $$('[data-reset]', v).forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = Number(b.dataset.reset);
        const s = studentsCache.find(x => x.id === id);
        askConfirm('Сбросить пароль?',
          `Для «${s.display_name}» будет сгенерирован новый пароль.`,
          async () => {
            try {
              const { student } = await api('/students/' + id + '/reset-password', { method: 'POST' });
              showCreds(student);
              toast('Пароль обновлён', 'success');
            } catch (e) { toast(e.message, 'error'); }
          });
      };
    });

    $$('[data-chat-to]', v).forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const uid = Number(b.dataset.chatTo);
        switchView('chat');
        setTimeout(() => {
          if (window.Chat) window.Chat.openWith(uid);
        }, 200);
      };
    });

    $$('[data-del-student]', v).forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        const id = Number(b.dataset.delStudent);
        const s = studentsCache.find(x => x.id === id);
        if (!s) return;
        askConfirm('Удалить ученика?',
          `«${s.display_name}» и все его попытки будут удалены безвозвратно.`,
          async () => {
            try {
              await api('/students/' + id, { method: 'DELETE' });
              toast('Ученик удалён', 'success');
              loadStudents();
            } catch (e) { toast(e.message, 'error'); }
          });
      };
    });

    const params = new URLSearchParams(location.search);
    const highlightId = params.get('highlight-student');
    if (highlightId) {
      history.replaceState(null, '', 'dashboard-tutor.html');
      setTimeout(() => {
        const tile = $(`[data-student-tile="${highlightId}"]`);
        if (tile) {
          tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
          tile.classList.add('highlight-target');
          setTimeout(() => tile.classList.remove('highlight-target'), 5000);
        }
      }, 100);
    }
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ⭐ Модалка смены класса
let currentChangeGradeStudent = null;

function ensureChangeGradeModal() {
  if ($('#modal-change-grade')) return;
  const html = `
    <div class="modal-backdrop" id="modal-change-grade">
      <div class="modal">
        <h3>${ico('cap','ico ico-lg')} Сменить класс</h3>
        <p class="muted mt-1" style="font-size:13.5px" id="cg-student-name"></p>
        <div class="form-group mt-3">
          <label class="label">Новый класс</label>
          <select class="input" id="cg-grade">
            <option value="junior">Младшая группа</option>
            <option value="8">8 класс</option>
            <option value="9">9 класс</option>
            <option value="10">10 класс</option>
            <option value="11">11 класс</option>
            <option value="adult">Старшие</option>
          </select>
        </div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-ghost" data-close>Отмена</button>
          <button class="btn btn-primary" id="cg-save">Сохранить</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  $('#modal-change-grade').addEventListener('click', (e) => {
    if (e.target.id === 'modal-change-grade' || e.target.closest('[data-close]')) {
      $('#modal-change-grade').classList.remove('open');
    }
  });

  $('#cg-save').addEventListener('click', async () => {
    if (!currentChangeGradeStudent) return;
    const grade = $('#cg-grade').value;
    try {
      await api('/students/' + currentChangeGradeStudent.id, {
        method: 'PATCH',
        body: { grade }
      });
      toast('Класс изменён', 'success');
      closeModal('modal-change-grade');
      loadStudents();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openChangeGradeModal(student) {
  ensureChangeGradeModal();
  currentChangeGradeStudent = student;
  $('#cg-student-name').textContent = `Ученик: «${student.display_name}»`;
  $('#cg-grade').value = student.grade || '';
  openModal('modal-change-grade');
}

// ═══ МОДАЛКА ДОСТУПА УЧЕНИКА К ТЕМАМ ═══

async function openStudentAccessModal(studentId) {
  try {
    const data = await api('/students/' + studentId + '/access');
    currentAccessStudent = data.student;

    $('#st-access-title').innerHTML = `${ico('folder','ico ico-lg')} Доступ к темам · ${esc(data.student.display_name)}`;
    $('#st-access-sub').textContent = 'Темы своего класса открыты автоматически';

    const topics = data.topics || [];

    if (!topics.length) {
      $('#st-access-body').innerHTML = `
        <div class="empty" style="padding:30px 20px">
          <span class="empty-icon" style="font-size:48px">${ico('book','ico-lg')}</span>
          <h3 style="font-size:18px">Пока нет тем</h3>
          <p>Создайте темы — здесь появятся галочки доступа</p>
        </div>
      `;
      openModal('modal-student-access');
      return;
    }

    $('#st-access-body').innerHTML = `
      <div class="access-list">
        ${topics.map(t => {
          const isWelcome = t.is_welcome === 1;
          const isAuto = t.auto_access === 1;
          const rowCls = isWelcome ? 'access-row welcome' : 'access-row';
          const welcomeTag = isWelcome
            ? `<span class="welcome-tag">${ico('star','ico-sm')} Вводная</span>`
            : (isAuto ? `<span class="welcome-tag" style="background:rgba(14,165,233,.14);color:var(--accent-dark)">${ico('cap','ico-sm')} Авто по классу</span>` : '');

          const switches = (isWelcome || isAuto)
            ? `
              <div class="switches">
                <label class="access-switch on disabled">
                  <span class="sw-dot"></span>
                  <span>${ico('file-text','ico-sm')} Материалы</span>
                </label>
                <label class="access-switch on disabled">
                  <span class="sw-dot"></span>
                  <span>${ico('help','ico-sm')} Тест</span>
                </label>
              </div>
            `
            : `
              <div class="switches">
                <label class="access-switch ${t.can_materials ? 'on' : ''}" data-topic-id="${t.id}" data-kind="materials">
                  <input type="checkbox" ${t.can_materials ? 'checked' : ''}>
                  <span class="sw-dot"></span>
                  <span>${ico('file-text','ico-sm')} Материалы</span>
                </label>
                <label class="access-switch ${t.can_test ? 'on' : ''}" data-topic-id="${t.id}" data-kind="test">
                  <input type="checkbox" ${t.can_test ? 'checked' : ''}>
                  <span class="sw-dot"></span>
                  <span>${ico('help','ico-sm')} Тест</span>
                </label>
              </div>
            `;

          return `
            <div class="${rowCls}" data-topic-id="${t.id}">
              <div class="info">
                <div class="name">${esc(t.title)}${welcomeTag}</div>
                ${t.grade ? gradeBadge(t.grade) : ''}
              </div>
              ${switches}
            </div>
          `;
        }).join('')}
      </div>
    `;

    $$('.access-switch:not(.disabled)', $('#st-access-body')).forEach(sw => {
      sw.addEventListener('click', async (e) => {
        e.preventDefault();
        const topicId = Number(sw.dataset.topicId);

        const checkbox = sw.querySelector('input');
        const newValue = !checkbox.checked;

        checkbox.checked = newValue;
        sw.classList.toggle('on', newValue);

        const row = sw.closest('.access-row');
        const matSw = row.querySelector('.access-switch[data-kind="materials"]');
        const testSw = row.querySelector('.access-switch[data-kind="test"]');

        const cm = matSw.querySelector('input').checked ? 1 : 0;
        const ct = testSw.querySelector('input').checked ? 1 : 0;

        try {
          await api('/students/' + studentId + '/access', {
            method: 'PATCH',
            body: { topic_id: topicId, can_materials: cm, can_test: ct }
          });
        } catch (err) {
          checkbox.checked = !newValue;
          sw.classList.toggle('on', !newValue);
          toast(err.message, 'error');
        }
      });
    });

    openModal('modal-student-access');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══ ПРОВЕРКА РАБОТ ═══

async function loadReviews() {
  const v = $('#view-reviews');
  v.innerHTML = `<div class="grid grid-2">${skeletonTiles(3)}</div>`;
  try {
    const { reviews } = await api('/reviews/pending');
    reviewsCache = reviews;
    refreshReviewCounter();

    if (!reviews.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon" style="filter:grayscale(0.2)">${ico('check','ico-xl')}</span>
        <h3>Все работы проверены!</h3>
        <p>Здесь появятся новые попытки, как только ученики сдадут тесты с развёрнутыми вопросами</p>
      </div>`;
      return;
    }

    v.innerHTML = `<div class="grid grid-2">${reviews.map(r => {
      const student = {
        display_name: r.student_name,
        avatar: r.student_avatar,
        avatar_bg: r.student_avatar_bg
      };
      return `
        <div class="review-tile" data-review-id="${r.id}">
          <span class="review-avatar">${window.Avatars.html(student, { size: 'lg', extraClass: 'review-avatar' })}</span>
          <div class="review-info">
            <div class="review-name">${esc(r.student_name)}</div>
            <div class="review-meta">
              <span>${ico('book','ico-sm')} ${esc(r.topic_title)}</span>
              ${r.student_grade ? gradeBadge(r.student_grade) : ''}
              <span>${ico('clock','ico-sm')} ${formatDuration(r.duration_sec)}</span>
            </div>
          </div>
          <div class="review-actions">
            <button class="btn btn-primary" data-open-review="${r.id}">Проверить ${ico('arrow-right','ico-sm')}</button>
          </div>
        </div>
      `;
    }).join('')}</div>`;

    $$('[data-open-review]', v).forEach(b => {
      b.onclick = () => openReviewModal(Number(b.dataset.openReview));
    });
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

async function openReviewModal(attemptId) {
  try {
    const data = await api('/reviews/' + attemptId);
    currentReviewAttempt = data.attempt;
    currentReviewDetail = data.detail;
    currentReviewGrades = {};

    if (data.review) {
      for (const [qid, rv] of Object.entries(data.review)) {
        if (rv.grade) currentReviewGrades[qid] = { grade: rv.grade, comment: rv.comment || '' };
      }
    }

    $('#rv-title').textContent = `Проверка работы`;
    $('#rv-sub').textContent = `${currentReviewAttempt.student_name} · ${currentReviewAttempt.topic_title}`;

    renderReviewBody();
    openModal('modal-review');
    refreshUnseenCounter();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderReviewBody() {
  const openQuestions = currentReviewDetail.filter(d => d.type === 'open');
  const allAuto = currentReviewDetail.filter(d => d.type !== 'open');

  const student = {
    display_name: currentReviewAttempt.student_name,
    avatar: currentReviewAttempt.student_avatar,
    avatar_bg: currentReviewAttempt.student_avatar_bg
  };
  const studentHead = `
    <div class="rv-student-head">
      ${window.Avatars.html(student, { size: 'md' })}
      <div class="info">
        <div class="name">${esc(currentReviewAttempt.student_name)}</div>
        <div class="meta">${esc(currentReviewAttempt.topic_title)} · ${ico('clock','ico-sm')} ${formatDuration(currentReviewAttempt.duration_sec)}</div>
      </div>
    </div>
  `;

  const body = studentHead + `
    ${allAuto.length ? `
      <div class="detail-heading" style="margin-top:0;border-top:none;padding-top:0">
        ${ico('settings','ico-sm')} Авто-проверенные вопросы
      </div>
      ${allAuto.map((d, i) => renderReviewAuto(d, i)).join('')}
    ` : ''}

    ${openQuestions.length ? `
      <div class="detail-heading">${ico('pen','ico-sm')} Развёрнутые ответы — оцените вручную</div>
      ${openQuestions.map((d, i) => renderReviewOpen(d, i)).join('')}
    ` : ''}
  `;

  $('#rv-body').innerHTML = body;

  $$('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.dataset.qid;
      const grade = btn.dataset.grade;
      if (!currentReviewGrades[qid]) currentReviewGrades[qid] = { grade: null, comment: '' };
      currentReviewGrades[qid].grade = grade;

      $$(`[data-grade][data-qid="${qid}"]`).forEach(b => {
        b.classList.remove('active', 'correct', 'partial', 'wrong');
        if (b.dataset.grade === grade) b.classList.add('active', grade);
      });
      updateReviewProgress();
    });
  });

  $$('[data-comment]').forEach(ta => {
    ta.addEventListener('input', () => {
      const qid = ta.dataset.comment;
      if (!currentReviewGrades[qid]) currentReviewGrades[qid] = { grade: null, comment: '' };
      currentReviewGrades[qid].comment = ta.value;
    });
  });

  updateReviewProgress();
}

function renderReviewAuto(d, i) {
  const ok = d.auto_correct;
  const opts = d.options || [];
  const correctSet = new Set(d.correct || []);
  const givenSet = new Set(
    Array.isArray(d.given) ? d.given
    : typeof d.given === 'number' ? [d.given]
    : []
  );

  const typeLabel = d.type === 'multi' ? `${ico('check-square','ico-sm')} несколько` : `${ico('circle-dot','ico-sm')} один`;

  return `
    <div class="rv-q ${ok ? 'auto-correct' : 'auto-wrong'}">
      <div class="rv-q-head">
        <div class="rv-q-num">${i + 1}</div>
        <div class="rv-q-text">
          ${esc(d.text)}
          <span class="rv-q-type ${d.type}">${typeLabel}</span>
        </div>
      </div>
      <div>
        ${opts.map((o, idx) => {
          const isCorrect = correctSet.has(idx);
          const isGiven = givenSet.has(idx);
          let cls = '';
          let markBadge = '';
          if (isCorrect && isGiven) { cls = 'correct'; markBadge = `${ico('check','ico-sm')} верно`; }
          else if (isCorrect && !isGiven) { cls = 'correct'; markBadge = 'пропущено'; }
          else if (!isCorrect && isGiven) { cls = 'bad-give'; markBadge = `${ico('x','ico-sm')} лишний`; }
          else if (isGiven) { cls = 'given'; markBadge = 'выбрано'; }
          return `<div class="rv-opt ${cls}">
            <span class="key">${letterFor(idx)}</span>
            <span>${esc(o)}</span>
            ${markBadge ? `<span class="mark-badge">${markBadge}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderReviewOpen(d) {
  const qid = String(d.question_id);
  const graded = currentReviewGrades[qid] || {};
  const hasFile = !!d.given_file;

  return `
    <div class="rv-q open-q" data-open-block="${qid}">
      <div class="rv-q-head">
        <div class="rv-q-num">${ico('pen','ico-sm')}</div>
        <div class="rv-q-text">
          ${esc(d.text)}
          <span class="rv-q-type open">развёрнутый</span>
        </div>
      </div>

      <div class="rv-open-answer ${!d.given_text ? 'empty' : ''}">
        ${d.given_text ? esc(d.given_text) : '— ученик не написал ответ —'}
      </div>

      ${hasFile ? `
        <a class="rv-open-file" href="${esc(d.given_file)}" target="_blank" rel="noopener">
          <div class="fi">${ico('paperclip','ico-sm')}</div>
          <div>
            <div>${esc(d.given_file_name || 'файл')}</div>
            <div class="fs">Открыть в новой вкладке</div>
          </div>
        </a>
      ` : ''}

      <div class="grade-row">
        <div class="grade-btn ${graded.grade === 'correct' ? 'active correct' : ''}"
             data-grade="correct" data-qid="${qid}">
          <span class="ge">${ico('check','ico')}</span> Верно
        </div>
        <div class="grade-btn ${graded.grade === 'partial' ? 'active partial' : ''}"
             data-grade="partial" data-qid="${qid}">
          <span class="ge">${ico('circle-dot','ico')}</span> Частично
        </div>
        <div class="grade-btn ${graded.grade === 'wrong' ? 'active wrong' : ''}"
             data-grade="wrong" data-qid="${qid}">
          <span class="ge">${ico('x','ico')}</span> Неверно
        </div>
      </div>

      <label class="rv-comment-label">${ico('message','ico-sm')} Комментарий для ученика (необязательно)</label>
      <textarea class="rv-comment" data-comment="${qid}"
                placeholder="Например: молодец, но укажи ещё одну причину...">${esc(graded.comment || '')}</textarea>
    </div>
  `;
}

function updateReviewProgress() {
  const opens = currentReviewDetail.filter(d => d.type === 'open');
  const total = opens.length;
  const graded = opens.filter(d => {
    const g = currentReviewGrades[String(d.question_id)];
    return g && g.grade;
  }).length;

  const pill = $('#rv-progress-pill');
  pill.textContent = `${graded} / ${total} проверено`;
  pill.classList.toggle('done', graded === total);

  const hint = $('#rv-footer-hint');
  if (graded === total) {
    hint.textContent = 'Все ответы оценены, можно сохранять';
    hint.classList.add('done');
  } else {
    hint.textContent = `Осталось оценить: ${total - graded}`;
    hint.classList.remove('done');
  }

  $('#rv-save').disabled = graded < total;
  $('#rv-save').style.opacity = graded < total ? '.5' : '1';
}

$('#rv-save').addEventListener('click', async () => {
  if (!currentReviewAttempt) return;
  const attemptId = currentReviewAttempt.id;

  const opens = currentReviewDetail.filter(d => d.type === 'open');
  for (const d of opens) {
    const g = currentReviewGrades[String(d.question_id)];
    if (!g || !g.grade) return toast('Оцените все развёрнутые ответы', 'error');
  }

  try {
    const { attempt } = await api('/reviews/' + attemptId, {
      method: 'POST',
      body: { reviews: currentReviewGrades }
    });

    toast(`Готово! Итог: ${attempt.percent}%`, 'success');
    closeModal('modal-review');

    const tile = $(`.review-tile[data-review-id="${attemptId}"]`);
    if (tile) {
      tile.classList.add('leaving');
      setTimeout(() => {
        tile.remove();
        if ($$('.review-tile').length === 0) loadReviews();
      }, 480);
    } else {
      loadReviews();
    }
    refreshReviewCounter();
    refreshUnseenCounter();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ═══ РЕЗУЛЬТАТЫ ═══

async function loadResults() {
  const v = $('#view-results');
  v.innerHTML = `<div class="grid grid-2">${skeletonTiles(3)}</div>`;
  try {
    const { results } = await api('/results');
    if (!results.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon">${ico('chart','ico-xl')}</span>
        <h3>Пока нет результатов</h3>
        <p>Как только ученики начнут проходить тесты, здесь появится статистика</p>
      </div>`;
      return;
    }
    v.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Ученик</th><th>Тема</th><th>Балл</th><th>Результат</th><th>Время</th><th>Дата</th>
          </tr></thead>
          <tbody>
            ${results.map(r => {
              const student = {
                display_name: r.student_name,
                avatar: r.student_avatar,
                avatar_bg: r.student_avatar_bg
              };
              const avatarMini = window.Avatars.html(student, { size: 'sm', extraClass: 'avatar-xs' });
              const unseenDot = r.seen_by_tutor === 0
                ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e0435c;margin-left:6px;vertical-align:middle" title="Новая попытка"></span>`
                : '';
              const nameCell = `<div style="display:flex;align-items:center;gap:8px">${avatarMini}<div><b>${esc(r.student_name)}</b>${unseenDot}${r.student_grade ? ' ' + gradeBadge(r.student_grade) : ''}<br><span class="muted" style="font-size:12px">${esc(r.student_login)}</span></div></div>`;

              if (r.status === 'pending_review') {
                return `<tr class="pending-row" data-attempt-id="${r.id}">
                  <td>${nameCell}</td>
                  <td>${esc(r.topic_title)}${r.topic_grade ? ' ' + gradeBadge(r.topic_grade) : ''}</td>
                  <td class="muted">—</td>
                  <td><span class="badge" style="background: rgba(255,170,0,.14); color:#c47f00;">${ico('clock','ico-sm')} Ждёт проверки</span></td>
                  <td class="muted" style="font-size:13px">${ico('clock','ico-sm')} ${formatDuration(r.duration_sec)}</td>
                  <td class="muted" style="font-size:13px">${esc(r.created_at)}</td>
                </tr>`;
              }
              const pct = Math.round((r.score / r.total) * 100);
              const cls = pct >= 80 ? 'accent' : pct >= 50 ? '' : 'danger';
              return `<tr data-attempt-id="${r.id}">
                <td>${nameCell}</td>
                <td>${esc(r.topic_title)}${r.topic_grade ? ' ' + gradeBadge(r.topic_grade) : ''}</td>
                <td>${r.score} / ${r.total}</td>
                <td style="min-width:140px">
                  <div class="bar ${cls}"><span style="width:${pct}%"></span></div>
                  <span class="muted" style="font-size:12px">${pct}%</span>
                </td>
                <td class="muted" style="font-size:13px">${ico('clock','ico-sm')} ${formatDuration(r.duration_sec)}</td>
                <td class="muted" style="font-size:13px">${esc(r.created_at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    $$('[data-attempt-id]', v).forEach(tr => {
      tr.addEventListener('click', async () => {
        const attemptId = Number(tr.dataset.attemptId);
        const row = results.find(r => r.id === attemptId);
        if (!row) return;

        if (row.status === 'pending_review') {
          openReviewModal(attemptId);
        } else {
          openResultDetail(attemptId);
        }
        setTimeout(() => refreshUnseenCounter(), 300);
      });
    });

    refreshUnseenCounter();
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ═══ МОДАЛКА ПРОСМОТРА ОТВЕТОВ ═══

function ensureResultModal() {
  if ($('#modal-result')) return;
  const html = `
    <div class="modal-backdrop" id="modal-result">
      <div class="modal" style="max-width:720px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 id="rs-title" style="font-size:22px;margin-bottom:4px">Результат</h3>
            <div id="rs-sub" class="muted" style="font-size:13px"></div>
          </div>
          <div id="rs-score-pill" class="rv-progress-pill">—</div>
        </div>
        <div id="rs-body"></div>
        <div class="flex gap-2 mt-3" style="justify-content:flex-end">
          <button class="btn btn-ghost" id="rs-close">Закрыть</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  $('#modal-result').addEventListener('click', (e) => {
    if (e.target.id === 'modal-result') $('#modal-result').classList.remove('open');
  });
  $('#rs-close').addEventListener('click', () => $('#modal-result').classList.remove('open'));
}

async function openResultDetail(attemptId) {
  ensureResultModal();
  const modal = $('#modal-result');
  $('#rs-title').textContent = 'Загрузка…';
  $('#rs-sub').textContent = '';
  $('#rs-body').innerHTML = '';
  $('#rs-score-pill').textContent = '—';
  modal.classList.add('open');

  try {
    const data = await api('/reviews/' + attemptId);
    const a = data.attempt;

    $('#rs-title').textContent = a.student_name || 'Результат';
    $('#rs-sub').textContent = `${a.topic_title} · ${a.test_title} · ${a.created_at} · ${ico('clock','ico-sm')} ${formatDuration(a.duration_sec)}`;

    const pct = Math.round((a.score / a.total) * 100);
    const pill = $('#rs-score-pill');
    pill.textContent = `${pct}% · ${a.score} / ${a.total}`;
    pill.classList.add('done');

    const student = {
      display_name: a.student_name,
      avatar: a.student_avatar,
      avatar_bg: a.student_avatar_bg
    };
    const studentHead = `
      <div class="rv-student-head" style="margin-bottom:16px">
        ${window.Avatars.html(student, { size: 'md' })}
        <div class="info">
          <div class="name">${esc(a.student_name)}</div>
          <div class="meta">${esc(a.topic_title)} · ${ico('clock','ico-sm')} ${formatDuration(a.duration_sec)}</div>
        </div>
      </div>
    `;

    $('#rs-body').innerHTML = studentHead + data.detail.map((d, i) => renderResultItem(d, i)).join('');
  } catch (e) {
    $('#rs-title').textContent = 'Ошибка';
    $('#rs-body').innerHTML = `<p>${esc(e.message)}</p>`;
  }
}

function renderResultItem(d, i) {
  if (d.type === 'open') {
    const grade = d.grade;
    const cls = grade === 'correct' ? 'correct'
              : grade === 'partial' ? 'partial'
              : grade === 'wrong'   ? 'wrong'
              : 'pending';
    const icon = grade === 'correct' ? ico('check','ico')
              : grade === 'partial' ? ico('circle-dot','ico')
              : grade === 'wrong'   ? ico('x','ico')
              : ico('clock','ico');
    const gradeText = grade === 'correct' ? 'Верно'
                   : grade === 'partial' ? 'Частично верно'
                   : grade === 'wrong'   ? 'Неверно'
                   : 'Не оценено';

    return `
      <div class="rv-q ${cls === 'correct' ? 'auto-correct' : cls === 'wrong' ? 'auto-wrong' : 'open-q'}" style="margin-bottom:12px">
        <div class="rv-q-head">
          <div class="rv-q-num">${icon}</div>
          <div class="rv-q-text">
            ${esc(d.text)}
            <span class="rv-q-type open">${ico('pen','ico-sm')} развёрнутый</span>
          </div>
        </div>

        <div class="rv-open-answer ${!d.given_text ? 'empty' : ''}">
          ${d.given_text ? esc(d.given_text) : '— ученик не написал ответ —'}
        </div>

        ${d.given_file ? `
          <a class="rv-open-file" href="${esc(d.given_file)}" target="_blank" rel="noopener">
            <div class="fi">${ico('paperclip','ico-sm')}</div>
            <div>
              <div>${esc(d.given_file_name || 'файл')}</div>
              <div class="fs">Открыть в новой вкладке</div>
            </div>
          </a>
        ` : ''}

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;padding:10px 14px;border-radius:12px;background:var(--light);border:1.5px solid var(--border)">
          <span style="font-weight:700;font-size:13px;color:var(--gray);text-transform:uppercase;letter-spacing:.4px">Оценка:</span>
          <span style="font-weight:800;font-size:14.5px;color:${
            grade === 'correct' ? 'var(--accent-dark)'
            : grade === 'wrong' ? 'var(--danger)'
            : grade === 'partial' ? '#c47f00'
            : 'var(--gray)'
          }">${gradeText}</span>
        </div>

        ${d.comment ? `<div class="teacher-comment" style="margin-top:10px;padding:12px 16px;border-radius:12px;background:rgba(106,76,255,.06);border-left:3px solid var(--primary);font-size:13.5px;line-height:1.5">
          <div style="font-weight:700;color:var(--primary);margin-bottom:4px;font-size:12.5px;text-transform:uppercase;letter-spacing:.4px">${ico('message','ico-sm')} Ваш комментарий</div>
          ${esc(d.comment)}
        </div>` : ''}
      </div>`;
  }

  const ok = d.auto_correct;
  const correctSet = new Set(d.correct || []);
  const givenSet = new Set(
    Array.isArray(d.given) ? d.given
    : typeof d.given === 'number' ? [d.given]
    : []
  );
  const options = d.options || [];
  const typeLabel = d.type === 'multi' ? `${ico('check-square','ico-sm')} несколько` : `${ico('circle-dot','ico-sm')} один`;

  return `
    <div class="rv-q ${ok ? 'auto-correct' : 'auto-wrong'}" style="margin-bottom:12px">
      <div class="rv-q-head">
        <div class="rv-q-num">${i + 1}</div>
        <div class="rv-q-text">
          ${esc(d.text)}
          <span class="rv-q-type ${d.type}">${typeLabel}</span>
        </div>
      </div>
      <div>
        ${options.map((o, idx) => {
          const isCorrect = correctSet.has(idx);
          const isGiven = givenSet.has(idx);
          let cls = '';
          let markBadge = '';
          if (isCorrect && isGiven) { cls = 'correct'; markBadge = `${ico('check','ico-sm')} верно`; }
          else if (isCorrect && !isGiven) { cls = 'correct'; markBadge = 'пропущено'; }
          else if (!isCorrect && isGiven) { cls = 'bad-give'; markBadge = `${ico('x','ico-sm')} лишний`; }
          else if (isGiven) { cls = 'given'; markBadge = 'выбрано'; }
          return `<div class="rv-opt ${cls}">
            <span class="key">${letterFor(idx)}</span>
            <span>${esc(o)}</span>
            ${markBadge ? `<span class="mark-badge">${markBadge}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ═══ СОЗДАНИЕ ═══

$('#create-topic').addEventListener('click', async () => {
  const title = $('#new-topic-title').value.trim();
  const description = $('#new-topic-desc').value.trim();
  const grade = $('#new-topic-grade').value;
  if (!title) return toast('Введите название', 'error');
  if (!grade) return toast('Выберите класс', 'error');
  try {
    await api('/topics', { method: 'POST', body: { title, description, grade } });
    closeModal('modal-topic');
    toast('Тема создана', 'success');
    loadTopics();
  } catch (e) { toast(e.message, 'error'); }
});

$('#create-student').addEventListener('click', async () => {
  const display_name = $('#new-student-name').value.trim();
  const grade = $('#new-student-grade').value;
  if (!display_name) return toast('Введите имя', 'error');
  if (!grade) return toast('Выберите класс', 'error');
  try {
    const { student } = await api('/students', { method: 'POST', body: { display_name, grade } });
    closeModal('modal-student');
    showCreds(student);
    loadStudents();
  } catch (e) { toast(e.message, 'error'); }
});

function showCreds(student) {
  window.Avatars.apply('#cred-avatar', student, { size: 'xl', pop: true });
  $('#cred-name').textContent  = student.display_name;
  $('#cred-login').textContent = student.username;
  $('#cred-pass').textContent  = student.password;
  openModal('modal-creds');
}
$('#copy-both').addEventListener('click', () => {
  const text = `Логин: ${$('#cred-login').textContent}\nПароль: ${$('#cred-pass').textContent}`;
  navigator.clipboard.writeText(text).then(() => toast('Скопировано', 'success'));
});

let confirmAction = null;
function askConfirm(title, text, onOk) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  confirmAction = onOk;
  openModal('modal-confirm');
}
$('#confirm-ok').addEventListener('click', async () => {
  if (confirmAction) await confirmAction();
  closeModal('modal-confirm');
});

// ═══════════════════════════════════════════════════
//  РАСПИСАНИЕ
// ═══════════════════════════════════════════════════

function dateStrLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayOfWeek(date) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

function colorClassForStudent(studentId) {
  return 'ev-c' + (Number(studentId) % 12);
}

async function loadSchedule() {
  const v = $('#view-schedule');

  if (!scheduleMonday) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduleMonday = mondayOfWeek(today);
  }

  v.innerHTML = `<div class="grid grid-2">${skeletonTiles(2)}</div>`;

  try {
    const { students } = await api('/students');
    studentsCache = students;

    const startStr = dateStrLocal(scheduleMonday);
    const data = await api('/lessons/week?start=' + startStr);
    scheduleLessonsCache = data.lessons || [];

    renderScheduleGrid(v, data, students);
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

function renderScheduleGrid(container, data, students) {
  const monday = new Date(data.monday + 'T00:00:00');
  const sunday = new Date(data.sunday + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekLabel = `${monday.getDate()} ${MONTHS_GEN[monday.getMonth()]} — ${sunday.getDate()} ${MONTHS_GEN[sunday.getMonth()]} ${sunday.getFullYear()}`;

  const START_HOUR = 8;
  const END_HOUR = 22;
  const ROW_H = 60;

  let headHtml = '<div class="sg-cell sg-corner"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = d.getTime() === today.getTime();
    headHtml += `<div class="sg-cell sg-day-head ${isToday ? 'today' : ''}">
      <div class="sg-day-name">${DOW_SHORT[i]}</div>
      <div class="sg-day-date">${d.getDate()} ${MONTHS_GEN[d.getMonth()].slice(0,3)}</div>
    </div>`;
  }

  let bodyHtml = '';
  for (let h = START_HOUR; h < END_HOUR; h++) {
    bodyHtml += `<div class="sg-cell sg-time-cell">${String(h).padStart(2,'0')}:00</div>`;
    for (let d = 0; d < 7; d++) {
      bodyHtml += `<div class="sg-cell sg-day-col" data-day="${d}" data-hour="${h}" style="height:${ROW_H}px"></div>`;
    }
  }

  const legendHtml = `
    <div class="schedule-legend">
      ${students.slice(0, 12).map(s =>
        `<span class="lg-item"><span class="lg-dot ${colorClassForStudent(s.id)}"></span>${esc(s.display_name)}</span>`
      ).join('')}
    </div>
  `;

  const hasLessons = data.lessons && data.lessons.length > 0;

  container.innerHTML = `
    <div class="page-head" style="margin-bottom:20px">
      <div>
        <h1 class="page-title">Расписание</h1>
        <p class="page-sub">Еженедельные занятия с учениками</p>
      </div>
      <button class="btn btn-primary" id="btn-add-lesson">${ico('plus','ico ico-sm')} Новое занятие</button>
    </div>

    <div class="schedule-wrap">
      <div class="schedule-head">
        <div class="schedule-week-title">${weekLabel}</div>
        <div class="schedule-nav">
          <button id="sched-prev" title="Предыдущая неделя">${ico('arrow-left','ico-sm')}</button>
          <button class="today-btn" id="sched-today">Сегодня</button>
          <button id="sched-next" title="Следующая неделя">${ico('arrow-right','ico-sm')}</button>
        </div>
      </div>

      ${hasLessons ? `
        <div class="schedule-grid-wrap">
          <div class="schedule-grid" id="schedule-grid-el">
            ${headHtml}
            ${bodyHtml}
          </div>
        </div>
      ` : `
        <div class="schedule-empty">
          <span class="icon">${ico('calendar','ico-xl')}</span>
          <h3>Пока нет занятий</h3>
          <p>Добавьте первое занятие — оно будет повторяться каждую неделю</p>
          <button class="btn btn-primary" id="btn-add-lesson-empty">${ico('plus','ico ico-sm')} Новое занятие</button>
        </div>
      `}

      ${legendHtml}
    </div>
  `;

  $('#sched-prev').onclick = () => {
    scheduleMonday.setDate(scheduleMonday.getDate() - 7);
    loadSchedule();
  };
  $('#sched-next').onclick = () => {
    scheduleMonday.setDate(scheduleMonday.getDate() + 7);
    loadSchedule();
  };
  $('#sched-today').onclick = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    scheduleMonday = mondayOfWeek(t);
    loadSchedule();
  };

  $('#btn-add-lesson')?.addEventListener('click', () => openLessonModal(null));
  $('#btn-add-lesson-empty')?.addEventListener('click', () => openLessonModal(null));

  $$('.sg-day-col', container).forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.schedule-event')) return;
      const day = Number(cell.dataset.day);
      const hour = Number(cell.dataset.hour);
      openLessonModal(null, { day_of_week: day, time_start: `${String(hour).padStart(2,'0')}:00` });
    });
  });

  const grid = container.querySelector('#schedule-grid-el');
  if (!grid || !hasLessons) return;

  for (const lesson of data.lessons) {
    const lessonDate = new Date(lesson.date + 'T00:00:00');
    const dow = (lessonDate.getDay() + 6) % 7;

    const startMin = timeToMinutes(lesson.time_start);
    const duration = Number(lesson.duration_min) || 60;
    if (startMin < START_HOUR * 60 || startMin >= END_HOUR * 60) continue;

    const firstCellOfDay = grid.querySelector(`.sg-day-col[data-day="${dow}"][data-hour="${START_HOUR}"]`);
    if (!firstCellOfDay) continue;

    const cellRect = firstCellOfDay.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const topWithinGrid = cellRect.top - gridRect.top;

    const startFromTop = (startMin - START_HOUR * 60) / 60 * ROW_H;
    const height = (duration / 60) * ROW_H - 4;

    const ev = document.createElement('div');
    ev.className = 'schedule-event ' + colorClassForStudent(lesson.student_id) + (lesson.is_override ? ' override' : '');
    ev.style.top = (topWithinGrid + startFromTop + 2) + 'px';
    ev.style.height = Math.max(height, 26) + 'px';
    ev.style.left = (firstCellOfDay.offsetLeft + 3) + 'px';
    ev.style.width = (firstCellOfDay.offsetWidth - 6) + 'px';
    ev.dataset.lessonId = lesson.id;
    ev.dataset.date = lesson.date;

    ev.innerHTML = `
      <div class="se-time">${esc(lesson.time_start)}</div>
      <div class="se-name">${esc(lesson.student_name || '—')}</div>
      ${lesson.subject ? `<div class="se-subject">${esc(lesson.subject)}</div>` : ''}
    `;

    ev.addEventListener('click', (e) => {
      e.stopPropagation();
      openLessonCard(lesson);
    });

    grid.appendChild(ev);
  }
}

function openLessonModal(lesson, prefill = {}) {
  editingLessonId = lesson ? lesson.id : null;

  if (!$('#lesson-student').options.length) {
    const opts = ['<option value="">— выберите ученика —</option>'];
    for (const s of studentsCache) {
      opts.push(`<option value="${s.id}">${esc(s.display_name)} · ${esc(s.username)}</option>`);
    }
    $('#lesson-student').innerHTML = opts.join('');
  }

  if (lesson) {
    $('#lesson-modal-title').innerHTML = `${ico('pencil','ico ico-lg')} Изменить занятие`;
    $('#lesson-modal-sub').textContent = 'Изменения применятся ко всем будущим неделям';
    $('#lesson-student').value = String(lesson.student_id);
    $('#lesson-day').value = String(lesson.day_of_week);
    $('#lesson-time').value = lesson.time_start;
    $('#lesson-duration').value = String(lesson.duration_min);
    $('#lesson-subject').value = lesson.subject || '';
  } else {
    $('#lesson-modal-title').innerHTML = `${ico('calendar','ico ico-lg')} Новое занятие`;
    $('#lesson-modal-sub').textContent = 'Будет повторяться каждую неделю';
    $('#lesson-student').value = '';
    $('#lesson-day').value = String(prefill.day_of_week ?? 0);
    $('#lesson-time').value = prefill.time_start || '18:00';
    $('#lesson-duration').value = '60';
    $('#lesson-subject').value = '';
  }

  openModal('modal-lesson');
  setTimeout(() => $('#lesson-student').focus(), 100);
}

$('#save-lesson')?.addEventListener('click', async () => {
  const student_id = $('#lesson-student').value;
  const day_of_week = $('#lesson-day').value;
  const time_start = $('#lesson-time').value;
  const duration_min = $('#lesson-duration').value;
  const subject = $('#lesson-subject').value.trim();

  if (!student_id) return toast('Выберите ученика', 'error');
  if (!time_start) return toast('Укажите время', 'error');

  const btn = $('#save-lesson');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';

  try {
    if (editingLessonId) {
      await api('/lessons/' + editingLessonId, {
        method: 'PATCH',
        body: { student_id: Number(student_id), day_of_week: Number(day_of_week), time_start, duration_min: Number(duration_min), subject }
      });
      toast('Занятие обновлено', 'success');
    } else {
      await api('/lessons', {
        method: 'POST',
        body: { student_id: Number(student_id), day_of_week: Number(day_of_week), time_start, duration_min: Number(duration_min), subject }
      });
      toast('Занятие добавлено', 'success');
    }
    closeModal('modal-lesson');
    loadSchedule();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
});

function openLessonCard(lesson) {
  currentLessonCard = lesson;

  $('#lc-title').textContent = lesson.student_name || 'Занятие';
  let sub = `${DOW_FULL[lesson.day_of_week]}, ${lesson.time_start} · ${lesson.duration_min} мин`;
  if (lesson.subject) sub += ' · ' + lesson.subject;
  if (lesson.is_override) sub += ' · перенесено';
  $('#lc-sub').textContent = sub;

  openModal('modal-lesson-card');
}

$('#lc-cancel-date')?.addEventListener('click', async () => {
  if (!currentLessonCard) return;
  if (!confirm(`Отменить занятие ${currentLessonCard.date} (${currentLessonCard.time_start})?\n\nТолько на эту дату — шаблон останется.`)) return;

  try {
    await api('/lessons/' + currentLessonCard.id + '/override', {
      method: 'POST',
      body: {
        override_date: currentLessonCard.date,
        action: 'cancel',
        note: 'Отменено учителем'
      }
    });
    toast('Занятие отменено на эту дату', 'success');
    closeModal('modal-lesson-card');
    loadSchedule();
  } catch (e) {
    toast(e.message, 'error');
  }
});

$('#lc-edit-template')?.addEventListener('click', () => {
  if (!currentLessonCard) return;
  closeModal('modal-lesson-card');
  openLessonModal(currentLessonCard);
});

$('#lc-delete-template')?.addEventListener('click', async () => {
  if (!currentLessonCard) return;
  if (!confirm(`Удалить занятие с «${currentLessonCard.student_name}» из расписания?\n\nВсе будущие занятия исчезнут.`)) return;

  try {
    await api('/lessons/' + currentLessonCard.id, { method: 'DELETE' });
    toast('Занятие удалено из расписания', 'success');
    closeModal('modal-lesson-card');
    loadSchedule();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ═══ СТАРТ ═══

(async function boot() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'tutor') {
      location.href = 'student-login.html';
      return;
    }
    me = user;
    $('#me-name').textContent = user.display_name;

    window.Avatars.apply('#avatar', user, { size: 'lg', title: user.display_name, pop: true });
    window.Search?.init({ role: 'tutor' });

    if (window.Chat) window.Chat.setMe(user);
    window.Chat?.init({
      role: 'tutor',
      mountSelector: '#chat-mount',
      notifMountSelector: '#nav-chat'
    });

    switchView('topics');
    startReviewsPolling();
    startUnseenPolling();

    const params = new URLSearchParams(location.search);
    if (params.get('highlight-student')) {
      switchView('students');
    }
  } catch (e) {}
})();