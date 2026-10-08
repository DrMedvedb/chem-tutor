/* public/js/take-test.js */

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
  if (res.status === 401) {
    location.href = 'student-login.html';
    throw new Error('unauth');
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

function letterFor(idx) { return String.fromCharCode(65 + idx); }
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
function formatTimer(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

let test = null;
let questions = [];
let answers = {};
let submitted = false;
let startedAt = Date.now();

// ⭐ Таймер
let timerMin = null;
let timerLeft = null;
let timerInterval = null;
let timerPanel = null;

// ─── Загрузка ───
async function loadTest() {
  try {
    const data = await api('/my/tests/' + topicId);
    test = data.test;
    questions = data.questions;
    $('#tt-topic-name').textContent = test.topic_title || '';

    startedAt = Date.now();

    // ⭐ Таймер
    if (test.timer_min && test.timer_min > 0) {
      timerMin = test.timer_min;
      timerLeft = timerMin * 60;
    }

    renderAll();
    updateProgress();

    // ✅ Показываем кнопки шпаргалок
    window.Cheatsheet?.show();

    // ⭐ Запускаем таймер, если задан
    if (timerMin) startTimer();
  } catch (e) {
    // ⭐ Определяем причину
    const msg = String(e.message || '');
    const isAccessDenied =
      e.status === 403 ||
      msg.includes('не открыл доступ') ||
      msg.includes('Тест ещё не опубликован') ||
      msg.includes('Попытки закончились') ||
      msg.includes('Вводная тема');

    if (isAccessDenied) {
      let emoji = '🔒';
      let title = 'Тест закрыт';
      let sub = 'Учитель не открыл вам доступ к тесту по этой теме.<br>Материалы темы по-прежнему доступны — вернитесь и изучайте.';

      if (msg.includes('Попытки закончились')) {
        emoji = '🚫';
        title = 'Попытки закончились';
        sub = 'Вы израсходовали все попытки, которые разрешил учитель.<br>Обратитесь к нему, если нужны дополнительные попытки.';
      } else if (msg.includes('ещё не опубликован')) {
        emoji = '📝';
        title = 'Тест ещё не опубликован';
        sub = 'Учитель ещё готовит этот тест. Загляните позже.';
      } else if (msg.includes('Вводная тема')) {
        emoji = '⭐';
        title = 'Вводная тема';
        sub = 'В этой теме нет теста — только материалы для знакомства с платформой.';
      }

      $('#content').innerHTML = `
        <div class="result-wrap" style="position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#e0435c,#ff7a8e)"></div>
          <span class="result-emoji">${emoji}</span>
          <h2 class="result-title">${title}</h2>
          <p class="result-sub">${sub}</p>
          <div class="result-actions" style="justify-content:center">
            <a href="student-topic.html?id=${topicId}" class="btn btn-accent" style="padding:14px 32px">
              ← К материалам темы
            </a>
            <a href="dashboard-student.html" class="btn btn-ghost" style="padding:14px 32px">
              К моим темам
            </a>
          </div>
        </div>
      `;
    } else {
      toast(e.message, 'error');
      $('#content').innerHTML = `<div class="result-wrap">
        <span class="result-emoji">😕</span>
        <h2 class="result-title">Тест недоступен</h2>
        <p class="result-sub">${esc(e.message)}</p>
        <a href="dashboard-student.html" class="btn btn-accent">← К темам</a>
      </div>`;
    }
    window.Cheatsheet?.hide();
  }
}

// ═══ ТАЙМЕР ═══

function startTimer() {
  const progressBlock = $('#progress-block');
  if (!progressBlock) return;

  timerPanel = document.createElement('div');
  timerPanel.className = 'tt-timer-panel';
  timerPanel.innerHTML = `
    <span class="tt-timer-ic">⏱</span>
    <span class="tt-timer-label">До конца теста:</span>
    <span class="tt-timer-value" id="tt-timer-value">${formatTimer(timerLeft)}</span>
  `;
  progressBlock.parentNode.insertBefore(timerPanel, progressBlock);

  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerLeft--;
    updateTimerDisplay();

    if (timerLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = $('#tt-timer-value');
  if (!el || !timerPanel) return;
  el.textContent = formatTimer(timerLeft);

  if (timerLeft <= 60) {
    timerPanel.classList.add('tt-timer-danger');
  } else if (timerLeft <= 5 * 60) {
    timerPanel.classList.add('tt-timer-warn');
  }
}

async function autoSubmit() {
  if (submitted) return;

  toast('Время вышло — тест отправляется автоматически', 'error');

  const payload = {};
  for (const q of questions) {
    const a = answers[q.id];
    const type = q.type || 'single';
    if (type === 'open') {
      payload[q.id] = {
        text: (a?.text || '').trim(),
        file: a?.file || null,
        file_name: a?.file_name || null
      };
    } else if (type === 'single') {
      payload[q.id] = { value: (typeof a?.value === 'number') ? a.value : null };
    } else {
      payload[q.id] = { value: Array.isArray(a?.value) ? a.value : [] };
    }
  }

  await doSubmit(payload, true);
}

// ─── Рендер ───
function renderAll() {
  $('#content').innerHTML = questions.map((q, i) => {
    const type = q.type || 'single';
    let hint = '';
    if (type === 'single') hint = `<span class="q-type-hint single">🔘 один вариант</span>`;
    if (type === 'multi')  hint = `<span class="q-type-hint multi">☑️ несколько вариантов</span>`;
    if (type === 'open')   hint = `<span class="q-type-hint open">✍️ развёрнутый</span>`;

    let body = '';
    if (type === 'single') {
      body = `<div class="options">
        ${(q.options || []).map((opt, idx) => `
          <div class="opt radio" data-qid="${q.id}" data-idx="${idx}" data-type="single">
            <div class="key">${letterFor(idx)}</div>
            <div class="text">${esc(opt)}</div>
            <div class="mark">●</div>
          </div>
        `).join('')}
      </div>`;
    } else if (type === 'multi') {
      body = `<div class="options">
        ${(q.options || []).map((opt, idx) => `
          <div class="opt" data-qid="${q.id}" data-idx="${idx}" data-type="multi">
            <div class="key">${letterFor(idx)}</div>
            <div class="text">${esc(opt)}</div>
            <div class="mark">✓</div>
          </div>
        `).join('')}
      </div>`;
    } else {
      body = `<div class="open-block" data-open-qid="${q.id}">
        <div class="open-hint">
          ✍️ Напишите ответ своими словами. Можно приложить файл с решением
          (фото, PDF, документ). Учитель проверит вручную.
        </div>
        <textarea class="open-textarea" data-open-text="${q.id}"
                  placeholder="Ваш ответ..."></textarea>
        <label class="open-file-zone" data-open-drop="${q.id}">
          <input type="file" data-open-file="${q.id}" hidden
                 accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.rtf,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg">
          <div class="icon">📎</div>
          <div class="label">Прикрепить файл</div>
          <div class="sub">PDF, DOCX, PPTX, изображения · до 20 МБ</div>
        </label>
        <div data-open-preview="${q.id}"></div>
      </div>`;
    }

    return `
      <div class="question-card" data-q="${q.id}">
        <div class="q-num-badge">Вопрос ${i + 1} из ${questions.length}${hint}</div>
        <div class="q-text">${esc(q.text)}</div>
        ${body}
      </div>
    `;
  }).join('');

  wireOptions();
  wireOpenQuestions();
  $('#tt-footer').style.display = '';
}

function wireOptions() {
  $$('.opt').forEach(opt => {
    opt.addEventListener('click', () => {
      if (submitted) return;
      const qid = Number(opt.dataset.qid);
      const idx = Number(opt.dataset.idx);
      const type = opt.dataset.type;

      if (type === 'single') {
        $$(`.opt[data-qid="${qid}"]`).forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        answers[qid] = { value: idx };
      } else {
        const current = answers[qid]?.value || [];
        const set = new Set(current);
        if (set.has(idx)) set.delete(idx);
        else set.add(idx);
        const arr = [...set].sort((a,b)=>a-b);
        answers[qid] = { value: arr };
        opt.classList.toggle('selected', set.has(idx));
      }
      updateProgress();
    });
  });
}

function wireOpenQuestions() {
  $$('[data-open-text]').forEach(ta => {
    ta.addEventListener('input', () => {
      const qid = Number(ta.dataset.openText);
      if (!answers[qid]) answers[qid] = {};
      answers[qid].text = ta.value;
      updateProgress();
    });
  });

  $$('[data-open-file]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.files[0]) uploadAnswerFile(Number(input.dataset.openFile), input.files[0]);
    });
  });

  $$('[data-open-drop]').forEach(zone => {
    const qid = Number(zone.dataset.openDrop);
    ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.remove('dragover');
    }));
    zone.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) uploadAnswerFile(qid, f);
    });
  });
}

