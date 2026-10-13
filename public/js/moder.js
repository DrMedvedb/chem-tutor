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
    if (!(json.error && json.error.includes('Только для модератора'))) {
      location.href = 'moder-login.html';
    }
    throw new Error(json.error || 'unauth');
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

// ─── НАДЁЖНОЕ КОПИРОВАНИЕ (с fallback) ───
async function copyToClipboard(text) {
  // 1. Современный API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* пробуем fallback */ }
  }
  // 2. Fallback через execCommand
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

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
let applicationsCache = [];
let feedbackCache = [];
let leadsCache = [];
let trashCache = { tutors: [], students: [] };
let currentView = 'tutors';
let searchQuery = '';

let applicationsFilter = 'new';
let feedbackFilter = 'pending';
let leadsFilter = 'new';

// ═══ УТИЛИТЫ ═══

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

function gradeLabel(id) {
  const map = {
    junior: 'Младшая', '8': '8 класс', '9': '9 класс',
    '10': '10 класс', '11': '11 класс', adult: 'Старшие'
  };
  return map[id] || id;
}

function starsHtml(rating, cls = '') {
  let out = `<span class="${cls}">`;
  for (let i = 1; i <= 5; i++) {
    out += `<span class="${i <= rating ? '' : 'off'}">★</span>`;
  }
  out += '</span>';
  return out;
}

// ═══ ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ═══

function switchView(view) {
  currentView = view;
  $$('.moder-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  ['tutors','students','applications','feedback','leads','trash'].forEach(v => {
    const el = $('#view-' + v);
    if (el) el.style.display = (v === view) ? '' : 'none';
  });

  if (view === 'tutors')       renderTutors();
  if (view === 'students')     renderStudents();
  if (view === 'applications') renderApplications();
  if (view === 'feedback')     renderFeedback();
  if (view === 'leads')        { renderLeads(); autoMarkLeadsRead(); }
  if (view === 'trash')        renderTrash();
}

