/* public/js/topic.js */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const params = new URLSearchParams(location.search);
const topicId = Number(params.get('id'));
if (!topicId) location.href = 'dashboard-tutor.html';

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

$('#menu-btn')?.addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#backdrop').classList.toggle('show');
});
$('#backdrop')?.addEventListener('click', () => {
  $('#sidebar').classList.remove('open');
  $('#backdrop').classList.remove('show');
});

$('#logout')?.addEventListener('click', async () => {
  await api('/logout', { method: 'POST' }).catch(() => {});
  location.href = 'index.html';
});

// ⭐ Классы
const GRADES = {
  junior: { full: 'Младшая группа', cls: 'g-junior' },
  '8':    { full: '8 класс', cls: 'g-8' },
  '9':    { full: '9 класс', cls: 'g-9' },
  '10':   { full: '10 класс', cls: 'g-10' },
  '11':   { full: '11 класс', cls: 'g-11' },
  adult:  { full: 'Старшие', cls: 'g-adult' }
};
function gradeBadge(id) {
  if (!id || !GRADES[id]) return '';
  return `<span class="grade-badge ${GRADES[id].cls}">${esc(GRADES[id].full)}</span>`;
}

function fileTypeIco(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  return 'file-text';
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(2) + ' МБ';
}
function letterFor(idx) {
  return String.fromCharCode(65 + idx);
}

let topic = null;
let materials = [];
let test = null;
let questions = [];
let editingMaterial = null;
let currentMatTab = 'text';
let selectedFile = null;

let currentQType = 'single';
let qOptions = ['', '', '', ''];
let qCorrect = [];
let editingQuestion = null;

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

async function loadAll() {
  try {
    const t = await api('/topics/' + topicId);
    topic = t.topic;
    $('#topic-title').textContent = topic.title;
    $('#topic-desc').textContent = topic.description || 'Без описания';

    if (topic.is_welcome === 1) {
      $('#topic-grade-wrap').innerHTML = `<span class="grade-badge" style="background:linear-gradient(135deg,rgba(255,170,0,.16),rgba(255,170,0,.05));color:#c47f00">${ico('star','ico-sm')} Вводная — видна всем</span>`;
      $('#dup-topic-btn').style.display = 'none';
    } else if (topic.grade) {
      $('#topic-grade-wrap').innerHTML = gradeBadge(topic.grade);
      $('#dup-topic-btn').style.display = '';
    } else {
      $('#topic-grade-wrap').innerHTML = '';
      $('#dup-topic-btn').style.display = 'none';
    }

    const m = await api('/topics/' + topicId + '/materials');
    materials = m.materials;

    const q = await api('/topics/' + topicId + '/test');
    test = q.test;
    questions = q.questions || [];

    renderMaterials();
    renderTestBlock();
    handleHashHighlight();
  } catch (e) {
    toast(e.message, 'error');
    setTimeout(() => location.href = 'dashboard-tutor.html', 1500);
  }
}

// ═══ КОПИРОВАНИЕ ТЕМЫ ═══

$('#dup-topic-btn')?.addEventListener('click', () => {
  if (!topic) return;
  $('#dup-source-info').textContent = `Из темы: «${topic.title}»`;
  $('#dup-title').value = `${topic.title} — копия`;
  $('#dup-grade').value = '';
  openModal('modal-duplicate');
  setTimeout(() => $('#dup-title').focus(), 100);
});

