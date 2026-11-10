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

function ico(id, cls = 'ico') {
  return `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
}

function getFileExt(name) {
  return (String(name).split('.').pop() || '').toLowerCase();
}
function isImage(name) {
  return ['png','jpg','jpeg','gif','webp','svg'].includes(getFileExt(name));
}
function isPdf(name) {
  return getFileExt(name) === 'pdf';
}
function formatSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' Б';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' КБ';
  return (b/1024/1024).toFixed(2) + ' МБ';
}

const GRADES = {
  junior: { full: 'Младшая группа', cls: 'g-junior' },
  '8':    { full: '8 класс', cls: 'g-8' },
  '9':    { full: '9 класс', cls: 'g-9' },
  '10':   { full: '10 класс', cls: 'g-10' },
  '11':   { full: '11 класс', cls: 'g-11' },
  adult:  { full: 'Старшие', cls: 'g-adult' }
};

let topicData = null;
let galleryImages = []; 
let lightboxCurrentIdx = 0;
let touchStartX = 0;

async function loadTopic() {
  try {
    const data = await api('/my/topics/' + topicId);
    topicData = data;

    const titleEl = $('#t-title');
    if (titleEl) titleEl.textContent = data.topic.title;
    
    const descEl = $('#t-desc');
    if (descEl) descEl.textContent = data.topic.description || '';

    const gradeWrap = $('#t-grade-wrap');
    if (gradeWrap) {
      if (data.topic.is_welcome === 1) {
        gradeWrap.innerHTML = `<span class="grade-badge" style="background:linear-gradient(135deg,rgba(255,170,0,.16),rgba(255,170,0,.05));color:#c47f00">${ico('star','ico-sm')} Вводная</span>`;
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

function showAccessDenied(msg) {
  const wrap = document.querySelector('.st-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <a href="dashboard-student.html" class="st-back">${ico('arrow-left','ico-sm')} Мои темы</a>
    <div style="background:var(--white);border-radius:28px;padding:56px 40px;border:1.5px solid var(--border);text-align:center;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#e0435c,#ff7a8e)"></div>
      <div style="display:grid;place-items:center;margin-bottom:16px;color:var(--danger)">${ico('lock','ico-xl')}</div>
      <h2 style="font-size:28px;font-weight:800;margin-bottom:10px">Доступ закрыт</h2>
      <p style="color:var(--gray);font-size:15px;max-width:420px;margin:0 auto 28px;line-height:1.5">
        ${esc(msg)}.<br>Обратитесь к учителю, если считаете, что это ошибка.
      </p>
      <a href="dashboard-student.html" class="btn btn-accent" style="padding:14px 32px">
        ${ico('arrow-left','ico-sm')} Вернуться к темам
      </a>
    </div>
  `;
}

