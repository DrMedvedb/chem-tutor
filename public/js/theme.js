/* public/js/theme.js
   Переключатель тёмной/светлой темы.
   - Класс .dark вешается на <html>
   - Выбор сохраняется в localStorage
   - При первой загрузке берётся системная тема (prefers-color-scheme)
   - Автоматически вставляет кнопку-переключатель 🌙/☀️ туда, куда скажут
*/

(function () {
  'use strict';

  const STORAGE_KEY = 'chem-tutor-theme'; // 'light' | 'dark'

  // ─── 1. Применение темы ───
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  // ─── 2. Получить стартовую тему ───
  function getInitialTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;

    // Системная тема
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // ─── 3. Текущая тема ───
  function currentTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  // ─── 4. Переключение ───
  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    updateAllButtons();
  }

  // ─── 5. Обновить иконки у всех кнопок на странице ───
  function updateAllButtons() {
    const isDark = currentTheme() === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
      btn.setAttribute('aria-label', btn.title);
    });
  }

  // ─── 6. Создать кнопку-переключатель ───
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.innerHTML = `
      <span class="icon icon-moon">🌙</span>
      <span class="icon icon-sun">☀️</span>
    `;
    btn.addEventListener('click', toggleTheme);
    return btn;
  }

  // ─── 7. Вставить кнопку в контейнер ───
  // Если у элемента задан data-theme-toggle="selector" —
  // вставим кнопку внутрь найденного контейнера.
  function mountButtons() {
    const placeholders = document.querySelectorAll('[data-theme-toggle]');
    placeholders.forEach(container => {
      // не дублировать
      if (container.querySelector('.theme-toggle')) return;
      container.appendChild(createToggleButton());
    });
  }

  // ─── 8. Применяем тему СРАЗУ, чтобы не мигало ───
  applyTheme(getInitialTheme());

  // ─── 9. Ставим кнопки, когда DOM готов ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButtons);
  } else {
    mountButtons();
  }

  // ─── 10. Слушаем изменения системной темы ───
  // (только если пользователь ещё не сделал выбор вручную)
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e) => {
      if (localStorage.getItem(STORAGE_KEY)) return; // есть ручной выбор — не трогаем
      applyTheme(e.matches ? 'dark' : 'light');
      updateAllButtons();
    });
  }

  // ─── Экспорт на всякий случай ───
  window.ThemeToggle = {
    toggle: toggleTheme,
    set: (theme) => {
      applyTheme(theme);
      localStorage.setItem(STORAGE_KEY, theme);
      updateAllButtons();
    },
    current: currentTheme
  };
})();