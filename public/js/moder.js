/* public/js/moder.js */

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
    location.href = 'moder-login.html';
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

function ico(id, cls = 'ico') {
  return `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
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

let me = null;
let stats = null;
let tutorsCache = [];
let studentsCache = [];
let trashCache = { tutors: [], students: [] };
let currentView = 'tutors';
let searchQuery = '';

function timeAgo(sqlDate) {
  if (!sqlDate) return '';
  const d = new Date(String(sqlDate).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return sqlDate;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff/60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff/3600)} ч назад`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)} дн назад`;
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDate(sqlDate) {
  if (!sqlDate) return '—';
  const d = new Date(String(sqlDate).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return sqlDate;
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function switchView(view) {
  currentView = view;
  $$('.moder-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $('#view-tutors').style.display   = (view === 'tutors')   ? '' : 'none';
  $('#view-students').style.display = (view === 'students') ? '' : 'none';
  $('#view-trash').style.display    = (view === 'trash')    ? '' : 'none';

  if (view === 'tutors')   renderTutors();
  if (view === 'students') renderStudents();
  if (view === 'trash')    renderTrash();
}

$$('.moder-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

$('#moder-search').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  if (currentView === 'tutors')   renderTutors();
  if (currentView === 'students') renderStudents();
  if (currentView === 'trash')    renderTrash();
});

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.href = 'moder-login.html';
});

// ═══ СТАТИСТИКА ═══

async function loadStats() {
  try {
    stats = await api('/moder/stats');
    renderStats();
    $('#cnt-tutors').textContent = stats.tutors;
    $('#cnt-students').textContent = stats.students;
    $('#cnt-trash').textContent = (stats.trash_tutors + stats.trash_students);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderStats() {
  if (!stats) return;
  const s = stats;
  const trash = (s.trash_tutors || 0) + (s.trash_students || 0);
  $('#stats-grid').innerHTML = `
    <div class="stat-card accent">
      <div class="sc-label">${ico('users','ico-sm')} Учителей</div>
      <div class="sc-value">${s.tutors || 0}</div>
      <div class="sc-sub">активных аккаунтов</div>
    </div>
    <div class="stat-card success">
      <div class="sc-label">${ico('graduation','ico-sm')} Учеников</div>
      <div class="sc-value">${s.students || 0}</div>
      <div class="sc-sub">на платформе</div>
    </div>
    <div class="stat-card">
      <div class="sc-label">${ico('book','ico-sm')} Тем</div>
      <div class="sc-value">${s.topics || 0}</div>
      <div class="sc-sub">создано учителями</div>
    </div>
    <div class="stat-card">
      <div class="sc-label">${ico('file-text','ico-sm')} Попыток</div>
      <div class="sc-value">${s.attempts || 0}</div>
      <div class="sc-sub">тестов пройдено</div>
    </div>
    <div class="stat-card">
      <div class="sc-label">${ico('message','ico-sm')} Сообщений</div>
      <div class="sc-value">${s.messages || 0}</div>
      <div class="sc-sub">в чатах</div>
    </div>
    <div class="stat-card danger">
      <div class="sc-label">${ico('trash','ico-sm')} В корзине</div>
      <div class="sc-value">${trash}</div>
      <div class="sc-sub">${s.trash_tutors || 0} уч. · ${s.trash_students || 0} учеников</div>
    </div>
  `;
}

// ═══ УЧИТЕЛЯ ═══

async function loadTutors() {
  const data = await api('/moder/tutors');
  tutorsCache = data.tutors || [];
  renderTutors();
}

function renderTutors() {
  const v = $('#view-tutors');
  let list = tutorsCache;

  if (searchQuery) {
    list = list.filter(t =>
      (t.display_name || '').toLowerCase().includes(searchQuery) ||
      (t.username || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!list.length) {
    v.innerHTML = `<div class="moder-empty">
      <span class="ic">${ico('users','ico')}</span>
      <h3>${searchQuery ? 'Никого не найдено' : 'Пока нет учителей'}</h3>
      <p>${searchQuery ? 'Попробуй другой запрос' : 'Учителя появятся здесь после регистрации'}</p>
    </div>`;
    return;
  }

  v.innerHTML = list.map(t => `
    <div class="user-card" data-user-id="${t.id}">
      ${window.Avatars.html(t, { size: 'md' })}
      <div class="uc-body">
        <div class="uc-head">
          <span class="uc-name">${esc(t.display_name)}</span>
          <span class="uc-role tutor">Учитель</span>
          <span class="uc-login">${esc(t.username)}</span>
        </div>
        <div class="uc-meta">
          <span>${ico('calendar','ico-sm')} ${formatDate(t.created_at)}</span>
          <span>${ico('graduation','ico-sm')} <b>${t.students_count}</b> учеников</span>
          <span>${ico('book','ico-sm')} <b>${t.topics_count}</b> тем</span>
          <span>${ico('file-text','ico-sm')} <b>${t.attempts_count}</b> попыток</span>
          ${t.last_seen ? `<span>${ico('clock','ico-sm')} ${timeAgo(t.last_seen)}</span>` : ''}
        </div>
      </div>
      <div class="uc-actions">
        <button data-reset="${t.id}" title="Сбросить пароль">${ico('key','ico-sm')} Сброс</button>
        <button class="danger" data-delete="${t.id}" title="Удалить в корзину">${ico('trash','ico-sm')} Удалить</button>
      </div>
    </div>
  `).join('');

  wireCards(v);
}

// ═══ УЧЕНИКИ ═══

async function loadStudents() {
  const data = await api('/moder/students');
  studentsCache = data.students || [];
  renderStudents();
}

function renderStudents() {
  const v = $('#view-students');
  let list = studentsCache;

  if (searchQuery) {
    list = list.filter(s =>
      (s.display_name || '').toLowerCase().includes(searchQuery) ||
      (s.username || '').toLowerCase().includes(searchQuery) ||
      (s.tutor_name || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!list.length) {
    v.innerHTML = `<div class="moder-empty">
      <span class="ic">${ico('graduation','ico')}</span>
      <h3>${searchQuery ? 'Никого не найдено' : 'Пока нет учеников'}</h3>
      <p>${searchQuery ? 'Попробуй другой запрос' : 'Учеников создают учителя'}</p>
    </div>`;
    return;
  }

  v.innerHTML = list.map(s => `
    <div class="user-card" data-user-id="${s.id}">
      ${window.Avatars.html(s, { size: 'md' })}
      <div class="uc-body">
        <div class="uc-head">
          <span class="uc-name">${esc(s.display_name)}</span>
          <span class="uc-role student">Ученик</span>
          <span class="uc-login">${esc(s.username)}</span>
        </div>
        <div class="uc-meta">
          <span>${ico('users','ico-sm')} Учитель: <b>${esc(s.tutor_name || '—')}</b></span>
          ${s.grade ? `<span>${ico('cap','ico-sm')} ${esc(gradeLabel(s.grade))}</span>` : ''}
          <span>${ico('file-text','ico-sm')} <b>${s.attempts_count}</b> попыток</span>
          <span>${ico('calendar','ico-sm')} ${formatDate(s.created_at)}</span>
        </div>
      </div>
      <div class="uc-actions">
        <button data-reset="${s.id}" title="Сбросить пароль">${ico('key','ico-sm')} Сброс</button>
        <button class="danger" data-delete="${s.id}" title="Удалить в корзину">${ico('trash','ico-sm')} Удалить</button>
      </div>
    </div>
  `).join('');

  wireCards(v);
}

function gradeLabel(id) {
  const map = {
    junior: 'Младшая', '8': '8 класс', '9': '9 класс',
    '10': '10 класс', '11': '11 класс', adult: 'Старшие'
  };
  return map[id] || id;
}

// ═══ КОРЗИНА ═══

async function loadTrash() {
  const data = await api('/moder/trash');
  trashCache = { tutors: data.tutors || [], students: data.students || [] };
  renderTrash();
}

function renderTrash() {
  const v = $('#view-trash');
  let tutors = trashCache.tutors;
  let students = trashCache.students;

  if (searchQuery) {
    tutors = tutors.filter(t =>
      (t.display_name || '').toLowerCase().includes(searchQuery) ||
      (t.username || '').toLowerCase().includes(searchQuery)
    );
    students = students.filter(s =>
      (s.display_name || '').toLowerCase().includes(searchQuery) ||
      (s.username || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!tutors.length && !students.length) {
    v.innerHTML = `<div class="moder-empty">
      <span class="ic">${ico('trash','ico')}</span>
      <h3>${searchQuery ? 'Никого не найдено' : 'Корзина пуста'}</h3>
      <p>${searchQuery ? 'Попробуй другой запрос' : 'Удалённые аккаунты хранятся 30 дней'}</p>
    </div>`;
    return;
  }

  let html = '';

  if (tutors.length) {
    html += `<h3 style="font-size:15px;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.5px;margin:20px 0 12px">${ico('users','ico-sm')} Учителя в корзине (${tutors.length})</h3>`;
    html += tutors.map(t => `
      <div class="user-card trash" data-user-id="${t.id}">
        ${window.Avatars.html(t, { size: 'md' })}
        <div class="uc-body">
          <div class="uc-head">
            <span class="uc-name">${esc(t.display_name)}</span>
            <span class="uc-role tutor">Учитель</span>
            <span class="uc-login">${esc(t.username)}</span>
          </div>
          <div class="uc-meta">
            <span>${ico('graduation','ico-sm')} было <b>${t.students_count}</b> учеников</span>
            <span>${ico('book','ico-sm')} было <b>${t.topics_count}</b> тем</span>
            <span class="uc-days">${ico('clock','ico-sm')} осталось ${Math.max(0, 30 - (t.days_in_trash || 0))} дн.</span>
          </div>
        </div>
        <div class="uc-actions">
          <button class="restore" data-restore="${t.id}">${ico('rotate','ico-sm')} Вернуть</button>
          <button class="danger" data-purge="${t.id}">${ico('flame','ico-sm')} Удалить навсегда</button>
        </div>
      </div>
    `).join('');
  }

  if (students.length) {
    html += `<h3 style="font-size:15px;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.5px;margin:24px 0 12px">${ico('graduation','ico-sm')} Ученики в корзине (${students.length})</h3>`;
    html += students.map(s => `
      <div class="user-card trash" data-user-id="${s.id}">
        ${window.Avatars.html(s, { size: 'md' })}
        <div class="uc-body">
          <div class="uc-head">
            <span class="uc-name">${esc(s.display_name)}</span>
            <span class="uc-role student">Ученик</span>
            <span class="uc-login">${esc(s.username)}</span>
          </div>
          <div class="uc-meta">
            <span>${ico('users','ico-sm')} Учитель: <b>${esc(s.tutor_name || '—')}</b></span>
            <span>${ico('file-text','ico-sm')} <b>${s.attempts_count}</b> попыток</span>
            <span class="uc-days">${ico('clock','ico-sm')} осталось ${Math.max(0, 30 - (s.days_in_trash || 0))} дн.</span>
          </div>
        </div>
        <div class="uc-actions">
          <button class="restore" data-restore="${s.id}">${ico('rotate','ico-sm')} Вернуть</button>
          <button class="danger" data-purge="${s.id}">${ico('flame','ico-sm')} Удалить навсегда</button>
        </div>
      </div>
    `).join('');
  }

  v.innerHTML = html;
  wireTrashCards(v);
}

// ═══ ОБРАБОТЧИКИ ═══

function wireCards(container) {
  $$('[data-reset]', container).forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.reset);
      askConfirm('Сбросить пароль?',
        'Будет сгенерирован новый пароль. Покажется один раз — передайте пользователю.',
        async () => {
          try {
            const { user } = await api('/moder/users/' + id + '/reset-password', { method: 'POST' });
            showNewPassword(user);
          } catch (e) { toast(e.message, 'error'); }
        });
    };
  });

  $$('[data-delete]', container).forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.delete);
      const isTutor = !!tutorsCache.find(t => t.id === id);
      const user = isTutor
        ? tutorsCache.find(t => t.id === id)
        : studentsCache.find(s => s.id === id);
      if (!user) return;

      const msg = isTutor
        ? `«${user.display_name}» и все его ученики уйдут в корзину на 30 дней. Их можно будет восстановить.`
        : `«${user.display_name}» уйдёт в корзину на 30 дней.`;

      askConfirm('Удалить в корзину?', msg, async () => {
        try {
          await api('/moder/users/' + id, { method: 'DELETE' });
          toast('Перемещено в корзину', 'success');
          await Promise.all([loadTutors(), loadStudents(), loadStats(), loadTrash()]);
        } catch (e) { toast(e.message, 'error'); }
      });
    };
  });
}

function wireTrashCards(container) {
  $$('[data-restore]', container).forEach(b => {
    b.onclick = async () => {
      const id = Number(b.dataset.restore);
      try {
        await api('/moder/users/' + id + '/restore', { method: 'POST' });
        toast('Пользователь восстановлен', 'success');
        await Promise.all([loadTrash(), loadTutors(), loadStudents(), loadStats()]);
      } catch (e) { toast(e.message, 'error'); }
    };
  });

  $$('[data-purge]', container).forEach(b => {
    b.onclick = () => {
      const id = Number(b.dataset.purge);
      askConfirm('Удалить навсегда?',
        'Это действие нельзя отменить. Пользователь и все его данные будут удалены безвозвратно.',
        async () => {
          try {
            await api('/moder/users/' + id + '/purge', { method: 'DELETE' });
            toast('Пользователь удалён навсегда', 'success');
            await Promise.all([loadTrash(), loadStats()]);
          } catch (e) { toast(e.message, 'error'); }
        });
    };
  });
}

// ═══ НОВЫЙ ПАРОЛЬ ═══

function showNewPassword(user) {
  $('#np-title').innerHTML = `${ico('lock','ico ico-lg')} Новый пароль`;
  $('#np-sub').textContent = `${user.display_name} (${user.role === 'tutor' ? 'Учитель' : 'Ученик'}) · логин «${user.username}»`;
  $('#np-value').textContent = user.password;
  openModal('modal-newpass');
}

$('#np-copy').addEventListener('click', () => {
  const pwd = $('#np-value').textContent;
  navigator.clipboard.writeText(pwd).then(() => {
    $('#np-copy').innerHTML = `${ico('check','ico-sm')} Скопировано`;
    setTimeout(() => $('#np-copy').innerHTML = `${ico('copy','ico-sm')} Скопировать`, 1500);
  });
});

// ═══ СМЕНА ПАРОЛЯ МОДЕРА ═══

$('#btn-change-moder-pass').addEventListener('click', () => {
  $('#mp-current').value = '';
  $('#mp-new').value = '';
  $('#mp-confirm').value = '';
  openModal('modal-change-moder-pass');
  setTimeout(() => $('#mp-current').focus(), 100);
});

$('#mp-save').addEventListener('click', async () => {
  const cur = $('#mp-current').value;
  const nw = $('#mp-new').value;
  const cf = $('#mp-confirm').value;

  if (!cur) return toast('Введите текущий пароль', 'error');
  if (nw.length < 6) return toast('Новый пароль минимум 6 символов', 'error');
  if (nw !== cf) return toast('Пароли не совпадают', 'error');

  const btn = $('#mp-save');
  btn.disabled = true;
  btn.textContent = 'Меняем…';

  try {
    await api('/moder/change-password', {
      method: 'POST',
      body: { current_password: cur, new_password: nw }
    });
    toast('Пароль изменён', 'success');
    closeModal('modal-change-moder-pass');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сменить пароль';
  }
});

// ═══ ПОДТВЕРЖДЕНИЕ ═══

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

// ═══ СТАРТ ═══

(async function boot() {
  try {
    const searchInput = $('#moder-search');
    if (searchInput) {
      searchInput.value = '';
      searchQuery = '';
    }

    const { user } = await api('/moder/me');
    if (user.role !== 'moderator') {
      location.href = 'moder-login.html';
      return;
    }
    me = user;

    await loadStats();
    await Promise.all([loadTutors(), loadStudents(), loadTrash()]);

    switchView('tutors');
  } catch (e) {}
})();