$('#do-duplicate')?.addEventListener('click', async () => {
  const title = $('#dup-title').value.trim();
  const grade = $('#dup-grade').value;
  if (!title) return toast('Введите название', 'error');
  if (!grade) return toast('Выберите класс', 'error');

  const btn = $('#do-duplicate');
  btn.disabled = true;
  btn.textContent = 'Копируем…';

  try {
    const { topic: newTopic } = await api('/topics/' + topicId + '/duplicate', {
      method: 'POST',
      body: { title, grade }
    });
    toast('Тема скопирована', 'success');
    closeModal('modal-duplicate');
    setTimeout(() => {
      if (confirm('Открыть копию?')) {
        location.href = 'topic.html?id=' + newTopic.id;
      }
    }, 300);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${ico('copy','ico ico-sm')} Скопировать`;
  }
});

// ═══ МАТЕРИАЛЫ ═══

function renderMaterials() {
  $('#cnt-materials').textContent = materials.length;
  const v = $('#materials-wrap');
  if (!materials.length) {
    v.innerHTML = `<div class="empty" style="padding:30px 20px">
      <span class="empty-icon" style="font-size:48px">${ico('file-text','ico-lg')}</span>
      <h3 style="font-size:18px">Материалов пока нет</h3>
      <p style="margin-bottom:14px">Добавьте ссылки, конспекты или файлы, чтобы ученики видели их</p>
    </div>`;
    return;
  }

  v.innerHTML = `<div class="mat-list">${materials.map(m => {
    const isFile = !!m.file_path;
    const icon = isFile ? fileTypeIco(m.file_name || '') : (m.type === 'link' ? 'link' : 'file-text');
    let body;
    if (isFile) {
      const size = m.file_size ? formatSize(m.file_size) : '';
      body = `<a href="${esc(m.content)}" download="${esc(m.file_name || '')}">${ico('download','ico-sm')} Скачать ${esc(m.file_name || 'файл')}</a>${size ? ` <span class="muted">· ${size}</span>` : ''}`;
    } else if (m.type === 'link') {
      body = `<a href="${esc(m.content)}" target="_blank" rel="noopener">${esc(m.content)}</a>`;
    } else {
      body = esc(m.content);
    }
    return `
      <div class="mat-item">
        <div class="type-icon">${ico(icon,'ico')}</div>
        <div class="body">
          <div class="title">${esc(m.title)}</div>
          <div class="content">${body}</div>
        </div>
        <div class="actions">
          <button class="icon-btn" data-edit-mat="${m.id}" title="Изменить">${ico('pencil','ico-sm')}</button>
          <button class="icon-btn danger" data-del-mat="${m.id}" title="Удалить">${ico('trash','ico-sm')}</button>
        </div>
      </div>`;
  }).join('')}</div>`;

  $$('[data-edit-mat]', v).forEach(b => {
    const m = materials.find(x => x.id === Number(b.dataset.editMat));
    b.onclick = () => openMaterialModal(m);
  });
  $$('[data-del-mat]', v).forEach(b => {
    b.onclick = () => {
      const m = materials.find(x => x.id === Number(b.dataset.delMat));
      askConfirm('Удалить материал?', `«${m.title}» будет удалён.`, async () => {
        try {
          await api('/materials/' + m.id, { method: 'DELETE' });
          toast('Материал удалён', 'success');
          loadAll();
        } catch (e) { toast(e.message, 'error'); }
      });
    };
  });
}

$$('[data-mat-tab]').forEach(t => t.addEventListener('click', () => {
  $$('[data-mat-tab]').forEach(x => x.classList.toggle('active', x === t));
  currentMatTab = t.dataset.matTab;
  ['text', 'link', 'file'].forEach(p => {
    $(`[data-mat-pane="${p}"]`).style.display = (p === currentMatTab) ? '' : 'none';
  });
}));

const fileDrop = $('#file-drop');
const fileInput = $('#mat-file');
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) setSelectedFile(fileInput.files[0]);
});
['dragenter','dragover'].forEach(ev => fileDrop.addEventListener(ev, e => {
  e.preventDefault();
  fileDrop.classList.add('dragover');
}));
['dragleave','drop'].forEach(ev => fileDrop.addEventListener(ev, e => {
  e.preventDefault();
  fileDrop.classList.remove('dragover');
}));
fileDrop.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f) setSelectedFile(f);
});

function setSelectedFile(file) {
  selectedFile = file;
  const preview = $('#file-preview');
  preview.style.display = '';
  preview.innerHTML = `<div class="file-chip">
    <div class="fc-icon">${ico(fileTypeIco(file.name),'ico')}</div>
    <div class="fc-info">
      <div class="fc-name">${esc(file.name)}</div>
      <div class="fc-size">${formatSize(file.size)}</div>
    </div>
    <button class="icon-btn danger" id="clear-file" title="Убрать">${ico('x','ico-sm')}</button>
  </div>`;
  $('#clear-file').onclick = (e) => {
    e.preventDefault();
    selectedFile = null;
    fileInput.value = '';
    preview.style.display = 'none';
    preview.innerHTML = '';
  };
  if (!$('#mat-title').value.trim()) {
    $('#mat-title').value = file.name.replace(/\.[^.]+$/, '');
  }
}

function openMaterialModal(m) {
  editingMaterial = m || null;
  selectedFile = null;
  fileInput.value = '';
  $('#file-preview').style.display = 'none';
  $('#file-preview').innerHTML = '';
  $('#mat-modal-title').innerHTML = m
    ? `${ico('pencil','ico ico-lg')} Изменить материал`
    : `${ico('file-text','ico ico-lg')} Новый материал`;
  $('#mat-title').value = m?.title || '';

  if (m?.file_path) currentMatTab = 'file';
  else if (m?.type === 'link') currentMatTab = 'link';
  else currentMatTab = 'text';

  $$('[data-mat-tab]').forEach(x =>
    x.classList.toggle('active', x.dataset.matTab === currentMatTab)
  );
  ['text', 'link', 'file'].forEach(p => {
    $(`[data-mat-pane="${p}"]`).style.display = (p === currentMatTab) ? '' : 'none';
  });

  $('#mat-text').value = (m && !m.file_path && m.type === 'text') ? m.content : '';
  $('#mat-link').value = (m && !m.file_path && m.type === 'link') ? m.content : '';

  openModal('modal-material');
  setTimeout(() => $('#mat-title').focus(), 100);
}

$('#add-material').addEventListener('click', () => openMaterialModal(null));

$('#save-material').addEventListener('click', async () => {
  const title = $('#mat-title').value.trim();
  if (!title) return toast('Введите название', 'error');

  try {
    if (currentMatTab === 'file') {
      if (!selectedFile) return toast('Выберите файл', 'error');
      const formData = new FormData();
      formData.append('title', title);
      formData.append('file', selectedFile);
      const res = await fetch(`/api/topics/${topicId}/upload`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Ошибка загрузки');
      toast('Файл загружен', 'success');
    } else {
      const content = currentMatTab === 'text'
        ? $('#mat-text').value.trim()
        : $('#mat-link').value.trim();
      if (!content) return toast('Заполните содержимое', 'error');
      if (editingMaterial && !editingMaterial.file_path) {
        await api('/materials/' + editingMaterial.id, {
          method: 'PATCH',
          body: { title, type: currentMatTab, content }
        });
        toast('Материал обновлён', 'success');
      } else {
        await api('/topics/' + topicId + '/materials', {
          method: 'POST',
          body: { title, type: currentMatTab, content }
        });
        toast('Материал добавлен', 'success');
      }
    }
    closeModal('modal-material');
    loadAll();
  } catch (e) { toast(e.message, 'error'); }
});

// ═══ ТЕСТ ═══

function renderTestBlock() {
  const head = $('#test-action');
  const wrap = $('#questions-wrap');

  if (!test) {
    $('#cnt-questions').textContent = '0';
    head.innerHTML = '';
    wrap.innerHTML = `
      <div class="empty-test-block">
        <span class="icon">${ico('flask','ico-xl')}</span>
        <h3>Тест по теме пока не создан</h3>
        <p>Когда будете готовы — создайте тест и добавьте в него вопросы.
           Ученики увидят его сразу после публикации.</p>
        <button class="btn btn-primary btn-create-test" id="btn-create-test">
          ${ico('plus','ico ico-sm')} Создать тест по теме
        </button>
      </div>
    `;
    $('#btn-create-test').onclick = createTest;
    return;
  }

  $('#cnt-questions').textContent = questions.length;

  const isDraft = test.is_draft === 1 || test.is_draft === true;

  head.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${isDraft
        ? `<span class="draft-chip" title="Тест ещё не виден ученикам">${ico('pencil','ico-sm')} Черновик</span>
           <button class="btn btn-ghost" id="publish-test">${ico('check','ico-sm')} Опубликовать</button>`
        : `<span class="published-chip" title="Ученики видят этот тест">${ico('globe','ico-sm')} Опубликован</span>
           <button class="btn btn-ghost" id="unpublish-test" title="Скрыть от учеников">${ico('download','ico-sm')} Вернуть в черновики</button>`
      }
      <button class="btn btn-ghost" id="open-settings" title="Настройки теста">${ico('settings','ico-sm')} Настройки</button>
      <button class="btn btn-primary" id="add-question">${ico('plus','ico-sm')} Добавить вопрос</button>
    </div>
  `;

  $('#add-question').onclick = () => openQuestionModal(null);
  $('#open-settings').onclick = openSettingsModal;

  if (isDraft) {
    const btn = $('#publish-test');
    if (btn) btn.onclick = () => togglePublish(false);
  } else {
    const btn = $('#unpublish-test');
    if (btn) btn.onclick = () => togglePublish(true);
  }

  renderQuestions();
}

async function createTest() {
  try {
    const btn = $('#btn-create-test');
    if (btn) { btn.disabled = true; btn.textContent = 'Создаём…'; }

    const data = await api('/topics/' + topicId + '/test', { method: 'POST' });
    test = data.test;
    questions = data.questions || [];
    toast('Тест создан — теперь добавьте вопросы', 'success');
    renderTestBlock();
  } catch (e) {
    toast(e.message, 'error');
    const btn = $('#btn-create-test');
    if (btn) { btn.disabled = false; btn.innerHTML = `${ico('plus','ico ico-sm')} Создать тест по теме`; }
  }
}

async function togglePublish(makeDraft) {
  try {
    await api('/topics/' + topicId + '/test', {
      method: 'PATCH',
      body: { is_draft: makeDraft ? 1 : 0 }
    });
    toast(makeDraft ? 'Тест скрыт от учеников' : 'Тест опубликован', 'success');
    loadAll();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══ НАСТРОЙКИ ТЕСТА ═══

function openSettingsModal() {
  if (!test) return;

  const timerOn = test.timer_min && test.timer_min > 0;
  $('#timer-off').checked = !timerOn;
  $('#timer-on').checked = timerOn;
  $('#timer-input').value = timerOn ? test.timer_min : '';
  $('#timer-input').disabled = !timerOn;

  const max = test.max_attempts;
  const radios = document.querySelectorAll('input[name="attempts-mode"]');
  radios.forEach(r => r.checked = false);

  if (!max) {
    $('#attempts-inf').checked = true;
    $('#attempts-input').disabled = true;
    $('#attempts-input').value = '';
  } else if (max === 1) {
    const r1 = document.querySelector('input[name="attempts-mode"][value="1"]');
    if (r1) r1.checked = true;
    $('#attempts-input').disabled = true;
    $('#attempts-input').value = '';
  } else {
    $('#attempts-n').checked = true;
    $('#attempts-input').disabled = false;
    $('#attempts-input').value = max;
  }

  openModal('modal-test-settings');
}

document.querySelectorAll('input[name="timer-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    const on = document.querySelector('input[name="timer-mode"][value="on"]').checked;
    $('#timer-input').disabled = !on;
    if (on) setTimeout(() => $('#timer-input').focus(), 50);
  });
});

document.querySelectorAll('input[name="attempts-mode"]').forEach(r => {
  r.addEventListener('change', () => {
    const nMode = $('#attempts-n').checked;
    $('#attempts-input').disabled = !nMode;
    if (nMode) setTimeout(() => $('#attempts-input').focus(), 50);
  });
});

$('#save-test-settings')?.addEventListener('click', async () => {
  const timerOn = document.querySelector('input[name="timer-mode"][value="on"]').checked;
  let timer_min = null;
  if (timerOn) {
    const v = Number($('#timer-input').value);
    if (!Number.isFinite(v) || v < 1) return toast('Укажите минуты (минимум 1)', 'error');
    timer_min = Math.round(v);
  }

  let max_attempts = null;
  if ($('#attempts-n').checked) {
    const v = Number($('#attempts-input').value);
    if (!Number.isFinite(v) || v < 1) return toast('Укажите число попыток', 'error');
    max_attempts = Math.round(v);
  } else if (document.querySelector('input[name="attempts-mode"][value="1"]').checked) {
    max_attempts = 1;
  } else {
    max_attempts = null;
  }

  try {
    await api('/topics/' + topicId + '/test', {
      method: 'PATCH',
      body: { timer_min, max_attempts }
    });
    toast('Настройки сохранены', 'success');
    closeModal('modal-test-settings');
    loadAll();
  } catch (e) {
    toast(e.message, 'error');
  }
});

// ═══ ВОПРОСЫ ═══

function renderQuestions() {
  const v = $('#questions-wrap');
  if (!questions.length) {
    v.innerHTML = `<div class="empty" style="padding:30px 20px">
      <span class="empty-icon" style="font-size:48px">${ico('help','ico-lg')}</span>
      <h3 style="font-size:18px">Вопросов пока нет</h3>
      <p style="margin-bottom:14px">Добавьте первый вопрос — ученики смогут пройти тест</p>
      <button class="btn btn-primary" id="empty-add-question">${ico('plus','ico-sm')} Добавить вопрос</button>
    </div>`;
    $('#empty-add-question').onclick = () => openQuestionModal(null);
    return;
  }

  v.innerHTML = `<div class="q-list">${questions.map((q, i) => {
    const type = q.type || 'single';
    let typeBadge = '';
    let body = '';

    if (type === 'single') {
      typeBadge = `<span class="q-type-badge single">${ico('circle-dot','ico-sm')} Один</span>`;
      const opts = q.options || [];
      const correctSet = new Set(q.correct || []);
      body = `<div class="q-options">
        ${opts.map((o, idx) => `
          <div class="q-opt ${correctSet.has(idx) ? 'correct' : ''}">
            <span class="key">${letterFor(idx)}</span>
            <span>${esc(o)}</span>
          </div>
        `).join('')}
      </div>`;
    } else if (type === 'multi') {
      typeBadge = `<span class="q-type-badge multi">${ico('check-square','ico-sm')} Несколько</span>`;
      const opts = q.options || [];
      const correctSet = new Set(q.correct || []);
      body = `<div class="q-options">
        ${opts.map((o, idx) => `
          <div class="q-opt ${correctSet.has(idx) ? 'correct' : ''}">
            <span class="key">${letterFor(idx)}</span>
            <span>${esc(o)}</span>
          </div>
        `).join('')}
      </div>`;
    } else {
      typeBadge = `<span class="q-type-badge open">${ico('pen','ico-sm')} Развёрнутый</span>`;
      const ct = q.correct_text ? esc(q.correct_text) : '<i>Эталонный ответ не задан</i>';
      body = `<div class="q-open-answer">
        <b>${ico('paperclip','ico-sm')} Эталонный ответ:</b><br>${ct}
      </div>`;
    }

    return `
      <div class="q-item" id="q-${q.id}" data-q-id="${q.id}">
        <div class="q-head">
          <div class="q-num">${i + 1}</div>
          <div class="q-text">
            ${typeBadge}<br style="line-height:1.8">
            ${esc(q.text)}
          </div>
          <div class="actions" style="display:flex;gap:4px">
            <button class="icon-btn" data-edit-q="${q.id}" title="Редактировать">${ico('pencil','ico-sm')}</button>
            <button class="icon-btn danger" data-del-q="${q.id}" title="Удалить">${ico('trash','ico-sm')}</button>
          </div>
        </div>
        ${body}
      </div>
    `;
  }).join('')}</div>`;

  $$('[data-edit-q]', v).forEach(b => {
    b.onclick = () => {
      const q = questions.find(x => x.id === Number(b.dataset.editQ));
      openQuestionModal(q);
    };
  });

  $$('[data-del-q]', v).forEach(b => {
    b.onclick = () => {
      const q = questions.find(x => x.id === Number(b.dataset.delQ));
      askConfirm('Удалить вопрос?', 'Вопрос будет удалён из теста.', async () => {
        try {
          await api('/questions/' + q.id, { method: 'DELETE' });
          toast('Вопрос удалён', 'success');
          loadAll();
        } catch (e) { toast(e.message, 'error'); }
      });
    };
  });
}

$$('[data-qtype]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    const type = btn.dataset.qtype;
    setQuestionType(type);
  });
});