$$('.moder-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

$('#moder-search').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  if (currentView === 'tutors')       renderTutors();
  if (currentView === 'students')     renderStudents();
  if (currentView === 'applications') renderApplications();
  if (currentView === 'feedback')     renderFeedback();
  if (currentView === 'leads')        renderLeads();
  if (currentView === 'trash')        renderTrash();
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
    updateApplicationsCounter(stats.applications || 0);
    updateFeedbackCounter(stats.feedback_pending || 0);
    updateLeadsCounter(stats.leads_new || 0);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderStats() {
  if (!stats) return;
  const s = stats;
  const trash = (s.trash_tutors || 0) + (s.trash_students || 0);
  const apps = s.applications || 0;
  const fbPending = s.feedback_pending || 0;
  const leadsNew = s.leads_new || 0;
  $('#stats-grid').innerHTML = `
    <div class="stat-card accent">
      <div class="sc-label">${ico('users','ico-sm')} Учителей</div>
      <div class="sc-value">${s.tutors || 0}</div>
      <div class="sc-sub">активных аккаунтов</div>
    </div>
    <div class="stat-card success">
      <div class="sc-label">${ico('cap','ico-sm')} Учеников</div>
      <div class="sc-value">${s.students || 0}</div>
      <div class="sc-sub">на платформе</div>
    </div>
    <div class="stat-card apps">
      <div class="sc-label">${ico('mail','ico-sm')} Заявки учителей</div>
      <div class="sc-value">${apps}</div>
      <div class="sc-sub">новых на рассмотрении</div>
    </div>
    <div class="stat-card feedback">
      <div class="sc-label">${ico('star','ico-sm')} Отзывы</div>
      <div class="sc-value">${fbPending}</div>
      <div class="sc-sub">новых на модерации</div>
    </div>
    <div class="stat-card leads">
      <div class="sc-label">${ico('inbox','ico-sm')} Заявки учеников</div>
      <div class="sc-value">${leadsNew}</div>
      <div class="sc-sub">новых, не прочитанных</div>
    </div>
    <div class="stat-card">
      <div class="sc-label">${ico('book','ico-sm')} Тем</div>
      <div class="sc-value">${s.topics || 0}</div>
      <div class="sc-sub">создано учителями</div>
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

function updateApplicationsCounter(count) {
  const badge = $('#cnt-applications');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('alert', count > 0);
}
function updateFeedbackCounter(count) {
  const badge = $('#cnt-feedback');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('alert', count > 0);
}
function updateLeadsCounter(count) {
  const badge = $('#cnt-leads');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('alert', count > 0);
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
      (t.username || '').toLowerCase().includes(searchQuery) ||
      (t.email || '').toLowerCase().includes(searchQuery)
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
          ${t.email ? `<span>${ico('mail','ico-sm')} <b>${esc(t.email)}</b></span>` : ''}
          <span>${ico('cap','ico-sm')} <b>${t.students_count}</b> учеников</span>
          <span>${ico('book','ico-sm')} <b>${t.topics_count}</b> тем</span>
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
      <span class="ic">${ico('cap','ico')}</span>
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
          <span>${ico('book','ico-sm')} <b>${s.attempts_count}</b> попыток</span>
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

// ═══ ЗАЯВКИ УЧИТЕЛЕЙ ═══

async function loadApplications() {
  const data = await api('/moder/tutor-applications');
  applicationsCache = data.applications || [];
  renderApplications();
}

function renderApplications() {
  const v = $('#view-applications');

  const counts = { new: 0, approved: 0, rejected: 0, all: applicationsCache.length };
  for (const a of applicationsCache) {
    if (counts[a.status] !== undefined) counts[a.status]++;
  }

  let filterHtml = '<div class="apps-filter">';
  filterHtml += `<button class="apps-filter-tab ${applicationsFilter === 'new' ? 'active' : ''}" data-app-filter="new">
    ${ico('mail','ico-sm')} Новые <span class="fcnt ${counts.new > 0 ? 'alert' : ''}">${counts.new}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${applicationsFilter === 'approved' ? 'active' : ''}" data-app-filter="approved">
    ${ico('check','ico-sm')} Одобренные <span class="fcnt">${counts.approved}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${applicationsFilter === 'rejected' ? 'active' : ''}" data-app-filter="rejected">
    ${ico('x','ico-sm')} Отклонённые <span class="fcnt">${counts.rejected}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${applicationsFilter === 'all' ? 'active' : ''}" data-app-filter="all">
    Все <span class="fcnt">${counts.all}</span>
  </button>`;
  filterHtml += '</div>';

  let list = applicationsCache;
  if (applicationsFilter !== 'all') {
    list = list.filter(a => a.status === applicationsFilter);
  }

  if (searchQuery) {
    list = list.filter(a =>
      (a.full_name || '').toLowerCase().includes(searchQuery) ||
      (a.email || '').toLowerCase().includes(searchQuery) ||
      (a.desired_login || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!list.length) {
    v.innerHTML = filterHtml + `
      <div class="moder-empty">
        <span class="ic">${ico('mail','ico')}</span>
        <h3>${searchQuery ? 'Ничего не найдено' : (applicationsFilter === 'new' ? 'Нет новых заявок' : 'Заявок нет')}</h3>
        <p>${searchQuery ? 'Попробуй другой запрос' : 'Заявки от учителей будут появляться здесь'}</p>
      </div>`;
    wireApplicationsFilterTabs(v);
    return;
  }

  const statusLabels = { new: 'Новая', approved: 'Одобрена', rejected: 'Отклонена' };

  v.innerHTML = filterHtml + list.map(a => {
    let extraMeta = '';
    if (a.status === 'approved') {
      extraMeta = `<span>${ico('check','ico-sm')} Одобрена ${a.reviewed_at ? formatDate(a.reviewed_at) : ''}</span>`;
    } else if (a.status === 'rejected') {
      extraMeta = `<span>${ico('x','ico-sm')} Отклонена ${a.reviewed_at ? formatDate(a.reviewed_at) : ''}</span>`;
    } else {
      extraMeta = `<span>${ico('clock','ico-sm')} Подана ${timeAgo(a.created_at)}</span>`;
    }
    return `
      <div class="app-card ${a.status}" data-app-id="${a.id}">
        <div class="app-avatar">${ico('user','ico-lg')}</div>
        <div class="app-body">
          <div class="app-head">
            <span class="app-name">${esc(a.full_name)}</span>
            <span class="app-status ${a.status}">${statusLabels[a.status] || a.status}</span>
          </div>
          <div class="app-meta">
            <span>${ico('mail','ico-sm')} <b>${esc(a.email)}</b></span>
            <span>${ico('user','ico-sm')} логин: <b>${esc(a.desired_login)}</b></span>
            ${extraMeta}
          </div>
        </div>
        <div class="app-arrow">${ico('arrow-right','ico')}</div>
      </div>
    `;
  }).join('');

  wireApplicationsFilterTabs(v);
  $$('.app-card', v).forEach(card => {
    card.addEventListener('click', () => openApplicationModal(Number(card.dataset.appId)));
  });
}

function wireApplicationsFilterTabs(container) {
  $$('[data-app-filter]', container).forEach(tab => {
    tab.addEventListener('click', () => {
      applicationsFilter = tab.dataset.appFilter;
      renderApplications();
    });
  });
}

// ═══ МОДАЛКА ЗАЯВКИ УЧИТЕЛЯ ═══

function openApplicationModal(id) {
  const app = applicationsCache.find(a => a.id === id);
  if (!app) return;

  $('#app-title').innerHTML = `${ico('mail','ico ico-lg')} Заявка учителя`;
  $('#app-sub').textContent = `Подана ${formatDate(app.created_at)}`;

  const statusLabels = { new: 'Новая — ждёт решения', approved: 'Одобрена', rejected: 'Отклонена' };
  const statusBadge = `<span class="app-status ${app.status}">${statusLabels[app.status]}</span>`;

  let html = `
    <div class="app-info-block">
      <div class="app-info-row"><span class="lbl">Имя и фамилия</span><span class="val">${esc(app.full_name)}</span></div>
      <div class="app-info-row">
        <span class="lbl">Email</span>
        <span class="val mono" style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
          <span>${esc(app.email)}</span>
          <button id="copy-email-field-btn" title="Скопировать email"
                  style="padding:4px 8px;border-radius:8px;background:var(--light);border:1px solid var(--border);color:var(--gray);cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:12px">
            ${ico('copy','ico-sm')}
          </button>
        </span>
      </div>
      <div class="app-info-row">
        <span class="lbl">Желаемый логин</span>
        <span class="val mono" style="display:flex;gap:8px;align-items:center;justify-content:flex-end">
          <span>${esc(app.desired_login)}</span>
          <button id="copy-login-field-btn" title="Скопировать логин"
                  style="padding:4px 8px;border-radius:8px;background:var(--light);border:1px solid var(--border);color:var(--gray);cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:12px">
            ${ico('copy','ico-sm')}
          </button>
        </span>
      </div>
      <div class="app-info-row"><span class="lbl">Статус</span><span class="val">${statusBadge}</span></div>
      ${app.reviewed_at ? `<div class="app-info-row"><span class="lbl">Рассмотрена</span><span class="val">${formatDate(app.reviewed_at)}</span></div>` : ''}
      ${app.reject_reason ? `<div class="app-info-row"><span class="lbl">Причина отклонения</span><span class="val">${esc(app.reject_reason)}</span></div>` : ''}
    </div>
  `;

  if (app.status === 'new') {
    html += `
      <div class="app-actions-row">
        <button class="btn btn-approve" id="app-approve-btn">${ico('check','ico-sm')} Одобрить</button>
        <button class="btn btn-reject" id="app-reject-btn">${ico('x','ico-sm')} Отклонить</button>
      </div>
    `;
  }

  $('#app-body').innerHTML = html;

  // Кнопки копирования email / логина
  const copyEmailBtn = $('#copy-email-field-btn');
  const copyLoginBtn = $('#copy-login-field-btn');
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(app.email);
      toast(ok ? 'Email скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
    });
  }
  if (copyLoginBtn) {
    copyLoginBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(app.desired_login);
      toast(ok ? 'Логин скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
    });
  }

  if (app.status === 'new') {
    $('#app-approve-btn').addEventListener('click', () => approveApplication(app));
    $('#app-reject-btn').addEventListener('click', () => showRejectForm(app));
  }

  openModal('modal-application');
}

async function approveApplication(app) {
  const btn = $('#app-approve-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Одобряем…'; }

  try {
    const data = await api('/moder/tutor-applications/' + app.id + '/approve', { method: 'POST' });
    app.status = 'approved';
    app.reviewed_at = new Date().toISOString().replace('T', ' ').slice(0, 19);

    renderApprovedScreen(app, data.email_template);
    await loadStats();
    await loadTutors();
    toast('Заявка одобрена', 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `${ico('check','ico-sm')} Одобрить`; }
  }
}

function renderApprovedScreen(app, template) {
  const html = `
    <div class="approved-note">
      ${ico('check','ico-sm')}
      <div><b>Аккаунт учителя создан.</b><br>Логин: <b>${esc(app.desired_login)}</b>. Пароль — тот, который учитель указал при регистрации.</div>
    </div>
    <div class="email-template-block" style="background:linear-gradient(135deg,rgba(106,76,255,.06),rgba(14,165,233,.04));border-radius:16px;padding:18px 20px;border:1.5px solid rgba(106,76,255,.2);margin-top:16px">
      <div class="email-template-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <h4 style="font-size:14px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin:0">${ico('mail','ico-sm')} Письмо учителю</h4>
        <button class="copy-btn" id="copy-email-btn" style="padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:none">${ico('copy','ico-sm')} Скопировать письмо</button>
      </div>
      <div style="font-size:12.5px;color:var(--gray);font-weight:600;margin-bottom:12px">Кому: <b>${esc(template.to)}</b><br>Тема: <b>${esc(template.subject)}</b></div>
      <div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1.5px solid var(--border);font-family:'Consolas',monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dark);max-height:320px;overflow-y:auto;user-select:all">${esc(template.body)}</div>
    </div>
  `;
  $('#app-body').innerHTML = html;

  $('#copy-email-btn').addEventListener('click', async () => {
    const text = `Кому: ${template.to}\nТема: ${template.subject}\n\n${template.body}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      const btn = $('#copy-email-btn');
      btn.innerHTML = `${ico('check','ico-sm')} Скопировано`;
      setTimeout(() => btn.innerHTML = `${ico('copy','ico-sm')} Скопировать письмо`, 1800);
    } else {
      toast('Не удалось скопировать. Выделите текст вручную.', 'error');
    }
  });
}

