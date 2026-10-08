/* public/js/chat.js
   Универсальный модуль чата.
   Публичное API:
     Chat.init({ role, mountSelector, notifMountSelector })
     Chat.openWith(userId)
     Chat.close()
     Chat.refreshNotifCounter()
*/

(function (global) {
  'use strict';

  // ─── Хелперы ───
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
      throw new Error(json.error || 'Нет доступа');
    }
    if (!res.ok) throw new Error(json.error || 'Ошибка');
    return json;
  }

  function toast(msg, type = '') {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.className = 'toast', 2600);
  }

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
  function isImage(name) {
    const ext = (String(name).split('.').pop() || '').toLowerCase();
    return ['png','jpg','jpeg','gif','webp','svg'].includes(ext);
  }
  function formatSize(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' Б';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' КБ';
    return (b/1024/1024).toFixed(2) + ' МБ';
  }
  function formatTime(iso) {
    if (!iso) return '';
    const s = String(iso).replace(' ', 'T') + 'Z';
    const d = new Date(s);
    if (isNaN(d)) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
  function formatDateLabel(iso) {
    const s = String(iso).replace(' ', 'T') + 'Z';
    const d = new Date(s);
    if (isNaN(d)) return '';
    const now = new Date();
    const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nOnly - dOnly) / 86400000);
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    if (d.getFullYear() === now.getFullYear()) {
      return d.getDate() + ' ' + months[d.getMonth()];
    }
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }
  function dayKey(iso) {
    const s = String(iso).replace(' ', 'T') + 'Z';
    const d = new Date(s);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','👏','🔥','✅','❌'];

  // ─── Состояние ───
  let me = null;
  let role = null;
  let mountEl = null;
  let notifMountEl = null;

  let dialogs = [];
  let dialogsById = new Map();
  let currentPeer = null;
  let currentMessages = [];
  let pollTimer = null;
  let notifPollTimer = null;
  let pendingFile = null;
  let notifPanelOpen = false;

  // ═══════════════════════════════════════════════════
  //  ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════════════════

  function init(opts) {
    role = opts.role;
    mountEl = typeof opts.mountSelector === 'string'
      ? document.querySelector(opts.mountSelector)
      : opts.mountSelector;
    notifMountEl = typeof opts.notifMountSelector === 'string'
      ? document.querySelector(opts.notifMountSelector)
      : opts.notifMountSelector;

    if (!mountEl) {
      console.warn('Chat.init: не найден mountSelector');
      return;
    }

    renderShell();
    wireShell();

    loadDialogs();
    refreshNotifCounter();

    startPolling();
  }

  // ═══════════════════════════════════════════════════
  //  КАРКАС
  // ═══════════════════════════════════════════════════

  function renderShell() {
    mountEl.innerHTML = `
      <div class="chat-app">
        <aside class="chat-sidebar">
          <div class="chat-sidebar-head">
            <h3>💬 Сообщения <span class="cnt-badge" id="chat-total-unread" style="display:none">0</span></h3>
            <input class="chat-search" id="chat-search-input" type="text" placeholder="Поиск по имени…" autocomplete="off">
          </div>
          <div class="chat-dialogs" id="chat-dialogs">
            <div class="chat-placeholder" style="padding:30px 20px">
              <span class="emoji" style="font-size:36px">⏳</span>
              <p style="font-size:13px">Загрузка…</p>
            </div>
          </div>
        </aside>

        <section class="chat-main" id="chat-main">
          <div class="chat-placeholder">
            <span class="emoji">${role === 'tutor' ? '👩‍🎓' : '👨‍🏫'}</span>
            <h3>${role === 'tutor' ? 'Выберите ученика' : 'Напишите учителю'}</h3>
            <p>${role === 'tutor'
              ? 'Слева — список ваших учеников. Кликните на любого, чтобы начать переписку.'
              : 'Здесь вы можете задать вопрос учителю. Он ответит, как только увидит.'}</p>
          </div>
        </section>
      </div>
    `;
  }

  function wireShell() {
    const searchInput = $('#chat-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderDialogList(searchInput.value.trim().toLowerCase());
      });
    }
  }

  // ═══════════════════════════════════════════════════
  //  СПИСОК ДИАЛОГОВ
  // ═══════════════════════════════════════════════════

  async function loadDialogs() {
    try {
      const data = await api('/chat/dialogs');
      dialogs = data.dialogs || [];
      dialogsById = new Map(dialogs.map(d => [d.user.id, d]));

      const totalUnread = data.total_unread || 0;
      updateUnreadBadge(totalUnread);

      renderDialogList();
    } catch (e) {
      console.error('loadDialogs:', e);
      const v = $('#chat-dialogs');
      if (v) v.innerHTML = `<div class="chat-placeholder" style="padding:30px 20px">
        <span class="emoji" style="font-size:36px">😕</span>
        <p style="font-size:13px">${esc(e.message)}</p>
      </div>`;
    }
  }

  function renderDialogList(filter = '') {
    const v = $('#chat-dialogs');
    if (!v) return;

    let list = dialogs;
    if (filter) {
      list = dialogs.filter(d =>
        (d.user.display_name || '').toLowerCase().includes(filter)
      );
    }

    if (!list.length) {
      v.innerHTML = `<div class="chat-placeholder" style="padding:30px 20px">
        <span class="emoji" style="font-size:36px">${filter ? '🔍' : '📭'}</span>
        <p style="font-size:13px">${filter ? 'Никого не найдено' : (role === 'tutor' ? 'Пока нет учеников' : 'Учитель не назначен')}</p>
      </div>`;
      return;
    }

    v.innerHTML = list.map(d => {
      const u = d.user;
      const avatarHtml = window.Avatars.html(u, { size: 'md' });
      const unread = d.unread_count || 0;
      const lm = d.last_message;

      let preview = '';
      if (lm) {
        const prefix = lm.from_me ? 'Вы: ' : '';
        const content = lm.text
          ? esc(lm.text.slice(0, 60))
          : (lm.file_name ? '📎 ' + esc(lm.file_name.slice(0, 40)) : '—');
        preview = `<div class="preview">${prefix}${content}</div>`;
      } else {
        preview = `<div class="preview muted">Нет сообщений</div>`;
      }

      const time = lm ? formatTime(lm.created_at) : '';
      const isOnline = isUserOnline(u);

      return `
        <div class="chat-dialog ${currentPeer && currentPeer.id === u.id ? 'active' : ''}"
             data-user-id="${u.id}">
          <div class="ava-wrap">
            ${avatarHtml}
            ${isOnline ? '<span class="online-dot"></span>' : ''}
          </div>
          <div class="info">
            <div class="name">${esc(u.display_name)}</div>
            ${preview}
          </div>
          <div class="meta">
            ${time ? `<div class="time">${time}</div>` : ''}
            ${unread > 0 ? `<div class="unread-badge">${unread}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    $$('.chat-dialog', v).forEach(el => {
      el.addEventListener('click', () => {
        openWith(Number(el.dataset.userId));
      });
    });
  }

  function isUserOnline(u) {
    if (!u.last_seen) return false;
    const s = String(u.last_seen).replace(' ', 'T') + 'Z';
    const last = new Date(s).getTime();
    return (Date.now() - last) < 2 * 60 * 1000;
  }

  // ═══════════════════════════════════════════════════
  //  ОТКРЫТИЕ ЧАТА
  // ═══════════════════════════════════════════════════

  async function openWith(userId) {
    const d = dialogsById.get(userId);
    if (!d) return;

    currentPeer = d.user;
    currentMessages = [];
    pendingFile = null;

    renderDialogList($('#chat-search-input')?.value.trim().toLowerCase() || '');

    try {
      const data = await api('/chat/with/' + userId);
      currentPeer = data.user;
      currentMessages = data.messages || [];

      if (d) d.unread_count = 0;
      const totalUnread = dialogs.reduce((sum, x) => sum + (x.unread_count || 0), 0);
      updateUnreadBadge(totalUnread);
      renderDialogList($('#chat-search-input')?.value.trim().toLowerCase() || '');
      refreshNotifCounter();

      renderChatMain();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function close() {
    currentPeer = null;
    currentMessages = [];
    renderChatMain();
  }

  // ═══════════════════════════════════════════════════
  //  ОКНО ЧАТА
  // ═══════════════════════════════════════════════════

  function renderChatMain() {
    const v = $('#chat-main');
    if (!v) return;

    if (!currentPeer) {
      v.innerHTML = `
        <div class="chat-placeholder">
          <span class="emoji">${role === 'tutor' ? '👩‍🎓' : '👨‍🏫'}</span>
          <h3>${role === 'tutor' ? 'Выберите ученика' : 'Напишите учителю'}</h3>
          <p>${role === 'tutor'
            ? 'Слева — список ваших учеников. Кликните на любого, чтобы начать переписку.'
            : 'Здесь вы можете задать вопрос учителю. Он ответит, как только увидит.'}</p>
        </div>`;
      return;
    }

    const online = isUserOnline(currentPeer);
    const avatarHead = window.Avatars.html(currentPeer, { size: 'md' });

    v.innerHTML = `
      <div class="chat-main-head">
        ${avatarHead}
        <div class="info">
          <div class="name">${esc(currentPeer.display_name)}</div>
          <div class="status ${online ? 'online' : ''}">
            ${online ? 'онлайн' : 'был(а) недавно'}
          </div>
        </div>
      </div>

      <div class="chat-main-body" id="chat-body"></div>

      <div class="chat-input-wrap">
        <div id="chat-attach-preview-wrap"></div>
        <div class="chat-input-row">
          <button class="chat-attach-btn" id="chat-attach-btn" title="Прикрепить файл">📎</button>
          <input type="file" id="chat-file-input" hidden
                 accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.rtf,.csv,.png,.jpg,.jpeg,.gif,.webp,.svg">
          <textarea class="chat-textarea" id="chat-textarea"
                    placeholder="Написать сообщение… (Enter — отправить)"></textarea>
          <button class="chat-send-btn" id="chat-send-btn" disabled title="Отправить">➤</button>
        </div>
        <div class="chat-hint-under">Enter — отправить, Shift+Enter — новая строка</div>
      </div>
    `;

    renderMessages();
    wireChatMain();
  }

  function renderMessages() {
    const body = $('#chat-body');
    if (!body) return;

    if (!currentMessages.length) {
      body.innerHTML = `
        <div class="chat-placeholder" style="min-height:auto;padding:40px 20px">
          <span class="emoji" style="font-size:48px">👋</span>
          <h3 style="font-size:16px">Начните переписку</h3>
          <p style="font-size:13px">${role === 'tutor'
            ? 'Напишите ученику первое сообщение'
            : 'Задайте вопрос — учитель ответит'}</p>
        </div>`;
      return;
    }

    let html = '';
    let lastDay = null;

    for (const m of currentMessages) {
      const dk = dayKey(m.created_at);
      if (dk !== lastDay) {
        lastDay = dk;
        html += `<div class="chat-date-sep"><span>${formatDateLabel(m.created_at)}</span></div>`;
      }
      html += renderMessage(m);
    }

    body.innerHTML = html;
    wireMessageActions();
    scrollToBottom();
  }

  function renderMessage(m) {
    const mine = m.from_me;
    const avatarUser = mine
      ? { avatar: me?.avatar, avatar_bg: me?.avatar_bg, display_name: me?.display_name }
      : { avatar: currentPeer?.avatar, avatar_bg: currentPeer?.avatar_bg, display_name: currentPeer?.display_name };
    const avatarHtml = window.Avatars.html(avatarUser, { size: 'sm' });

    let bubbleInner = '';
    const hasText = !!(m.text && m.text.trim());
    const hasFile = !!m.file_path;

    if (hasText) {
      bubbleInner += `<div>${escapeAndLinkify(m.text)}</div>`;
    }

    if (hasFile) {
      if (isImage(m.file_name)) {
        bubbleInner += `
          <a href="${esc(m.file_path)}" target="_blank" rel="noopener">
            <img class="msg-image" src="${esc(m.file_path)}" alt="${esc(m.file_name)}" loading="lazy">
          </a>
        `;
      } else {
        bubbleInner += `
          <a class="msg-file" href="${esc(m.file_path)}" download="${esc(m.file_name)}" target="_blank" rel="noopener">
            <div class="fi">${fileIcon(m.file_name)}</div>
            <div class="finfo">
              <div class="fname">${esc(m.file_name)}</div>
              <div class="fsize">${formatSize(m.file_size)}</div>
            </div>
            <div class="fdl">📥</div>
          </a>
        `;
      }
    }

    const bubbleCls = (hasFile && !hasText && isImage(m.file_name)) ? 'msg-bubble image-only' : 'msg-bubble';

    const reactions = m.reactions || {};
    const hasReactions = Object.keys(reactions).length > 0;
    const reactionsHtml = hasReactions
      ? `<div class="msg-reactions" data-msg-id="${m.id}">${renderReactions(reactions, me?.id)}</div>`
      : '';

    return `
      <div class="msg-row ${mine ? 'mine' : ''}" data-msg-id="${m.id}">
        <div class="msg-avatar">${avatarHtml}</div>
        <div class="msg-bubble-wrap">
          <div class="${bubbleCls}">
            ${bubbleInner}
            <button class="msg-react-trigger" data-react-trigger="${m.id}" title="Реакция">😊</button>
          </div>
          ${reactionsHtml}
          <div class="msg-time">${formatTime(m.created_at)}</div>
        </div>
      </div>
    `;
  }

  function renderReactions(reactions, myId) {
    return Object.entries(reactions).map(([emoji, users]) => {
      const mine = users.some(u => u.user_id === myId);
      const names = users.map(u => u.display_name).join(', ');
      return `<span class="reaction-chip ${mine ? 'mine' : ''}"
                    data-emoji="${esc(emoji)}"
                    title="${esc(names)}">
        <span>${esc(emoji)}</span>
        <span class="cnt">${users.length}</span>
      </span>`;
    }).join('');
  }

  function escapeAndLinkify(text) {
    const escaped = esc(text);
    return escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
  }

  function scrollToBottom() {
    const body = $('#chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  }

  // ═══════════════════════════════════════════════════
  //  ОБРАБОТЧИКИ
  // ═══════════════════════════════════════════════════

  function wireChatMain() {
    const ta = $('#chat-textarea');
    const sendBtn = $('#chat-send-btn');
    const attachBtn = $('#chat-attach-btn');
    const fileInput = $('#chat-file-input');

    if (ta) {
      ta.addEventListener('input', () => {
        updateSendButton();
        autoGrow(ta);
      });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!sendBtn.disabled) sendBtn.click();
        }
      });
      setTimeout(() => ta.focus(), 50);
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    if (attachBtn && fileInput) {
      attachBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) uploadFile(fileInput.files[0]);
      });
    }
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function updateSendButton() {
    const ta = $('#chat-textarea');
    const btn = $('#chat-send-btn');
    if (!ta || !btn) return;
    const hasText = ta.value.trim().length > 0;
    btn.disabled = !hasText && !pendingFile;
  }

  // ═══════════════════════════════════════════════════
  //  ОТПРАВКА
  // ═══════════════════════════════════════════════════

  async function sendMessage() {
    if (!currentPeer) return;
    const ta = $('#chat-textarea');
    const text = (ta?.value || '').trim();

    if (!text && !pendingFile) return;

    const btn = $('#chat-send-btn');
    if (btn) btn.disabled = true;

    try {
      const body = {
        to_user_id: currentPeer.id,
        text
      };
      if (pendingFile) {
        body.file_path = pendingFile.file_path;
        body.file_name = pendingFile.file_name;
        body.file_size = pendingFile.file_size;
      }

      const data = await api('/chat/send', { method: 'POST', body });
      currentMessages.push(data.message);

      if (ta) { ta.value = ''; autoGrow(ta); }
      clearPendingFile();
      updateSendButton();

      renderMessages();

      const d = dialogsById.get(currentPeer.id);
      if (d) {
        d.last_message = {
          text: data.message.text,
          file_name: data.message.file_name,
          from_me: true,
          created_at: data.message.created_at
        };
      }
      renderDialogList($('#chat-search-input')?.value.trim().toLowerCase() || '');
    } catch (e) {
      toast(e.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════
  //  ФАЙЛЫ
  // ═══════════════════════════════════════════════════

  async function uploadFile(file) {
    if (file.size > 20 * 1024 * 1024) {
      return toast('Файл больше 20 МБ', 'error');
    }

    const wrap = $('#chat-attach-preview-wrap');
    wrap.innerHTML = `<div class="chat-attach-preview">
      <div class="fi">⏳</div>
      <div class="finfo">
        <div class="fname">Загрузка…</div>
        <div class="fsize">${esc(file.name)}</div>
      </div>
    </div>`;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        credentials: 'same-origin',
        body: formData
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Ошибка загрузки');

      pendingFile = {
        file_path: json.file_path,
        file_name: json.file_name,
        file_size: json.file_size
      };
      renderAttachPreview();
      updateSendButton();
    } catch (e) {
      wrap.innerHTML = '';
      toast(e.message, 'error');
    }
  }

  function renderAttachPreview() {
    const wrap = $('#chat-attach-preview-wrap');
    if (!wrap) return;
    if (!pendingFile) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <div class="chat-attach-preview">
        <div class="fi">${fileIcon(pendingFile.file_name)}</div>
        <div class="finfo">
          <div class="fname">${esc(pendingFile.file_name)}</div>
          <div class="fsize">${formatSize(pendingFile.file_size)}</div>
        </div>
        <div class="frm" id="chat-attach-clear">✕</div>
      </div>
    `;
    $('#chat-attach-clear').onclick = clearPendingFile;
  }

  function clearPendingFile() {
    pendingFile = null;
    const wrap = $('#chat-attach-preview-wrap');
    if (wrap) wrap.innerHTML = '';
    const fi = $('#chat-file-input');
    if (fi) fi.value = '';
    updateSendButton();
  }

  // ═══════════════════════════════════════════════════
  //  РЕАКЦИИ
  // ═══════════════════════════════════════════════════

  let reactionsPanel = null;
  let reactionsPanelFor = null;

  function ensureReactionsPanel() {
    if (reactionsPanel) return reactionsPanel;
    reactionsPanel = document.createElement('div');
    reactionsPanel.className = 'reactions-panel';
    reactionsPanel.innerHTML = REACTION_EMOJIS.map(e =>
      `<button class="re" data-emoji="${e}">${e}</button>`
    ).join('');
    document.body.appendChild(reactionsPanel);

    reactionsPanel.addEventListener('click', async (e) => {
      const btn = e.target.closest('.re');
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      const msgId = reactionsPanelFor;
      hideReactionsPanel();
      if (msgId) await reactToMessage(msgId, emoji);
    });

    return reactionsPanel;
  }

  function showReactionsPanel(triggerEl, messageId) {
    const panel = ensureReactionsPanel();
    const rect = triggerEl.getBoundingClientRect();
    const panelW = 380;
    let left = rect.left + rect.width / 2 - panelW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - panelW - 12));
    let top = rect.top - 52;
    if (top < 10) top = rect.bottom + 8;

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.classList.add('show');
    reactionsPanelFor = messageId;
  }

  function hideReactionsPanel() {
    if (reactionsPanel) reactionsPanel.classList.remove('show');
    reactionsPanelFor = null;
  }

  function wireMessageActions() {
    $$('.msg-react-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const msgId = Number(btn.dataset.reactTrigger);
        showReactionsPanel(btn, msgId);
      });
    });

    $$('.reaction-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const parent = chip.closest('.msg-reactions');
        if (!parent) return;
        const msgId = Number(parent.dataset.msgId);
        const emoji = chip.dataset.emoji;
        reactToMessage(msgId, emoji);
      });
    });
  }

  async function reactToMessage(messageId, emoji) {
    try {
      const data = await api('/chat/react', {
        method: 'POST',
        body: { message_id: messageId, emoji }
      });
      const msg = currentMessages.find(m => m.id === messageId);
      if (msg) msg.reactions = data.reactions || {};
      renderMessages();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  document.addEventListener('click', (e) => {
    if (reactionsPanel && reactionsPanel.classList.contains('show')) {
      if (!e.target.closest('.reactions-panel') && !e.target.closest('.msg-react-trigger')) {
        hideReactionsPanel();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideReactionsPanel();
  });

  // ═══════════════════════════════════════════════════
  //  POLLING
  // ═══════════════════════════════════════════════════

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollTick, 4000);

    if (notifPollTimer) clearInterval(notifPollTimer);
    notifPollTimer = setInterval(refreshNotifCounter, 4000);
  }

  async function pollTick() {
    try {
      const data = await api('/chat/dialogs');
      dialogs = data.dialogs || [];
      dialogsById = new Map(dialogs.map(d => [d.user.id, d]));

      const totalUnread = data.total_unread || 0;
      updateUnreadBadge(totalUnread);
      renderDialogList($('#chat-search-input')?.value.trim().toLowerCase() || '');

      if (currentPeer) {
        const history = await api('/chat/with/' + currentPeer.id);
        const newMessages = history.messages || [];
        if (newMessages.length !== currentMessages.length) {
          const wasAtBottom = isScrolledToBottom();
          currentMessages = newMessages;
          renderMessages();
          if (wasAtBottom) scrollToBottom();
        }
        const d = dialogsById.get(currentPeer.id);
        if (d && d.unread_count > 0) {
          await api('/chat/read/' + currentPeer.id, { method: 'POST' });
          d.unread_count = 0;
        }
      }
    } catch (e) {}
  }

  function isScrolledToBottom() {
    const body = $('#chat-body');
    if (!body) return true;
    return (body.scrollHeight - body.scrollTop - body.clientHeight) < 40;
  }

  // ═══════════════════════════════════════════════════
  //  БЕЙДЖ И ПАНЕЛЬ УВЕДОМЛЕНИЙ
  // ═══════════════════════════════════════════════════

  function updateUnreadBadge(count) {
    const nav = notifMountEl
      ? (notifMountEl.classList.contains('nav-item') || notifMountEl.classList.contains('topbar-tab')
          ? notifMountEl
          : notifMountEl.closest('.nav-item, .topbar-tab'))
      : null;

    let badge = nav ? nav.querySelector('.chat-nav-badge') : null;

    if (!badge && nav) {
      badge = document.createElement('span');
      badge.className = 'chat-nav-badge';
      nav.appendChild(badge);
    }

    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.style.display = '';
        if (nav) nav.classList.add('has-chat');
      } else {
        badge.style.display = 'none';
        if (nav) nav.classList.remove('has-chat');
      }
    }

    const innerBadge = $('#chat-total-unread');
    if (innerBadge) {
      if (count > 0) {
        innerBadge.textContent = count > 99 ? '99+' : String(count);
        innerBadge.style.display = '';
      } else {
        innerBadge.style.display = 'none';
      }
    }
  }

  let notifPanel = null;

  function ensureNotifPanel() {
    if (notifPanel) return notifPanel;
    notifPanel = document.createElement('div');
    notifPanel.className = 'chat-notif-panel';
    notifPanel.innerHTML = `
      <div class="chat-notif-head">
        <h4>💬 Непрочитанные</h4>
        <span class="total" id="chat-notif-total">0</span>
      </div>
      <div class="chat-notif-body" id="chat-notif-body"></div>
    `;
    document.body.appendChild(notifPanel);

    document.addEventListener('click', (e) => {
      if (!notifPanel.classList.contains('show')) return;
      if (e.target.closest('.chat-notif-panel')) return;
      if (e.target.closest('.chat-notif-trigger')) return;
      closeNotifPanel();
    });

    return notifPanel;
  }

  function openNotifPanel() {
    const panel = ensureNotifPanel();
    panel.classList.add('show');
    notifPanelOpen = true;
    renderNotifPanel();
  }

  function closeNotifPanel() {
    if (notifPanel) notifPanel.classList.remove('show');
    notifPanelOpen = false;
  }

  async function renderNotifPanel() {
    const body = $('#chat-notif-body');
    const total = $('#chat-notif-total');
    if (!body) return;

    try {
      const data = await api('/chat/unread');
      total.textContent = data.total || 0;

      if (!data.items || !data.items.length) {
        body.innerHTML = `
          <div class="chat-notif-empty">
            <span class="emo">🎉</span>
            <div>Нет непрочитанных сообщений</div>
          </div>`;
        return;
      }

      body.innerHTML = data.items.map(item => {
        const u = item.user;
        const avatarHtml = window.Avatars.html(u, { size: 'md' });
        const preview = item.latest.text
          ? esc(item.latest.text.slice(0, 60))
          : (item.latest.file_name ? '📎 ' + esc(item.latest.file_name.slice(0, 40)) : '—');

        return `
          <div class="chat-notif-item" data-notif-user-id="${u.id}">
            ${avatarHtml}
            <div class="info">
              <div class="name">${esc(u.display_name)}</div>
              <div class="preview">${preview}</div>
              <div class="meta">
                <span>${formatTime(item.latest.created_at)}</span>
                ${item.count > 1 ? `<span class="cnt">${item.count}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');

      $$('.chat-notif-item', body).forEach(el => {
        el.addEventListener('click', () => {
          const uid = Number(el.dataset.notifUserId);
          closeNotifPanel();
          if (typeof window.switchToChatSection === 'function') {
            window.switchToChatSection();
          }
          setTimeout(() => openWith(uid), 150);
        });
      });
    } catch (e) {
      body.innerHTML = `<div class="chat-notif-empty"><div>${esc(e.message)}</div></div>`;
    }
  }

  async function refreshNotifCounter() {
    try {
      const data = await api('/chat/unread');
      updateUnreadBadge(data.total || 0);
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════
  //  ЭКСПОРТ
  // ═══════════════════════════════════════════════════

  global.Chat = {
    init,
    openWith,
    close,
    openNotifPanel,
    closeNotifPanel,
    refreshNotifCounter,
    setMe: (u) => { me = u; }
  };

})(window);