function setQuestionType(type) {
  currentQType = type;
  $$('[data-qtype]').forEach(b => {
    const isActive = b.dataset.qtype === type;
    b.classList.toggle('active', isActive);
    b.classList.toggle('accent', isActive && type === 'multi');
    b.classList.toggle('warn',   isActive && type === 'open');
  });
  ['single', 'multi', 'open'].forEach(p => {
    $(`[data-qpane="${p}"]`).style.display = (p === type) ? '' : 'none';
  });
  if (type === 'single') {
    if (qOptions.length !== 4) qOptions = ['', '', '', ''];
    if (qCorrect.length > 1) qCorrect = qCorrect.slice(0, 1);
    renderSingleOptions();
  } else if (type === 'multi') {
    if (qOptions.length < 4) {
      while (qOptions.length < 4) qOptions.push('');
    }
    renderMultiOptions();
  }
}

function renderSingleOptions() {
  const wrap = $('#single-options');
  wrap.innerHTML = qOptions.map((val, idx) => `
    <div class="opt-row ${qCorrect.includes(idx) ? 'is-correct' : ''}" data-idx="${idx}">
      <div class="opt-letter">${letterFor(idx)}</div>
      <input class="input" data-opt-input="${idx}" value="${esc(val)}" placeholder="Вариант ${letterFor(idx)}">
      <button class="mark-correct" data-mark="${idx}" title="Отметить правильным">${qCorrect.includes(idx) ? ico('check','ico-sm') : ico('circle-dot','ico-sm')}</button>
    </div>
  `).join('');

  $$('[data-opt-input]', wrap).forEach(inp => {
    inp.addEventListener('input', () => {
      qOptions[Number(inp.dataset.optInput)] = inp.value;
    });
  });
  $$('[data-mark]', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.mark);
      qCorrect = [idx];
      renderSingleOptions();
    });
  });
}