async function uploadAnswerFile(qid, file) {
  if (file.size > 20 * 1024 * 1024) {
    return toast('Файл больше 20 МБ', 'error');
  }
  const preview = $(`[data-open-preview="${qid}"]`);
  preview.innerHTML = `<div class="file-attached">
    <div class="fi">⏳</div>
    <div class="fn">Загрузка…</div>
  </div>`;

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/my/upload-answer', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Ошибка загрузки');

    if (!answers[qid]) answers[qid] = {};
    answers[qid].file = json.file_path;
    answers[qid].file_name = json.file_name;
    answers[qid].file_size = json.file_size;

    preview.innerHTML = `<div class="file-attached">
      <div class="fi">${fileIcon(json.file_name)}</div>
      <div style="flex:1;overflow:hidden">
        <div class="fn">${esc(json.file_name)}</div>
        <div class="fs">${formatSize(json.file_size)}</div>
      </div>
      <div class="fx" title="Убрать">✕</div>
    </div>`;
    preview.querySelector('.fx').onclick = () => {
      delete answers[qid].file;
      delete answers[qid].file_name;
      delete answers[qid].file_size;
      preview.innerHTML = '';
      updateProgress();
    };
    toast('Файл прикреплён', 'success');
    updateProgress();
  } catch (e) {
    preview.innerHTML = '';
    toast(e.message, 'error');
  }
}