function showRejectForm(app) {
  $('#app-body').innerHTML = `
    <div class="reject-reason-block">
      <label>${ico('message','ico-sm')} Причина отклонения (необязательно)</label>
      <textarea id="reject-reason" placeholder="Например: неверный email, некорректный логин…"></textarea>
    </div>
    <div class="app-actions-row">
      <button class="btn btn-reject" id="reject-confirm-btn">${ico('x','ico-sm')} Отклонить заявку</button>
      <button class="btn btn-ghost" id="reject-cancel-btn">Отмена</button>
    </div>
  `;
  $('#reject-cancel-btn').addEventListener('click', () => openApplicationModal(app.id));
  $('#reject-confirm-btn').addEventListener('click', () => rejectApplication(app));
}

async function rejectApplication(app) {
  const reason = ($('#reject-reason')?.value || '').trim();
  const btn = $('#reject-confirm-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Отклоняем…'; }

  try {
    const data = await api('/moder/tutor-applications/' + app.id + '/reject', {
      method: 'POST',
      body: { reason }
    });
    app.status = 'rejected';
    app.reviewed_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    app.reject_reason = reason || null;

    renderRejectedScreen(app, data.email_template);
    await loadStats();
    toast('Заявка отклонена', 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `${ico('x','ico-sm')} Отклонить заявку`; }
  }
}