function renderMultiOptions() {
  const wrap = $('#multi-options');
  wrap.innerHTML = qOptions.map((val, idx) => `
    <div class="opt-row ${qCorrect.includes(idx) ? 'is-correct' : ''}" data-idx="${idx}">
      <div class="opt-letter">${letterFor(idx)}</div>
      <input class="input" data-opt-input="${idx}" value="${esc(val)}" placeholder="Вариант ${letterFor(idx)}">
      <button class="mark-correct" data-mark="${idx}" title="Отметить правильным">${qCorrect.includes(idx) ? ico('check','ico-sm') : ico('circle-dot','ico-sm')}</button>
      ${qOptions.length > 4 ? `<button class="del-opt" data-del-opt="${idx}" title="Удалить">${ico('x','ico-sm')}</button>` : ''}
    </div>
  `).join('');

  $$('[data-opt-input]', wrap).forEach(inp => {
    inp.addEventListener('input', () => {
      qOptions[Number(inp.dataset.optInput)] = inp.value;
    });
  });
  $$('[data-mark]', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.mark);
      if (qCorrect.includes(idx)) {
        qCorrect = qCorrect.filter(i => i !== idx);
      } else {
        if (qCorrect.length >= qOptions.length - 1) {
          return toast('Нельзя отметить все варианты правильными', 'error');
        }
        qCorrect.push(idx);
      }
      renderMultiOptions();
    });
  });
  $$('[data-del-opt]', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.delOpt);
      if (qOptions.length <= 4) return;
      qOptions.splice(idx, 1);
      qCorrect = qCorrect
        .filter(i => i !== idx)
        .map(i => i > idx ? i - 1 : i);
      renderMultiOptions();
    });
  });

  const addBtn = $('#add-multi-opt');
  if (addBtn) {
    addBtn.disabled = qOptions.length >= 9;
    addBtn.style.opacity = qOptions.length >= 9 ? '.4' : '1';
  }
}