function showNotFound(msg) {
  const wrap = document.querySelector('.st-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <a href="dashboard-student.html" class="st-back">${ico('arrow-left','ico-sm')} Мои темы</a>
    <div style="background:var(--white);border-radius:28px;padding:56px 40px;border:1.5px solid var(--border);text-align:center">
      <div style="display:grid;place-items:center;margin-bottom:16px;color:var(--gray)">${ico('help','ico-xl')}</div>
      <h2 style="font-size:28px;font-weight:800;margin-bottom:10px">Не найдено</h2>
      <p style="color:var(--gray);font-size:15px;max-width:420px;margin:0 auto 28px;line-height:1.5">${esc(msg)}</p>
      <a href="dashboard-student.html" class="btn btn-accent" style="padding:14px 32px">
        ${ico('arrow-left','ico-sm')} Вернуться к темам
      </a>
    </div>
  `;
}

function renderMaterials(mats) {
  const v = $('#materials');
  if (!v) return;
  galleryImages = []; 

  if (!mats.length) {
    v.innerHTML = `<div class="empty" style="padding:30px 20px">
      <span class="empty-icon" style="font-size:48px">${ico('file-text','ico-lg')}</span>
      <h3 style="font-size:18px">Материалов пока нет</h3>
      <p>Учитель ещё не добавил материалы к этой теме</p>
    </div>`;
    return;
  }

  const images = mats.filter(m => m.file_path && isImage(m.file_name || ''));
  const others = mats.filter(m => !(m.file_path && isImage(m.file_name || '')));

  images.forEach(m => {
    galleryImages.push({ src: m.content, title: m.title, name: m.file_name });
  });

  let html = '';

  if (images.length > 0) {
    html += `<div class="image-gallery-grid">`;
    images.forEach((m, idx) => {
      html += `
        <div class="gallery-item" data-img-index="${idx}">
          <img src="${m.content}" alt="${esc(m.title)}" loading="lazy">
          <div class="gallery-item-overlay">${ico('search','ico-sm')} Увеличить</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (others.length > 0) {
    html += `<div style="display:flex;flex-direction:column;gap:12px;margin-top:${images.length > 0 ? '16px' : '0'}">`;
    html += others.map(m => {
      const isFile = !!m.file_path;
      const isPdfFile = isFile && isPdf(m.file_name || '');
      const icon = isFile ? 'file-text' : (m.type === 'link' ? 'link' : 'file-text');

      let sub, body;
      if (isPdfFile) {
        sub = `${ico('file-text','ico-sm')} PDF-документ · ${formatSize(m.file_size)}`;
        body = `
          <div class="material-pdf-wrap">
            <button class="btn btn-accent material-pdf-btn" data-pdf-url="${esc(m.content)}" data-pdf-title="${esc(m.title)}">
              ${ico('file-text','ico-sm')} Открыть документ
            </button>
            <div style="font-size:12.5px;color:var(--gray);margin-top:8px">Документ откроется прямо на сайте, скачивать не нужно</div>
          </div>
        `;
      } else if (isFile) {
        sub = `${ico('download','ico-sm')} Файл · ${formatSize(m.file_size)}`;
        body = `<a href="${esc(m.content)}" download="${esc(m.file_name || '')}" target="_blank" rel="noopener" class="btn btn-ghost">
          ${ico('download','ico-sm')} Скачать ${esc(m.file_name || 'файл')}
        </a>`;
      } else if (m.type === 'link') {
        sub = `${ico('link','ico-sm')} Внешняя ссылка`;
        body = `<a href="${esc(m.content)}" target="_blank" rel="noopener">${esc(m.content)}</a>`;
      } else {
        sub = `${ico('file-text','ico-sm')} Конспект`;
        body = esc(m.content);
      }

      return `
        <div class="st-mat" data-mat-id="${m.id}" id="m-${m.id}">
          <div class="st-mat-head">
            <div class="ic">${ico(icon,'ico')}</div>
            <div class="body">
              <div class="title">${esc(m.title)}</div>
              <div class="sub">${sub}</div>
            </div>
            <div class="chev">${ico('chevr','ico-sm')}</div>
          </div>
          <div class="st-mat-body">
            <div class="inner">${body}</div>
          </div>
        </div>
      `;
    }).join('');
    html += `</div>`;
  }

  v.innerHTML = html;

  $$('.st-mat-head').forEach(h => {
    h.addEventListener('click', () => {
      h.closest('.st-mat').classList.toggle('open');
    });
  });
  $$('.st-mat').forEach(el => {
    const sub = $('.sub', el).textContent;
    if (sub.includes('PDF-документ') || sub.includes('Внешняя ссылка')) {
      el.classList.add('open');
    }
  });

  $$('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = Number(item.dataset.imgIndex);
      openLightbox(idx);
    });
  });

  initPdfButtons();
}

function initPdfButtons() {
  $$('.material-pdf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.pdfUrl;
      const title = btn.dataset.pdfTitle;
      openPdfViewer(url, title);
    });
  });
}

