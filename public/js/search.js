/* public/js/search.js
   Универсальный модуль поиска для кабинетов учителя и ученика.
   - Открытие: клик по триггеру + Ctrl+K / Ctrl+/
   - Debounce 250мс
   - Fetch к /api/search или /api/my/search (по роли)
   - Навигация стрелками ↑↓, Enter → переход
   - Esc / клик по фону → закрытие
   - Переход с #hash для подсветки на целевой странице
*/

(function (global) {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ─── Стейт ───
  let role = null;         // 'tutor' | 'student'
  let endpoint = null;     // '/api/search' или '/api/my/search'
  let backdrop = null;
  let input = null;
  let bodyEl = null;
  let items = [];          // плоский список кликабельных результатов
  let activeIdx = -1;
  let lastQuery = '';
  let debounceTimer = null;
  let requestId = 0;

  // ─── Утилита: выделить совпадения ───
  function highlight(text, query) {
    if (!query || !text) return esc(text);
    const q = query.toLowerCase();
    const lower = text.toLowerCase();
    let result = '';
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(q, i);
      if (idx === -1) {
        result += esc(text.slice(i));
        break;
      }
      result += esc(text.slice(i, idx));
      result += '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>';
      i = idx + q.length;
    }
    return result;
  }

  // ─── Рендер: плейсхолдер до ввода ───
  function renderEmpty() {
    bodyEl.innerHTML = `
      <div class="search-empty">
        <span class="emp-emoji">🔍</span>
        <h4>Начните вводить запрос</h4>
        <p>
          Введите минимум <b>2 символа</b>.<br>
          ${role === 'tutor'
            ? 'Ищем по темам, ученикам и вопросам ваших тестов.'
            : 'Ищем по темам и материалам вашего учителя.'}
        </p>
      </div>
    `;
    items = [];
    activeIdx = -1;
  }

  // ─── Рендер: загрузка ───
  function renderLoading() {
    bodyEl.innerHTML = `
      <div class="search-loading">
        ${[1,2,3].map(() => `
          <div class="sk-row">
            <div class="sk-avatar"></div>
            <div class="sk-lines">
              <div class="sk-line"></div>
              <div class="sk-line short"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── Рендер: ничего не найдено ───
  function renderNothing(q) {
    bodyEl.innerHTML = `
      <div class="search-nothing">
        <span class="emo">🤷</span>
        <h4>Ничего не найдено</h4>
        <p>По запросу <span class="q">«${esc(q)}»</span> нет результатов.<br>
           Попробуйте другое слово или проверьте раскладку.</p>
      </div>
    `;
    items = [];
    activeIdx = -1;
  }

  // ─── Рендер: результаты ───
  function renderResults(data) {
    const q = data.query || '';
    let html = '';
    items = [];
    activeIdx = -1;

    // ═══ УЧИТЕЛЬ ═══
    if (role === 'tutor') {
      // Темы
      if (data.topics?.length) {
        html += `<div class="search-group">
          <div class="search-group-title">📚 Темы <span class="cnt">${data.topics.length}</span></div>
          ${data.topics.map(t => `
            <a class="search-item" data-url="topic.html?id=${t.id}">
              <div class="si-icon">📚</div>
              <div class="si-body">
                <div class="si-title">${highlight(t.title, q)}</div>
                <div class="si-sub">
                  📄 ${t.materials_count} материалов · ❓ ${t.questions_count} вопросов
                  ${t.description ? ' · ' + highlight(t.description.slice(0, 60), q) : ''}
                </div>
                <span class="si-hint">тема</span>
              </div>
              <div class="si-arrow">→</div>
            </a>
          `).join('')}
        </div>`;
      }

      // Ученики
      if (data.students?.length) {
        html += `<div class="search-group">
          <div class="search-group-title">👩‍🎓 Ученики <span class="cnt">${data.students.length}</span></div>
          ${data.students.map(s => `
            <div class="search-item accent" data-student-id="${s.id}">
              <div class="si-icon">👤</div>
              <div class="si-body">
                <div class="si-title">${highlight(s.display_name, q)}</div>
                <div class="si-sub">Логин: <b>${highlight(s.username, q)}</b></div>
                <span class="si-hint accent">ученик</span>
              </div>
              <div class="si-arrow">→</div>
            </div>
          `).join('')}
        </div>`;
      }

      // Вопросы
      if (data.questions?.length) {
        html += `<div class="search-group">
          <div class="search-group-title">❓ Вопросы <span class="cnt">${data.questions.length}</span></div>
          ${data.questions.map(qq => `
            <a class="search-item warn" data-url="topic.html?id=${qq.topic_id}#q-${qq.id}">
              <div class="si-icon">❓</div>
              <div class="si-body">
                <div class="si-title">${highlight(qq.text.slice(0, 80), q)}</div>
                <div class="si-sub">Тема: ${esc(qq.topic_title)}</div>
                <span class="si-hint warn">вопрос</span>
              </div>
              <div class="si-arrow">→</div>
            </a>
          `).join('')}
        </div>`;
      }
    }

    // ═══ УЧЕНИК ═══
    if (role === 'student') {
      // Темы
      if (data.topics?.length) {
        html += `<div class="search-group">
          <div class="search-group-title">📚 Темы <span class="cnt">${data.topics.length}</span></div>
          ${data.topics.map(t => `
            <a class="search-item" data-url="student-topic.html?id=${t.id}">
              <div class="si-icon">📚</div>
              <div class="si-body">
                <div class="si-title">${highlight(t.title, q)}</div>
                <div class="si-sub">
                  📄 ${t.materials_count} материалов · ❓ ${t.questions_count} вопросов
                  ${t.description ? ' · ' + highlight(t.description.slice(0, 60), q) : ''}
                </div>
                <span class="si-hint">тема</span>
              </div>
              <div class="si-arrow">→</div>
            </a>
          `).join('')}
        </div>`;
      }

      // Материалы
      if (data.materials?.length) {
        html += `<div class="search-group">
          <div class="search-group-title">📄 Материалы <span class="cnt">${data.materials.length}</span></div>
          ${data.materials.map(m => {
            const typeIcon = m.file_name ? '📎' : (m.type === 'link' ? '🔗' : '📝');
            const sub = m.file_name
              ? `📎 ${esc(m.file_name)}`
              : (m.type === 'link'
                  ? highlight(m.content.slice(0, 70), q)
                  : highlight(m.content.slice(0, 90), q));
            return `
              <a class="search-item accent" data-url="student-topic.html?id=${m.topic_id}#m-${m.id}">
                <div class="si-icon">${typeIcon}</div>
                <div class="si-body">
                  <div class="si-title">${highlight(m.title, q)}</div>
                  <div class="si-sub">${sub}</div>
                  <div class="si-sub" style="font-size:11.5px;margin-top:2px;opacity:.7">
                    Тема: ${esc(m.topic_title)}
                  </div>
                  <span class="si-hint accent">материал</span>
                </div>
                <div class="si-arrow">→</div>
              </a>
            `;
          }).join('')}
        </div>`;
      }
    }

    if (!html) {
      renderNothing(q);
      return;
    }

    bodyEl.innerHTML = html;
    items = $$('.search-item', bodyEl);
  }

  // ─── Запрос к API ───
  async function doSearch(query) {
    lastQuery = query;
    if (query.length < 2) {
      renderEmpty();
      return;
    }

    const myId = ++requestId;
    renderLoading();

    try {
      const res = await fetch(endpoint + '?q=' + encodeURIComponent(query), {
        credentials: 'same-origin'
      });
      // если пришёл более новый запрос — игнорируем ответ
      if (myId !== requestId) return;
      const data = await res.json();
      if (myId !== requestId) return;
      renderResults(data);
    } catch (e) {
      if (myId !== requestId) return;
      renderNothing(query);
    }
  }

  // ─── Переход по результату ───
  function goToItem(item) {
    if (!item) return;

    // Ученик — переходим на дашборд с hash для подсветки
    if (item.dataset.studentId) {
      closeSearch();
      location.href = 'dashboard-tutor.html?highlight-student=' + item.dataset.studentId;
      return;
    }

    // Обычная ссылка
    const url = item.dataset.url;
    if (url) {
      closeSearch();
      location.href = url;
    }
  }

  // ─── Навигация стрелками ───
  function setActive(idx) {
    if (!items.length) return;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    items.forEach((it, i) => it.classList.toggle('active', i === idx));
    items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    activeIdx = idx;
  }

  function handleKeydown(e) {
    if (!backdrop.classList.contains('open')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIdx + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIdx - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0 && items[activeIdx]) {
        goToItem(items[activeIdx]);
      } else if (items[0]) {
        goToItem(items[0]);
      }
      return;
    }
  }

  // ─── Открытие / закрытие ───
  function openSearch() {
    if (!backdrop) return;
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    // если уже был запрос — не стираем
    if (input.value.trim().length >= 2) {
      doSearch(input.value.trim());
    } else {
      renderEmpty();
    }
  }

  function closeSearch() {
    if (!backdrop) return;
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ─── Инициализация ───
  function init(opts) {
    role = opts.role;
    endpoint = role === 'tutor' ? '/api/search' : '/api/my/search';

    // Создаём модалку динамически (если её ещё нет в HTML)
    if (!$('#search-backdrop')) {
      const html = `
        <div class="search-backdrop" id="search-backdrop">
          <div class="search-modal" role="dialog" aria-label="Поиск">
            <div class="search-input-wrap">
              <span class="s-icon">🔍</span>
              <input class="search-input" id="search-input" type="text"
                     placeholder="Поиск по ${role === 'tutor' ? 'темам, ученикам, вопросам' : 'темам и материалам'}…"
                     autocomplete="off" spellcheck="false">
              <button class="search-close" id="search-close" title="Закрыть (Esc)">✕</button>
            </div>
            <div class="search-body" id="search-body"></div>
            <div class="search-foot">
              <div class="kbd-group">
                <div class="kbd-item"><span class="kbd">↑</span><span class="kbd">↓</span> навигация</div>
                <div class="kbd-item"><span class="kbd">↵</span> перейти</div>
                <div class="kbd-item"><span class="kbd">Esc</span> закрыть</div>
              </div>
              <div>минимум 2 символа</div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
    }

    backdrop = $('#search-backdrop');
    input = $('#search-input');
    bodyEl = $('#search-body');

    // Триггеры (все кнопки .search-trigger на странице)
    $$('.search-trigger').forEach(btn => {
      btn.addEventListener('click', openSearch);
    });

    // Клик по фону
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSearch();
    });

    // Крестик
    $('#search-close').addEventListener('click', closeSearch);

    // Ввод с debounce
    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => doSearch(q), 250);
    });

    // Клик по результату
    bodyEl.addEventListener('click', (e) => {
      const item = e.target.closest('.search-item');
      if (item) goToItem(item);
    });

    // Ховер подсвечивает как active
    bodyEl.addEventListener('mouseover', (e) => {
      const item = e.target.closest('.search-item');
      if (item) {
        const idx = items.indexOf(item);
        if (idx >= 0) setActive(idx);
      }
    });

    // Глобальные горячие клавиши
    document.addEventListener('keydown', (e) => {
      // Ctrl+K или Ctrl+/ — открыть
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === '/')) {
        e.preventDefault();
        openSearch();
        return;
      }
      handleKeydown(e);
    });

    // На всякий случай — сброс при закрытии вкладки
    window.addEventListener('beforeunload', () => {
      document.body.style.overflow = '';
    });
  }

  // ─── Экспорт ───
  global.Search = {
    init,
    open: openSearch,
    close: closeSearch
  };

})(window);