$('#add-multi-opt')?.addEventListener('click', () => {
  if (qOptions.length >= 9) return toast('Максимум 9 вариантов', 'error');
  qOptions.push('');
  renderMultiOptions();
});

function openQuestionModal(existing) {
  editingQuestion = existing || null;

  if (existing) {
    $('#q-modal-title').innerHTML = `${ico('pencil','ico ico-lg')} Редактирование вопроса`;
    $('#q-text').value = existing.text || '';
    $('#q-correct-text').value = existing.correct_text || '';

    const type = existing.type || 'single';
    if (type === 'open') {
      qOptions = ['', '', '', ''];
      qCorrect = [];
    } else {
      qOptions = (existing.options || []).slice();
      while (qOptions.length < 4) qOptions.push('');
      qCorrect = (existing.correct || []).slice();
    }
    setQuestionType(type);
  } else {
    $('#q-modal-title').innerHTML = `${ico('help','ico ico-lg')} Новый вопрос`;
    $('#q-text').value = '';
    $('#q-correct-text').value = '';
    qOptions = ['', '', '', ''];
    qCorrect = [];
    setQuestionType('single');
  }

  openModal('modal-question');
  setTimeout(() => $('#q-text').focus(), 100);
}

$('#save-question').addEventListener('click', async () => {
  const text = $('#q-text').value.trim();
  if (!text) return toast('Введите текст вопроса', 'error');

  let payload;
  if (currentQType === 'single') {
    if (qOptions.some(o => !o.trim())) return toast('Заполните все 4 варианта', 'error');
    if (qCorrect.length !== 1) return toast('Отметьте один правильный ответ', 'error');
    payload = {
      type: 'single',
      text,
      options: qOptions.map(o => o.trim()),
      correct: qCorrect
    };
  } else if (currentQType === 'multi') {
    if (qOptions.length < 4) return toast('Минимум 4 варианта', 'error');
    if (qOptions.some(o => !o.trim())) return toast('Заполните все варианты', 'error');
    if (qCorrect.length < 2) return toast('Отметьте минимум 2 правильных', 'error');
    if (qCorrect.length >= qOptions.length) return toast('Не все варианты могут быть правильными', 'error');
    payload = {
      type: 'multi',
      text,
      options: qOptions.map(o => o.trim()),
      correct: [...qCorrect].sort((a,b)=>a-b)
    };
  } else {
    payload = {
      type: 'open',
      text,
      correct_text: $('#q-correct-text').value.trim()
    };
  }

  try {
    if (editingQuestion) {
      await api('/questions/' + editingQuestion.id, {
        method: 'PATCH',
        body: payload
      });
      toast('Вопрос обновлён', 'success');
    } else {
      await api('/topics/' + topicId + '/questions', {
        method: 'POST',
        body: payload
      });
      toast('Вопрос добавлен', 'success');
    }
    closeModal('modal-question');
    loadAll();
  } catch (e) { toast(e.message, 'error'); }
});

function handleHashHighlight() {
  const hash = location.hash;
  if (!hash || !hash.startsWith('#q-')) return;

  const qId = hash.slice(3);
  const tile = document.getElementById('q-' + qId);
  if (!tile) return;

  setTimeout(() => {
    tile.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);

  setTimeout(() => {
    tile.classList.add('highlight-question');
    setTimeout(() => tile.classList.remove('highlight-question'), 4200);
  }, 400);

  history.replaceState(null, '', location.pathname + location.search);
}

(async function boot() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'tutor') {
      location.href = 'student-login.html';
      return;
    }
    $('#me-name').textContent = user.display_name;
    window.Avatars.apply('#avatar', user, { size: 'md' });
    loadAll();
  } catch (e) {}
})();