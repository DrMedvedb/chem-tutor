/* public/js/dashboard-student.js */

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
    location.href = 'student-login.html';
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

function pctClass(p) {
  if (p >= 80) return 'excellent';
  if (p >= 50) return 'good';
  return 'weak';
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
  junior: { label: 'Младшая', cls: 'g-junior' },
  '8':    { label: '8 класс', cls: 'g-8' },
  '9':    { label: '9 класс', cls: 'g-9' },
  '10':   { label: '10 класс', cls: 'g-10' },
  '11':   { label: '11 класс', cls: 'g-11' },
  adult:  { label: 'Старшие', cls: 'g-adult' }
};
function gradeBadge(id) {
  if (!id || !GRADES[id]) return '';
  return `<span class="grade-badge ${GRADES[id].cls}">${esc(GRADES[id].label)}</span>`;
}

// ⭐ Расписание: константы
const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

let tablesRendered = false;
let me = null;
let nextLessonTimer = null;

function switchView(view) {
  $$('.topbar-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  $('#view-topics').style.display   = (view === 'topics')   ? '' : 'none';
  $('#view-schedule').style.display = (view === 'schedule') ? '' : 'none';
  $('#view-tables').style.display   = (view === 'tables')   ? '' : 'none';
  $('#view-chat').style.display     = (view === 'chat')     ? '' : 'none';
  $('#view-history').style.display  = (view === 'history')  ? '' : 'none';

  if (view === 'topics')   loadTopics();
  if (view === 'schedule') loadMySchedule();
  if (view === 'tables')   loadTables();
  if (view === 'history')  loadHistory();
}
$$('.topbar-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

window.switchToChatSection = function () {
  switchView('chat');
};

function switchSubtab(subtab) {
  $$('.subtab').forEach(s => s.classList.toggle('active', s.dataset.subtab === subtab));
  $$('.tab-content').forEach(p => {
    p.style.display = (p.dataset.subpane === subtab) ? '' : 'none';
  });
}
$$('.subtab').forEach(s => s.addEventListener('click', () => switchSubtab(s.dataset.subtab)));

function loadTables() {
  if (tablesRendered) return;
  tablesRendered = true;

  try {
    if (typeof window.renderPeriodic === 'function') {
      window.renderPeriodic('student-periodic-grid');
    }
  } catch (e) {
    console.error('Ошибка рендера Менделеева:', e);
  }

  try {
    if (typeof window.renderSolubility === 'function') {
      window.renderSolubility('student-solubility-wrap');
    }
  } catch (e) {
    console.error('Ошибка рендера растворимости:', e);
  }
}

async function autoOpenSingleDialog() {
  try {
    const res = await fetch('/api/chat/dialogs', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.dialogs && data.dialogs.length === 1) {
      if (window.Chat) window.Chat.openWith(data.dialogs[0].user.id);
    }
  } catch (e) {}
}

$('#logout').addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.href = 'index.html';
});