function renderRejectedScreen(app, template) {
  const html = `
    <div class="approved-note" style="background:rgba(224,67,92,.1);color:#b02b2b">
      ${ico('x','ico-sm')}
      <div><b>Заявка отклонена.</b>${app.reject_reason ? '<br>Причина: ' + esc(app.reject_reason) : ''}</div>
    </div>
    <div class="email-template-block" style="background:linear-gradient(135deg,rgba(106,76,255,.06),rgba(14,165,233,.04));border-radius:16px;padding:18px 20px;border:1.5px solid rgba(106,76,255,.2);margin-top:16px">
      <div class="email-template-head" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
        <h4 style="font-size:14px;font-weight:800;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin:0">${ico('mail','ico-sm')} Письмо учителю</h4>
        <button class="copy-btn" id="copy-email-btn" style="padding:8px 14px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:none">${ico('copy','ico-sm')} Скопировать письмо</button>
      </div>
      <div style="font-size:12.5px;color:var(--gray);font-weight:600;margin-bottom:12px">Кому: <b>${esc(template.to)}</b><br>Тема: <b>${esc(template.subject)}</b></div>
      <div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1.5px solid var(--border);font-family:'Consolas',monospace;font-size:12.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dark);max-height:320px;overflow-y:auto;user-select:all">${esc(template.body)}</div>
    </div>
  `;
  $('#app-body').innerHTML = html;
  $('#copy-email-btn').addEventListener('click', async () => {
    const text = `Кому: ${template.to}\nТема: ${template.subject}\n\n${template.body}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      const btn = $('#copy-email-btn');
      btn.innerHTML = `${ico('check','ico-sm')} Скопировано`;
      setTimeout(() => btn.innerHTML = `${ico('copy','ico-sm')} Скопировать письмо`, 1800);
    } else {
      toast('Не удалось скопировать', 'error');
    }
  });
}

// ═══ ОТЗЫВЫ ═══

async function loadFeedback() {
  const data = await api('/moder/feedback');
  feedbackCache = data.feedback || [];
  renderFeedback();
}

function renderFeedback() {
  const v = $('#view-feedback');

  const counts = { pending: 0, approved: 0, rejected: 0, all: feedbackCache.length };
  for (const f of feedbackCache) {
    if (counts[f.status] !== undefined) counts[f.status]++;
  }

  let filterHtml = '<div class="apps-filter">';
  filterHtml += `<button class="apps-filter-tab ${feedbackFilter === 'pending' ? 'active' : ''}" data-fb-filter="pending">
    ${ico('star','ico-sm')} Новые <span class="fcnt ${counts.pending > 0 ? 'alert' : ''}">${counts.pending}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${feedbackFilter === 'approved' ? 'active' : ''}" data-fb-filter="approved">
    ${ico('check','ico-sm')} Одобренные <span class="fcnt alert-success">${counts.approved}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${feedbackFilter === 'rejected' ? 'active' : ''}" data-fb-filter="rejected">
    ${ico('x','ico-sm')} Отклонённые <span class="fcnt">${counts.rejected}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${feedbackFilter === 'all' ? 'active' : ''}" data-fb-filter="all">
    Все <span class="fcnt">${counts.all}</span>
  </button>`;
  filterHtml += '</div>';

  let list = feedbackCache;
  if (feedbackFilter !== 'all') {
    list = list.filter(f => f.status === feedbackFilter);
  }

  if (searchQuery) {
    list = list.filter(f =>
      (f.author_name || '').toLowerCase().includes(searchQuery) ||
      (f.text || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!list.length) {
    v.innerHTML = filterHtml + `
      <div class="moder-empty">
        <span class="ic">${ico('star','ico')}</span>
        <h3>${searchQuery ? 'Ничего не найдено' : (feedbackFilter === 'pending' ? 'Нет новых отзывов' : 'Отзывов нет')}</h3>
        <p>${searchQuery ? 'Попробуй другой запрос' : 'Отзывы посетителей будут появляться здесь'}</p>
      </div>`;
    wireFeedbackFilterTabs(v);
    return;
  }

  const statusLabels = { pending: 'На модерации', approved: 'Одобрен', rejected: 'Отклонён' };

  v.innerHTML = filterHtml + list.map(f => {
    let extraMeta = '';
    if (f.status === 'approved') {
      extraMeta = `<span>${ico('check','ico-sm')} Одобрен ${f.reviewed_at ? formatDate(f.reviewed_at) : ''}</span>`;
    } else if (f.status === 'rejected') {
      extraMeta = `<span>${ico('x','ico-sm')} Отклонён ${f.reviewed_at ? formatDate(f.reviewed_at) : ''}</span>`;
    } else {
      extraMeta = `<span>${ico('clock','ico-sm')} ${timeAgo(f.created_at)}</span>`;
    }

    return `
      <div class="feedback-card-item ${f.status}" data-fb-id="${f.id}">
        <div class="fb-head">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span class="fb-author">${esc(f.author_name || 'Анонимно')}</span>
            ${starsHtml(f.rating, 'fb-stars')}
          </div>
          <span class="fb-status ${f.status}">${statusLabels[f.status]}</span>
        </div>
        <div class="fb-text">${esc(f.text)}</div>
        <div class="fb-meta">${extraMeta}</div>
      </div>
    `;
  }).join('');

  wireFeedbackFilterTabs(v);
  $$('.feedback-card-item', v).forEach(card => {
    card.addEventListener('click', () => openFeedbackModal(Number(card.dataset.fbId)));
  });
}

function wireFeedbackFilterTabs(container) {
  $$('[data-fb-filter]', container).forEach(tab => {
    tab.addEventListener('click', () => {
      feedbackFilter = tab.dataset.fbFilter;
      renderFeedback();
    });
  });
}

function openFeedbackModal(id) {
  const fb = feedbackCache.find(f => f.id === id);
  if (!fb) return;

  $('#fb-modal-title').innerHTML = `${ico('star','ico ico-lg')} Отзыв`;
  $('#fb-modal-sub').textContent = `Оставлен ${formatDate(fb.created_at)}`;

  const statusLabels = { pending: 'На модерации', approved: 'Одобрен', rejected: 'Отклонён' };
  const statusBadge = `<span class="fb-status ${fb.status}" style="padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;text-transform:uppercase">${statusLabels[fb.status]}</span>`;

  let html = `
    <div class="feedback-stars-large">${starsHtml(fb.rating).replace(/<span class="[^"]*">/g,'').replace(/<\/span>/g,'')}</div>
    <div class="app-info-block">
      <div class="app-info-row">
        <span class="lbl">Автор</span>
        <span class="val">${esc(fb.author_name || 'Анонимно')}</span>
      </div>
      <div class="app-info-row">
        <span class="lbl">Оценка</span>
        <span class="val">${fb.rating} / 5</span>
      </div>
      <div class="app-info-row">
        <span class="lbl">Статус</span>
        <span class="val">${statusBadge}</span>
      </div>
      ${fb.reviewed_at ? `<div class="app-info-row"><span class="lbl">Рассмотрен</span><span class="val">${formatDate(fb.reviewed_at)}</span></div>` : ''}
      ${fb.reject_reason ? `<div class="app-info-row"><span class="lbl">Причина отклонения</span><span class="val">${esc(fb.reject_reason)}</span></div>` : ''}
    </div>

    <div class="feedback-text-preview ${fb.status}">${esc(fb.text)}</div>
  `;

  if (fb.status === 'pending') {
    html += `
      <div class="app-actions-row">
        <button class="btn btn-approve" id="fb-approve-btn">${ico('check','ico-sm')} Одобрить</button>
        <button class="btn btn-reject" id="fb-reject-btn">${ico('x','ico-sm')} Отклонить</button>
        <button class="btn btn-delete-soft" id="fb-delete-btn" style="flex:0 0 auto;min-width:auto">${ico('trash','ico-sm')} Удалить</button>
      </div>
    `;
  } else {
    html += `
      <div class="app-actions-row">
        <button class="btn btn-delete-soft" id="fb-delete-btn">${ico('trash','ico-sm')} Удалить навсегда</button>
      </div>
    `;
  }

  $('#fb-modal-body').innerHTML = html;

  if (fb.status === 'pending') {
    $('#fb-approve-btn').addEventListener('click', () => approveFeedback(fb));
    $('#fb-reject-btn').addEventListener('click', () => showFeedbackRejectForm(fb));
  }
  $('#fb-delete-btn').addEventListener('click', () => deleteFeedback(fb));

  openModal('modal-feedback');
}

async function approveFeedback(fb) {
  const btn = $('#fb-approve-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = 'Одобряем…'; }
  try {
    await api('/moder/feedback/' + fb.id + '/approve', { method: 'POST' });
    fb.status = 'approved';
    fb.reviewed_at = new Date().toISOString().replace('T',' ').slice(0,19);
    toast('Отзыв одобрен', 'success');
    closeModal('modal-feedback');
    await loadFeedback();
    await loadStats();
  } catch (e) {
    toast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `${ico('check','ico-sm')} Одобрить`; }
  }
}

function showFeedbackRejectForm(fb) {
  $('#fb-modal-body').innerHTML = `
    <div class="reject-reason-block">
      <label>${ico('message','ico-sm')} Причина отклонения (необязательно)</label>
      <textarea id="fb-reject-reason" placeholder="Например: спам, оскорбления, не по теме…"></textarea>
    </div>
    <div class="app-actions-row">
      <button class="btn btn-reject" id="fb-reject-confirm">${ico('x','ico-sm')} Отклонить отзыв</button>
      <button class="btn btn-ghost" id="fb-reject-cancel">Отмена</button>
    </div>
  `;
  $('#fb-reject-cancel').addEventListener('click', () => openFeedbackModal(fb.id));
  $('#fb-reject-confirm').addEventListener('click', async () => {
    const reason = ($('#fb-reject-reason')?.value || '').trim();
    const btn = $('#fb-reject-confirm');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Отклоняем…'; }
    try {
      await api('/moder/feedback/' + fb.id + '/reject', { method: 'POST', body: { reason } });
      fb.status = 'rejected';
      fb.reviewed_at = new Date().toISOString().replace('T',' ').slice(0,19);
      fb.reject_reason = reason || null;
      toast('Отзыв отклонён', 'success');
      closeModal('modal-feedback');
      await loadFeedback();
      await loadStats();
    } catch (e) {
      toast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `${ico('x','ico-sm')} Отклонить отзыв`; }
    }
  });
}

function deleteFeedback(fb) {
  askConfirm(
    'Удалить отзыв?',
    'Отзыв будет удалён безвозвратно. Восстановить не получится.',
    async () => {
      try {
        await api('/moder/feedback/' + fb.id, { method: 'DELETE' });
        toast('Отзыв удалён', 'success');
        closeModal('modal-feedback');
        await loadFeedback();
        await loadStats();
      } catch (e) {
        toast(e.message, 'error');
      }
    }
  );
}

// ═══ ЗАЯВКИ ОТ УЧЕНИКОВ (leads) ═══

async function loadLeads() {
  const data = await api('/moder/leads');
  leadsCache = data.leads || [];
  renderLeads();
}

function renderLeads() {
  const v = $('#view-leads');

  const counts = { new: 0, read: 0, all: leadsCache.length };
  for (const l of leadsCache) {
    if (counts[l.status] !== undefined) counts[l.status]++;
  }

  let filterHtml = '<div class="apps-filter">';
  filterHtml += `<button class="apps-filter-tab ${leadsFilter === 'new' ? 'active' : ''}" data-lead-filter="new">
    ${ico('inbox','ico-sm')} Новые <span class="fcnt ${counts.new > 0 ? 'alert' : ''}">${counts.new}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${leadsFilter === 'read' ? 'active' : ''}" data-lead-filter="read">
    ${ico('check','ico-sm')} Прочитанные <span class="fcnt">${counts.read}</span>
  </button>`;
  filterHtml += `<button class="apps-filter-tab ${leadsFilter === 'all' ? 'active' : ''}" data-lead-filter="all">
    Все <span class="fcnt">${counts.all}</span>
  </button>`;
  filterHtml += '</div>';

  let list = leadsCache;
  if (leadsFilter !== 'all') {
    list = list.filter(l => l.status === leadsFilter);
  }

  if (searchQuery) {
    list = list.filter(l =>
      (l.name || '').toLowerCase().includes(searchQuery) ||
      (l.phone || '').toLowerCase().includes(searchQuery) ||
      (l.comment || '').toLowerCase().includes(searchQuery)
    );
  }

  if (!list.length) {
    v.innerHTML = filterHtml + `
      <div class="moder-empty">
        <span class="ic">${ico('inbox','ico')}</span>
        <h3>${searchQuery ? 'Ничего не найдено' : (leadsFilter === 'new' ? 'Нет новых заявок' : 'Заявок нет')}</h3>
        <p>${searchQuery ? 'Попробуй другой запрос' : 'Заявки с визитки будут появляться здесь'}</p>
      </div>`;
    wireLeadsFilterTabs(v);
    return;
  }

  v.innerHTML = filterHtml + list.map(l => {
    const isRead = l.status === 'read';
    const gradeTxt = l.grade ? gradeLabel(l.grade) : '';
    const phoneDigits = (l.phone || '').replace(/\D/g, '');
    return `
      <div class="lead-card-item ${isRead ? 'read' : ''}" data-lead-id="${l.id}">
        <div class="lead-avatar">${ico('user','ico-lg')}</div>
        <div class="lead-body">
          <div class="lead-head">
            <span class="lead-name">${esc(l.name)}</span>
            <span class="lead-status ${l.status}">${isRead ? 'Прочитана' : 'Новая'}</span>
          </div>
          <div class="lead-meta">
            <a href="tel:${esc(phoneDigits)}">${ico('phone','ico-sm')} ${esc(l.phone)}</a>
            <button data-copy-phone="${esc(phoneDigits)}" title="Скопировать телефон"
                    style="padding:2px 8px;border-radius:8px;background:var(--light);border:1px solid var(--border);color:var(--gray);cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;margin-left:4px">
              ${ico('copy','ico-sm')}
            </button>
            ${gradeTxt ? `<span>${ico('cap','ico-sm')} ${esc(gradeTxt)}</span>` : ''}
            <span class="lead-time">${ico('clock','ico-sm')} ${timeAgo(l.created_at)}</span>
          </div>
          ${l.comment ? `<div class="lead-comment">${esc(l.comment)}</div>` : ''}
        </div>
        <div class="lead-actions">
          ${!isRead ? `<button data-mark-read="${l.id}" title="Отметить как прочитанную">${ico('check','ico-sm')} Прочитано</button>` : ''}
          <button class="danger" data-delete-lead="${l.id}" title="Удалить">${ico('trash','ico-sm')}</button>
        </div>
      </div>
    `;
  }).join('');

  wireLeadsFilterTabs(v);

  $$('[data-copy-phone]', v).forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const phone = b.dataset.copyPhone;
      const ok = await copyToClipboard(phone);
      toast(ok ? 'Телефон скопирован' : 'Не удалось скопировать', ok ? 'success' : 'error');
    });
  });

  $$('[data-mark-read]', v).forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.markRead);
      try {
        await api('/moder/leads/' + id + '/read', { method: 'POST' });
        const lead = leadsCache.find(x => x.id === id);
        if (lead) { lead.status = 'read'; lead.read_at = new Date().toISOString().replace('T',' ').slice(0,19); }
        renderLeads();
        await loadStats();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  $$('[data-delete-lead]', v).forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.deleteLead);
      const lead = leadsCache.find(x => x.id === id);
      askConfirm('Удалить заявку?', `Заявка от «${lead?.name || ''}» будет удалена безвозвратно.`, async () => {
        try {
          await api('/moder/leads/' + id, { method: 'DELETE' });
          toast('Заявка удалена', 'success');
          await loadLeads();
          await loadStats();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  });
}

function wireLeadsFilterTabs(container) {
  $$('[data-lead-filter]', container).forEach(tab => {
    tab.addEventListener('click', () => {
      leadsFilter = tab.dataset.leadFilter;
      renderLeads();
    });
  });
}

// Автоматическая отметка всех новых заявок как прочитанных при открытии вкладки
async function autoMarkLeadsRead() {
  setTimeout(async () => {
    const hasNew = leadsCache.some(l => l.status === 'new');
    if (!hasNew) return;
    try {
      await api('/moder/leads/mark-read', { method: 'POST' });
      for (const l of leadsCache) {
        if (l.status === 'new') {
          l.status = 'read';
          l.read_at = new Date().toISOString().replace('T',' ').slice(0,19);
        }
      }
      await loadStats();
    } catch (e) {}
  }, 3000);
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
            <span>${ico('cap','ico-sm')} было <b>${t.students_count}</b> учеников</span>
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
    html += `<h3 style="font-size:15px;font-weight:800;color:var(--gray);text-transform:uppercase;letter-spacing:.5px;margin:24px 0 12px">${ico('cap','ico-sm')} Ученики в корзине (${students.length})</h3>`;
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
      askConfirm('Сбросить пароль?', 'Будет сгенерирован новый пароль. Покажется один раз — передайте пользователю.', async () => {
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
      const user = isTutor ? tutorsCache.find(t => t.id === id) : studentsCache.find(s => s.id === id);
      if (!user) return;
      const msg = isTutor
        ? `«${user.display_name}» и все его ученики уйдут в корзину на 30 дней.`
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
      askConfirm('Удалить навсегда?', 'Это действие нельзя отменить. Пользователь и все его данные будут удалены безвозвратно.', async () => {
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

$('#np-copy').addEventListener('click', async () => {
  const pwd = $('#np-value').textContent;
  const ok = await copyToClipboard(pwd);
  if (ok) {
    $('#np-copy').innerHTML = `${ico('check','ico-sm')} Скопировано`;
    setTimeout(() => $('#np-copy').innerHTML = `${ico('copy','ico-sm')} Скопировать`, 1500);
  } else {
    toast('Не удалось скопировать', 'error');
  }
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

// ═══ АВТООБНОВЛЕНИЕ СЧЁТЧИКОВ ═══

let pollTimer = null;

async function refreshCounters() {
  try {
    const apps = await api('/moder/tutor-applications/count');
    updateApplicationsCounter(apps.count);

    const fb = await api('/moder/feedback/count');
    updateFeedbackCounter(fb.count);

    const leads = await api('/moder/leads/count');
    updateLeadsCounter(leads.count);

    if (stats) {
      stats.applications = apps.count;
      stats.feedback_pending = fb.count;
      stats.leads_new = leads.count;
    }
  } catch (e) {}
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshCounters, 15000);

  // Обновляем счётчики когда пользователь возвращается на вкладку
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshCounters();
    }
  });
  window.addEventListener('focus', () => {
    refreshCounters();
  });
}

// ═══ СТАРТ ═══

(async function boot() {
  try {
    const searchInput = $('#moder-search');
    if (searchInput) { searchInput.value = ''; searchQuery = ''; }

    const { user } = await api('/moder/me');
    if (user.role !== 'moderator') {
      location.href = 'moder-login.html';
      return;
    }
    me = user;

    await loadStats();
    await Promise.all([
      loadTutors(),
      loadStudents(),
      loadApplications(),
      loadFeedback(),
      loadLeads(),
      loadTrash()
    ]);

    switchView('tutors');
    startPolling();

    // Первичный прогон счётчиков сразу после загрузки (на случай если stats не обновил)
    refreshCounters();
  } catch (e) {
    console.error('boot error:', e);
  }
})();