async function renderTestBlock(data) {
  const v = $('#test-block');
  if (!v) return;

  if (data.topic.is_welcome === 1) {
    v.innerHTML = `
      <div class="test-cta">
        <span class="emoji">${ico('star','ico-xl')}</span>
        <h3>Вводная тема</h3>
        <p>Эта тема — знакомство с платформой. Тест здесь не предусмотрен.</p>
      </div>
    `;
    return;
  }

  const hasTest = data.test && data.questions_count > 0;

  if (!hasTest) {
    v.innerHTML = `<div class="test-cta">
      <span class="emoji">${ico('clock','ico-xl')}</span>
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
        <span class="emoji">${ico('lock','ico-xl')}</span>
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
      ${ico('clock','ico-sm')} Ваша работа отправлена на проверку учителю
    </div>`;
  } else if (best) {
    statusHtml = `<div class="best-result">
      ${ico('star','ico-sm')} Ваш лучший результат: ${Math.round(best.score / best.total * 100)}% (${best.score} из ${best.total})
    </div>`;
  }

  const infoBits = [];
  if (data.test.timer_min) infoBits.push(`${ico('clock','ico-sm')} ${data.test.timer_min} мин`);
  if (maxAttempts) {
    infoBits.push(`${ico('rotate','ico-sm')} Попыток: ${attemptsUsed} из ${maxAttempts}`);
  } else {
    infoBits.push(`${ico('rotate','ico-sm')} Без ограничения попыток`);
  }
  const infoHtml = infoBits.length
    ? `<div style="font-size:13.5px;color:var(--gray);font-weight:600;margin-bottom:12px">${infoBits.join(' · ')}</div>`
    : '';

  let buttonLabel;
  if (isLimitReached) {
    buttonLabel = 'Попытки закончились';
  } else {
    buttonLabel = pending ? 'Пройти ещё раз' : best ? 'Пройти заново' : 'Начать тест';
  }

  v.innerHTML = `<div class="test-cta">
    <span class="emoji">${ico('flask','ico-xl')}</span>
    <h3>${esc(data.test.title)}</h3>
    <p>Вопросов: <b>${data.questions_count}</b></p>
    ${infoHtml}
    ${statusHtml}
    <br>
    ${isLimitReached
      ? `<button class="btn btn-ghost" disabled style="padding:16px 40px;font-size:16px;opacity:.55;cursor:not-allowed">
           ${ico('ban','ico-sm')} ${buttonLabel}
         </button>`
      : `<a class="btn btn-accent" href="take-test.html?id=${topicId}" style="padding:16px 40px;font-size:16px">
           ${buttonLabel} ${ico('arrow-right','ico-sm')}
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

// ═══ ЛАЙТБОКС ═══
function ensureLightbox() {
  if ($('#material-lightbox')) return;

  const html = `
    <div class="lightbox-overlay" id="material-lightbox">
      <div class="lightbox-close" id="lb-close" title="Закрыть (Esc)">${ico('x','ico-lg')}</div>
      
      <!-- Левая стрелка -->
      <div class="lightbox-nav lightbox-prev" id="lb-prev" title="Назад">${ico('arrow-left','ico-xl')}</div>
      
      <div class="lightbox-content">
        <img id="lb-img" src="" alt="">
      </div>
      
      <!-- Правая стрелка -->
      <div class="lightbox-nav lightbox-next" id="lb-next" title="Вперед">${ico('arrow-right','ico-xl')}</div>
      
      <div class="lightbox-caption" id="lb-caption"></div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  const lb = $('#material-lightbox');
  
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(-1); });
  $('#lb-next').addEventListener('click', (e) => { e.stopPropagation(); navigateLightbox(1); });
  
  lb.addEventListener('click', (e) => {
    if (e.target.id === 'material-lightbox' || e.target.classList.contains('lightbox-content')) {
      closeLightbox();
    }
  });

  lb.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  lb.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 50) { 
      if (diff > 0) navigateLightbox(-1);
      else navigateLightbox(1);
    }
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('show')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
}

function openLightbox(index) {
  ensureLightbox();
  lightboxCurrentIdx = index;
  updateLightbox();
  $('#material-lightbox').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = $('#material-lightbox');
  if (lb) lb.classList.remove('show');
  document.body.style.overflow = '';
}

function navigateLightbox(dir) {
  if (galleryImages.length <= 1) return;
  lightboxCurrentIdx += dir;
  updateLightbox();
}

function updateLightbox() {
  const item = galleryImages[lightboxCurrentIdx];
  if (!item) return;

  $('#lb-img').src = item.src;
  $('#lb-caption').textContent = item.title;

  const prev = $('#lb-prev');
  const next = $('#lb-next');
  
  if (lightboxCurrentIdx <= 0) prev.classList.add('hidden');
  else prev.classList.remove('hidden');
  
  if (lightboxCurrentIdx >= galleryImages.length - 1) next.classList.add('hidden');
  else next.classList.remove('hidden');
}

// ═══ PDF ПРОСМОТРЩИК ═══
function openPdfViewer(url, title) {
  const existing = $('#pdf-viewer-modal');
  if (existing) existing.remove();

  const html = `
    <div class="pdf-viewer-overlay" id="pdf-viewer-modal">
      <div class="pdf-viewer-container">
        <div class="pdf-viewer-head">
          <div class="pdf-viewer-title">${ico('file-text','ico-sm')} ${esc(title)}</div>
          <button class="pdf-viewer-close" id="pdf-close-btn" title="Закрыть">${ico('x','ico')}</button>
        </div>
        <div class="pdf-viewer-body">
          <iframe src="${url}#toolbar=0" frameborder="0"></iframe>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';

  const modal = $('#pdf-viewer-modal');
  const closeBtn = $('#pdf-close-btn');

  function closePdf() {
    modal.remove();
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closePdf);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'pdf-viewer-modal') closePdf();
  });
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