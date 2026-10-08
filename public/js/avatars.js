/* public/js/avatars.js
   Модуль для отрисовки emoji-аватарок.
   Публичное API:
     Avatars.html(user, opts)  → строка HTML с аватаром
     Avatars.apply(el, user, opts) → вставить аватар внутрь DOM-элемента
     Avatars.DEFAULT_EMOJI → запасной эмодзи, если у юзера нет аватара
*/

(function (global) {
  'use strict';

  const DEFAULT_EMOJI = '🧪';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  /**
   * Возвращает HTML-строку аватара.
   *
   * @param {Object} user — { avatar?, avatar_bg? }
   * @param {Object} [opts]
   * @param {string} [opts.size='md'] — 'sm' | 'md' | 'lg' | 'xl'
   * @param {boolean} [opts.round=false] — круглая форма
   * @param {string} [opts.extraClass=''] — доп. классы
   * @param {string} [opts.title=''] — всплывающая подсказка
   * @param {boolean} [opts.pop=false] — анимация появления
   */
  function html(user, opts = {}) {
    const avatar   = (user && user.avatar) || DEFAULT_EMOJI;
    const rawBg    = (user && user.avatar_bg);
    const bg       = Number.isInteger(rawBg) ? Math.abs(rawBg) % 12 : 0;

    const size     = opts.size || 'md';
    const round    = opts.round ? ' avatar-round' : '';
    const extra    = opts.extraClass ? ' ' + opts.extraClass : '';
    const pop      = opts.pop ? ' avatar-pop' : '';
    const title    = opts.title ? ` title="${escapeHtml(opts.title)}"` : '';

    return `<span class="user-avatar avatar-${size} avatar-bg-${bg}${round}${extra}${pop}"${title}>${escapeHtml(avatar)}</span>`;
  }

  /**
   * Вставляет аватар внутрь существующего элемента (заменяет содержимое).
   *
   * @param {HTMLElement|string} elOrSelector — элемент или CSS-селектор
   * @param {Object} user — { avatar?, avatar_bg? }
   * @param {Object} [opts] — те же опции, что у html()
   */
  function apply(elOrSelector, user, opts = {}) {
    const el = typeof elOrSelector === 'string'
      ? document.querySelector(elOrSelector)
      : elOrSelector;
    if (!el) return;
    el.innerHTML = html(user, opts);
  }

  global.Avatars = {
    html,
    apply,
    DEFAULT_EMOJI
  };

})(window);