// ─── Темы ученика ───
async function loadTopics() {
  const v = $('#topics-wrap');
  v.innerHTML = skeletonTiles(4);
  try {
    const { topics } = await api('/my/topics');
    const withScore = topics.filter(t => t.best_percent !== null && t.best_percent !== undefined);
    const avg = withScore.length
      ? Math.round(withScore.reduce((s, t) => s + t.best_percent, 0) / withScore.length)
      : 0;
    updateRing(avg);

    if (!topics.length) {
      v.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <span class="empty-icon">📚</span>
        <h3>Тем пока нет</h3>
        <p>Учитель ещё не открыл вам ни одной темы. Заходите позже!</p>
      </div>`;
      return;
    }

    v.innerHTML = topics.map(t => {
      const isWelcome = t.is_welcome === 1;
      const hasBest = t.best_percent !== null && t.best_percent !== undefined;
      const pct = hasBest ? Math.round(t.best_percent) : null;
      const cls = hasBest ? pctClass(pct) : 'new';
      const pendingCount = t.pending_count || 0;

      let badge;
      if (isWelcome) {
        badge = `<div class="best-badge" style="background:linear-gradient(135deg,rgba(255,170,0,.16),rgba(255,170,0,.05));color:#c47f00">
          <span class="star" style="animation-duration:1.6s">⭐</span> Вводная
        </div>`;
      } else if (pendingCount > 0) {
        badge = `<div class="best-badge" style="background: rgba(255,170,0,.15); color:#c47f00;">
          <span class="star" style="animation-duration:1.2s">⏳</span> Ждёт проверки
        </div>`;
      } else if (hasBest) {
        badge = `<div class="best-badge ${cls}"><span class="star">⭐</span> ${pct}%</div>`;
      } else {
        badge = `<div class="best-badge new">🆕 Не пройдено</div>`;
      }

      const fresh = (!hasBest && pendingCount === 0 && !isWelcome) ? 'fresh' : '';

      let btnLabel;
      if (isWelcome) btnLabel = 'Открыть';
      else if (pendingCount > 0) btnLabel = 'Смотреть тему';
      else if (hasBest) btnLabel = 'Открыть заново';
      else btnLabel = 'Изучить тему';

      const gradeBadgeHtml = (!isWelcome && t.grade) ? gradeBadge(t.grade) : '';

      return `
        <div class="topic-tile ${fresh}" data-open="${t.id}">
          ${badge}
          <h3>${esc(t.title)}</h3>
          ${gradeBadgeHtml ? `<div style="margin-top:-6px">${gradeBadgeHtml}</div>` : ''}
          <p class="desc">${esc(t.description || 'Без описания')}</p>
          <div class="meta">
            <span>📄 <b>${t.materials_count}</b> материалов</span>
            ${isWelcome
              ? `<span style="color:#c47f00;font-weight:600">⭐ Знакомство</span>`
              : `<span>❓ <b>${t.questions_count}</b> вопросов</span>`
            }
          </div>
          <button class="btn btn-accent btn-block" style="margin-top:auto">
            ${btnLabel} →
          </button>
        </div>
      `;
    }).join('');

    $$('[data-open]', v).forEach(tile => {
      tile.onclick = () => {
        location.href = 'student-topic.html?id=' + tile.dataset.open;
      };
    });
  } catch (e) {
    v.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

function updateRing(percent) {
  const r = 24;
  const len = 2 * Math.PI * r;
  const ring = $('#ring-fg');
  if (!ring) return;
  ring.setAttribute('stroke-dasharray', len.toFixed(1));
  ring.setAttribute('stroke-dashoffset', (len * (1 - percent / 100)).toFixed(1));
}

// ─── История ───
async function loadHistory() {
  const v = $('#history-wrap');
  v.innerHTML = skeletonTiles(3);
  try {
    const { attempts } = await api('/my/attempts');
    if (!attempts.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon">📊</span>
        <h3>Вы ещё не проходили тесты</h3>
        <p>Пройдите хотя бы один тест, чтобы увидеть историю</p>
      </div>`;
      return;
    }
    v.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Тема</th><th>Балл</th><th>Результат</th><th>Время</th><th>Дата</th>
          </tr></thead>
          <tbody>
            ${attempts.map(a => {
              const pending = a.status === 'pending_review';
              const pct = pending ? null : Math.round((a.score / a.total) * 100);
              const cls = pending ? '' : pctClass(pct);
              return `<tr data-attempt="${a.id}" style="cursor:pointer">
                <td><b>${esc(a.topic_title)}</b></td>
                <td>${pending ? '<span class="muted">—</span>' : `${a.score} / ${a.total}`}</td>
                <td>
                  ${pending
                    ? `<span class="badge" style="background: rgba(255,170,0,.14); color:#c47f00;">⏳ Ждёт проверки</span>`
                    : `<span class="history-score ${cls}">${pct}%</span>`}
                </td>
                <td class="muted" style="font-size:13px">⏱ ${formatDuration(a.duration_sec)}</td>
                <td class="muted" style="font-size:13px">${esc(a.created_at)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    $$('[data-attempt]', v).forEach(tr => {
      tr.onclick = () => openAttemptModal(Number(tr.dataset.attempt));
    });
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ═══ РАСПИСАНИЕ УЧЕНИКА ═══

async function loadMySchedule() {
  const v = $('#my-schedule-wrap');
  v.innerHTML = `<div class="grid grid-2">${skeletonTiles(2)}</div>`;

  try {
    const data = await api('/my/lessons');
    const lessons = data.lessons || [];

    if (!lessons.length) {
      v.innerHTML = `<div class="empty">
        <span class="empty-icon">📅</span>
        <h3>Пока нет занятий</h3>
        <p>Учитель ещё не назначил вам занятия. Как только назначит — они появятся здесь.</p>
      </div>`;
      return;
    }

    // Группируем по дате
    const groups = {};
    for (const l of lessons) {
      if (!groups[l.date]) groups[l.date] = [];
      groups[l.date].push(l);
    }

    const todayStr = dateStrLocal(new Date());

    let html = '<div class="my-schedule-list">';
    for (const date of Object.keys(groups).sort()) {
      const items = groups[date].sort((a, b) => timeToMinutes(a.time_start) - timeToMinutes(b.time_start));
      const d = new Date(date + 'T00:00:00');
      const isToday = date === todayStr;
      const dowIdx = (d.getDay() + 6) % 7;

      const dayLabel = isToday
        ? '🔔 Сегодня'
        : (date === dateStrLocal(new Date(Date.now() + 86400000)) ? '📅 Завтра' : DOW_FULL[dowIdx]);

      html += `
        <div class="msl-day-group ${isToday ? 'today' : ''}">
          <div class="msl-day-title">
            ${dayLabel}
            <span class="msl-date">${d.getDate()} ${MONTHS_GEN[d.getMonth()]}</span>
          </div>
          ${items.map(l => {
            const now = Date.now();
            const dt = new Date(l.date + 'T' + l.time_start + ':00');
            const endMs = dt.getTime() + (l.duration_min * 60 * 1000);
            const isPast = endMs < now;
            const minutesUntil = Math.round((dt.getTime() - now) / 60000);
            const isSoon = minutesUntil > 0 && minutesUntil <= 60;

            return `
              <div class="msl-lesson ${isPast ? 'past' : ''}">
                <div class="msl-time">${esc(l.time_start)}</div>
                <div class="msl-body">
                  <div class="msl-tutor">${esc(l.tutor_name || 'Учитель')}</div>
                  <div class="msl-meta">
                    ${l.duration_min} мин${l.subject ? ' · ' + esc(l.subject) : ''}
                  </div>
                </div>
                <div class="msl-status ${isSoon ? 'soon' : (isPast ? 'past' : '')}">
                  ${isPast ? 'прошло' : (isSoon ? `через ${minutesUntil} мин` : 'скоро')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    html += '</div>';

    v.innerHTML = html;
  } catch (e) {
    v.innerHTML = `<div class="empty"><h3>Ошибка</h3><p>${esc(e.message)}</p></div>`;
  }
}

// ═══ БАННЕР: СКОРО ЗАНЯТИЕ ═══

function dateStrLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmtCountdown(minutes, seconds) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}ч ${String(m).padStart(2,'0')}м`;
  }
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

async function loadNextLessonBanner() {
  const banner = $('#next-lesson-banner');
  if (!banner) return;

  try {
    const data = await api('/my/lessons/next');
    const lesson = data.lesson;

    if (!lesson || data.minutes_until > 60 || data.minutes_until < 0) {
      banner.classList.remove('show');
      banner.innerHTML = '';
      return;
    }

    const minutes = data.minutes_until;
    const seconds = 0;

    banner.classList.add('show');
    banner.innerHTML = `
      <div class="nlb-row">
        <div class="nlb-icon">🔔</div>
        <div class="nlb-body">
          <div class="nlb-title">Скоро занятие!</div>
          <div class="nlb-sub">
            <span class="nlb-time">${esc(lesson.time_start)}</span>
            ${lesson.subject ? ' · ' + esc(lesson.subject) : ''}
            · ${lesson.duration_min} мин
          </div>
        </div>
        <div class="nlb-countdown" id="nlb-countdown">${fmtCountdown(minutes, seconds)}</div>
      </div>
    `;

    // Тикаем обратный отсчёт каждую секунду
    if (nextLessonTimer) clearInterval(nextLessonTimer);
    let totalSec = minutes * 60;
    nextLessonTimer = setInterval(() => {
      totalSec--;
      const el = $('#nlb-countdown');
      if (!el) {
        clearInterval(nextLessonTimer);
        return;
      }
      if (totalSec <= 0) {
        clearInterval(nextLessonTimer);
        el.textContent = 'сейчас!';
        loadNextLessonBanner();
        return;
      }
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      el.textContent = fmtCountdown(m, s);
    }, 1000);
  } catch (e) {
    banner.classList.remove('show');
  }
}

function startNextLessonPolling() {
  loadNextLessonBanner();
  setInterval(loadNextLessonBanner, 5 * 60 * 1000); // каждые 5 минут
}

// ═══ МОДАЛКА ПРОСМОТРА ПОПЫТКИ ═══

function letterFor(i) { return String.fromCharCode(65 + i); }

function ensureAttemptModal() {
  if ($('#modal-attempt')) return;
  const html = `
    <div class="modal-backdrop" id="modal-attempt">
      <div class="modal" style="max-width:720px">
        <h3 id="am-title">Результат</h3>
        <p class="muted mt-1" style="font-size:14px" id="am-sub"></p>
        <div id="am-body" class="mt-3"></div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-ghost" data-am-close>Закрыть</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  $('#modal-attempt').addEventListener('click', (e) => {
    if (e.target.id === 'modal-attempt' || e.target.closest('[data-am-close]')) {
      $('#modal-attempt').classList.remove('open');
    }
  });
}

async function openAttemptModal(attemptId) {
  ensureAttemptModal();
  const modal = $('#modal-attempt');
  $('#am-title').textContent = 'Загрузка…';
  $('#am-sub').textContent = '';
  $('#am-body').innerHTML = '';
  modal.classList.add('open');

  try {
    const data = await api('/my/attempts/' + attemptId);
    const a = data.attempt;
    const pending = a.status === 'pending_review';

    $('#am-title').textContent = a.topic_title;
    $('#am-sub').textContent = `${a.test_title} · ${a.created_at} · ⏱ ${formatDuration(a.duration_sec)}`;

    const header = pending
      ? `<div style="padding:14px 18px;border-radius:14px;background:rgba(255,170,0,.1);border-left:3px solid #ffaa00;margin-bottom:18px">
           <b>⏳ Ждёт проверки учителем.</b><br>
           <span style="font-size:13.5px;color:var(--gray)">Комментарии и итоговый балл появятся после проверки.</span>
         </div>`
      : `<div style="padding:14px 18px;border-radius:14px;background:rgba(0,212,184,.08);border-left:3px solid var(--accent);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
           <div>
             <div style="font-size:22px;font-weight:800">${Math.round(a.percent)}%</div>
             <div style="font-size:13px;color:var(--gray)">${a.score} из ${a.total} баллов</div>
           </div>
           <div style="font-size:13px;color:var(--gray)">${a.reviewed_at ? 'Проверено: ' + esc(a.reviewed_at) : 'Авто-проверка'}</div>
         </div>`;

    $('#am-body').innerHTML = header + data.detail.map((d, i) => renderAttemptItem(d, i)).join('');
  } catch (e) {
    $('#am-title').textContent = 'Ошибка';
    $('#am-body').innerHTML = `<p>${esc(e.message)}</p>`;
  }
}

function renderAttemptItem(d, i) {
  if (d.type === 'open') {
    const grade = d.grade;
    const cls = grade === 'correct' ? 'correct'
              : grade === 'partial' ? 'partial'
              : grade === 'wrong'   ? 'wrong'
              : 'pending';
    const icon = grade === 'correct' ? '✅'
              : grade === 'partial' ? '🟡'
              : grade === 'wrong'   ? '❌'
              : '⏳';
    const gradeText = grade === 'correct' ? 'Верно'
                   : grade === 'partial' ? 'Частично верно'
                   : grade === 'wrong'   ? 'Неверно'
                   : 'Ждёт проверки учителя';

    return `
      <div class="detail-item ${cls}" style="margin-bottom:12px">
        <div class="detail-q"><span>${icon}</span><span>${i + 1}. ${esc(d.text)}
          <span style="padding:2px 8px;border-radius:999px;background:rgba(255,170,0,.15);color:#c47f00;font-size:11px;font-weight:700;text-transform:uppercase;margin-left:6px">✍️ развёрнутый</span>
        </span></div>
        <div class="detail-answers">
          <div class="row">
            <span class="lbl">Ваш ответ:</span>
            <span class="val">
              ${d.given_text ? esc(d.given_text) : '<i>— текст не введён —</i>'}
              ${d.given_file ? `<br>📎 <a href="${esc(d.given_file)}" target="_blank" rel="noopener">${esc(d.given_file_name || 'файл')}</a>` : ''}
            </span>
          </div>
          <div class="row">
            <span class="lbl">Оценка:</span>
            <span class="val ${grade === 'correct' ? 'ok' : grade === 'wrong' ? 'bad' : ''}">${gradeText}</span>
          </div>
        </div>
        ${d.comment ? `<div class="teacher-comment" style="margin-top:10px;padding:12px 16px;border-radius:12px;background:rgba(106,76,255,.06);border-left:3px solid var(--primary);font-size:13.5px;line-height:1.5">
          <div style="font-weight:700;color:var(--primary);margin-bottom:4px;font-size:12.5px;text-transform:uppercase;letter-spacing:.4px">💬 Комментарий учителя</div>
          ${esc(d.comment)}
        </div>` : ''}
      </div>
    `;
  }

  const ok = d.auto_correct;
  const correctSet = new Set(d.correct || []);
  const givenSet = new Set(
    Array.isArray(d.given) ? d.given
    : typeof d.given === 'number' ? [d.given]
    : []
  );
  const options = d.options || [];
  const typeLabel = d.type === 'multi' ? '☑️ несколько' : '🔘 один';
  const typeBg = d.type === 'multi' ? 'rgba(0,212,184,.14)' : 'rgba(106,76,255,.12)';
  const typeColor = d.type === 'multi' ? 'var(--accent-dark)' : 'var(--primary)';

  return `
    <div class="detail-item ${ok ? 'correct' : 'wrong'}" style="margin-bottom:12px">
      <div class="detail-q"><span>${ok ? '✅' : '❌'}</span><span>${i + 1}. ${esc(d.text)}
        <span style="padding:2px 8px;border-radius:999px;background:${typeBg};color:${typeColor};font-size:11px;font-weight:700;text-transform:uppercase;margin-left:6px">${typeLabel}</span>
      </span></div>
      <div class="detail-answers">
        ${options.map((o, idx) => {
          const isCorrect = correctSet.has(idx);
          const isGiven = givenSet.has(idx);
          let mark = '';
          if (isCorrect && isGiven) mark = '✅';
          else if (isCorrect && !isGiven) mark = '🟢 <i>(пропущено)</i>';
          else if (!isCorrect && isGiven) mark = '❌ <i>(лишний)</i>';
          return `<div class="row">
            <span class="lbl">${letterFor(idx)}.</span>
            <span class="val ${isCorrect && isGiven ? 'ok' : !isCorrect && isGiven ? 'bad' : ''}">
              ${esc(o)} ${mark}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ═══ СТАРТ ═══

(async function boot() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'student') {
      location.href = 'tutor-login.html';
      return;
    }
    me = user;

    $('#me-name').textContent = user.display_name;

    window.Avatars.apply('#avatar', user, {
      size: 'md',
      round: true,
      title: user.display_name,
      pop: true
    });

    window.Search?.init({ role: 'student' });

    if (window.Chat) window.Chat.setMe(user);
    window.Chat?.init({
      role: 'student',
      mountSelector: '#chat-mount',
      notifMountSelector: '#nav-chat'
    });

    switchView('topics');

    // ⭐ Баннер «скоро занятие» + опрос каждые 5 минут
    startNextLessonPolling();
  } catch (e) {}
})();