function updateProgress() {
  const total = questions.length;
  let answered = 0;
  for (const q of questions) {
    const a = answers[q.id];
    if (!a) continue;
    const type = q.type || 'single';
    if (type === 'open') {
      if ((a.text && a.text.trim()) || a.file) answered++;
    } else {
      if (type === 'single') {
        if (typeof a.value === 'number') answered++;
      } else {
        if (Array.isArray(a.value) && a.value.length > 0) answered++;
      }
    }
  }
  const pct = total ? (answered / total) * 100 : 0;
  $('#tt-progress').style.width = pct + '%';
  $('#tt-counter').textContent = `Отвечено: ${answered} из ${total}`;
  $('#answered-info').textContent = answered === total
    ? '✓ Все вопросы отвечены'
    : `Осталось: ${total - answered}`;
  const btn = $('#finish-btn');
  btn.disabled = answered < total;
  btn.style.opacity = answered < total ? '.5' : '1';
}

// ─── Отправка ───
$('#finish-btn').addEventListener('click', async () => {
  if (submitted) return;

  const payload = {};
  for (const q of questions) {
    const a = answers[q.id];
    const type = q.type || 'single';
    if (!a) {
      return toast('Ответьте на все вопросы', 'error');
    }
    if (type === 'open') {
      payload[q.id] = {
        text: (a.text || '').trim(),
        file: a.file || null,
        file_name: a.file_name || null
      };
    } else {
      payload[q.id] = { value: a.value };
    }
  }

  await doSubmit(payload, false);
});

async function doSubmit(payload, isAuto) {
  submitted = true;

  // ⏹ Останавливаем таймер
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const btn = $('#finish-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = isAuto ? 'Время вышло — отправка…' : 'Отправка…';
  }

  const durationSec = Math.round((Date.now() - startedAt) / 1000);

  try {
    const result = await api('/my/tests/' + topicId + '/submit', {
      method: 'POST',
      body: { answers: payload, duration_sec: durationSec }
    });

    if (result.attempt.status === 'pending_review') {
      showPendingScreen(result);
    } else {
      showResult(result);
    }
  } catch (e) {
    submitted = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Завершить тест';
    }
    toast(e.message, 'error');
  }
}

function showPendingScreen() {
  window.Cheatsheet?.hide();
  if (timerPanel) timerPanel.style.display = 'none';

  $('#progress-block').style.display = 'none';
  $('#tt-footer').style.display = 'none';

  $('#content').innerHTML = `
    <div class="pending-wrap">
      <div class="hourglass">⏳</div>
      <h2 class="pending-title">Работа отправлена на проверку</h2>
      <p class="pending-sub">
        В тесте есть развёрнутые вопросы, которые проверяет учитель вручную.
        Результат появится в вашей истории, как только он поставит оценку.
      </p>
      <div class="pending-note">
        🔔 Учитель уже получил уведомление
      </div>
      <div class="result-actions" style="margin-bottom:0">
        <a href="dashboard-student.html" class="btn btn-accent">К моим темам</a>
        <a href="dashboard-student.html" class="btn btn-ghost">История попыток</a>
      </div>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showResult(result) {
  window.Cheatsheet?.hide();
  if (timerPanel) timerPanel.style.display = 'none';

  const pct = result.attempt.percent;
  const correctCount = result.attempt.score;
  const wrongCount = result.attempt.total - correctCount;
  const duration = result.attempt.duration_sec;

  let emoji, title, verdictCls, verdictText, ringColor1, ringColor2;
  if (pct >= 90) {
    emoji = '🏆'; title = 'Превосходно!';
    verdictCls = 'excellent'; verdictText = 'Отличное знание темы';
    ringColor1 = '#00d4b8'; ringColor2 = '#48e0c6';
  } else if (pct >= 75) {
    emoji = '🎉'; title = 'Отличный результат!';
    verdictCls = 'excellent'; verdictText = 'Тема усвоена хорошо';
    ringColor1 = '#00d4b8'; ringColor2 = '#6a4cff';
  } else if (pct >= 50) {
    emoji = '👍'; title = 'Неплохо!';
    verdictCls = 'good'; verdictText = 'База есть, но стоит повторить';
    ringColor1 = '#6a4cff'; ringColor2 = '#a678ff';
  } else if (pct >= 30) {
    emoji = '📖'; title = 'Есть над чем поработать';
    verdictCls = 'weak'; verdictText = 'Повторите материалы темы';
    ringColor1 = '#e0435c'; ringColor2 = '#ff7a8e';
  } else {
    emoji = '💪'; title = 'Стоит повторить материал';
    verdictCls = 'weak'; verdictText = 'Перечитайте конспект и попробуйте снова';
    ringColor1 = '#e0435c'; ringColor2 = '#ff7a8e';
  }

  $('#progress-block').style.display = 'none';
  $('#tt-footer').style.display = 'none';

  $('#content').innerHTML = `
    <div class="result-wrap">
      <span class="result-emoji">${emoji}</span>
      <h2 class="result-title">${title}</h2>

      <div class="chart-wrap">
        <div class="donut">
          <svg viewBox="0 0 220 220">
            <defs>
              <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${ringColor1}"/>
                <stop offset="100%" stop-color="${ringColor2}"/>
              </linearGradient>
            </defs>
            <circle class="donut-bg" cx="110" cy="110" r="90" stroke-width="16"/>
            <circle class="donut-fg" id="donut-fg" cx="110" cy="110" r="90"
                    stroke="url(#donutGrad)" stroke-width="16"
                    style="stroke-dasharray: 0 999;"/>
          </svg>
          <div class="donut-center">
            <div class="donut-pct" id="donut-pct">0%</div>
            <div class="donut-sub">результат</div>
          </div>
        </div>

        <div class="stats-row">
          <div class="stat-chip correct">
            <div class="ic">✓</div>
            <div><div class="num">${correctCount}</div><div class="lbl">верно</div></div>
          </div>
          <div class="stat-chip wrong">
            <div class="ic">✕</div>
            <div><div class="num">${wrongCount}</div><div class="lbl">ошибок</div></div>
          </div>
          <div class="stat-chip total">
            <div class="ic">∑</div>
            <div><div class="num">${result.attempt.total}</div><div class="lbl">всего</div></div>
          </div>
          <div class="stat-chip total">
            <div class="ic">⏱</div>
            <div><div class="num" style="font-size:15px">${formatDuration(duration)}</div><div class="lbl">время</div></div>
          </div>
        </div>

        <div class="verdict ${verdictCls}">${verdictText}</div>
      </div>

      <div class="result-actions">
        <a href="take-test.html?id=${topicId}" class="btn btn-accent">🔄 Пройти заново</a>
        <a href="dashboard-student.html" class="btn btn-ghost">К моим темам</a>
      </div>

      <h3 class="detail-heading">📋 Разбор ответов</h3>
      <div class="detail-list">
        ${result.detail.map((d, i) => renderDetailItem(d, i)).join('')}
      </div>
    </div>
  `;

  const r = 90;
  const circumference = 2 * Math.PI * r;
  setTimeout(() => {
    const ring = document.getElementById('donut-fg');
    if (!ring) return;
    const dash = circumference * (pct / 100);
    ring.style.transition = 'none';
    ring.style.strokeDasharray = `0 ${circumference}`;
    void ring.getBoundingClientRect();
    ring.style.transition = 'stroke-dasharray 1.4s cubic-bezier(.2,.8,.3,1)';
    requestAnimationFrame(() => {
      ring.style.strokeDasharray = `${dash} ${circumference}`;
    });
  }, 50);
  setTimeout(() => {
    animateNumber(document.getElementById('donut-pct'), 0, pct, 1400, '%');
  }, 100);

  if (pct >= 75) launchConfetti();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderDetailItem(d, i) {
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
      <div class="detail-item ${cls}">
        <div class="detail-q">
          <span>${icon}</span>
          <span>${i + 1}. ${esc(d.text)} <span class="q-type-hint open">✍️</span></span>
        </div>
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
            <span class="val ${grade === 'correct' ? 'ok' : grade === 'wrong' ? 'bad' : ''}">
              ${gradeText}
            </span>
          </div>
        </div>
        ${d.comment ? `<div class="teacher-comment">
          <div class="tc-head">💬 Комментарий учителя</div>
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

  return `
    <div class="detail-item ${ok ? 'correct' : 'wrong'}">
      <div class="detail-q">
        <span>${ok ? '✅' : '❌'}</span>
        <span>${i + 1}. ${esc(d.text)}
          <span class="q-type-hint ${d.type}">
            ${d.type === 'multi' ? '☑️ несколько' : '🔘 один'}
          </span>
        </span>
      </div>
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

function animateNumber(el, from, to, duration, suffix = '') {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function launchConfetti() {
  const colors = ['#6a4cff', '#00d4b8', '#ff7ac6', '#ffb84d', '#48e0c6', '#a678ff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (2 + Math.random() * 2) + 's';
    c.style.animationDelay = (Math.random() * 0.5) + 's';
    c.style.width = (6 + Math.random() * 8) + 'px';
    c.style.height = (8 + Math.random() * 10) + 'px';
    c.style.borderRadius = Math.random() < 0.5 ? '2px' : '50%';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

(async function boot() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'student') {
      location.href = 'tutor-login.html';
      return;
    }
    loadTest();
  } catch (e) {}
})();