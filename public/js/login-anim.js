/* public/js/login-anim.js
   Анимация входа: колба → выплеск → редирект → стекание на дашборде.

   Публичное API:
     LoginAnim.playAndRedirect({ role, redirect })
       — на странице логина: колба наливается, выплеск, редирект.
     LoginAnim.playWelcome()
       — на дашборде: если только что вошли — заливка стекает вниз.
     LoginAnim.shakeForm(el) — тряска формы при ошибке.
*/

(function (global) {
  'use strict';

  const STORAGE_KEY = 'chem-tutor-login-anim';
  const FRESH_MS = 5000;

  const COLORS = {
    tutor:   { main: '#6a4cff', light: '#a678ff', dark: '#4d34d6' },
    student: { main: '#0ea5e9', light: '#38bdf8', dark: '#0284c7' }
  };

  // ═══ Стили (инжект один раз) ═══
  function injectStyles() {
    if (document.getElementById('login-anim-style')) return;
    const style = document.createElement('style');
    style.id = 'login-anim-style';
    style.textContent = `
      .la-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        pointer-events: none;
        overflow: hidden;
        display: grid;
        place-items: center;
      }
      .la-flask-wrap {
        position: relative;
        width: 220px;
        height: 280px;
        filter: drop-shadow(0 24px 48px rgba(0,0,0,.25));
      }
      .la-flask-svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      /* Слой «жидкости» — анимируем сдвиг вверх через transform */
      .la-liquid-rect {
        transform: translateY(0);
        transition: transform .65s cubic-bezier(.3,.9,.4,1);
        will-change: transform;
      }

      /* Пузырьки */
      .la-bubble {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
      }
      @keyframes laBubbleRise {
        0%   { transform: translate(0,0) scale(.5); opacity: .9; }
        100% { transform: translate(var(--dx,0), var(--dy,-100px)) scale(1); opacity: 0; }
      }

      /* Круговая волна при выплеске */
      .la-splash {
        position: fixed;
        top: 50%;
        left: 50%;
        width: 60px;
        height: 60px;
        margin-left: -30px;
        margin-top: -30px;
        border-radius: 50%;
        transform: scale(0);
        pointer-events: none;
        z-index: 99999;
        will-change: transform;
      }

      /* Заливка на весь экран (для дашборда) */
      .la-fill {
        position: fixed;
        inset: 0;
        z-index: 99999;
        pointer-events: none;
        transform: translateY(0);
        will-change: transform;
      }

      /* Тряска */
      @keyframes laShake {
        0%, 100% { transform: translateX(0); }
        15%      { transform: translateX(-10px); }
        30%      { transform: translateX(10px); }
        45%      { transform: translateX(-7px); }
        60%      { transform: translateX(7px); }
        75%      { transform: translateX(-3px); }
        90%      { transform: translateX(3px); }
      }
      .la-shake {
        animation: laShake .55s cubic-bezier(.36,.07,.19,.97);
      }
    `;
    document.head.appendChild(style);
  }

  // ═══ SVG колбы — с правильной заливкой через clipPath ═══
  function flaskSvg(role) {
    const c = COLORS[role] || COLORS.student;
    const clipId = 'la-flask-clip-' + role;

    // Контур колбы: горлышко сверху, расширяется вниз
    // Координаты: viewBox 0 0 100 130
    const flaskPath = 'M40 8 L40 40 L20 100 Q15 118 32 121 L68 121 Q85 118 80 100 L60 40 L60 8 Z';

    return `
      <svg class="la-flask-svg" viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="${clipId}">
            <path d="${flaskPath}"/>
          </clipPath>
          <linearGradient id="la-grad-${role}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stop-color="${c.light}"/>
            <stop offset="100%" stop-color="${c.main}"/>
          </linearGradient>
        </defs>

        <!-- Жидкость (обрезана по форме колбы) -->
        <!-- rect высотой 140, изначально сдвинут вниз на 145 (за пределами колбы) -->
        <g clip-path="url(#${clipId})">
          <rect class="la-liquid-rect"
                x="0" y="0" width="100" height="150"
                fill="url(#la-grad-${role})"
                style="transform: translateY(150px);"/>
        </g>

        <!-- Контур колбы (поверх жидкости) -->
        <path d="${flaskPath}" fill="none" stroke="${c.main}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>

        <!-- Горлышко — верхняя кромка -->
        <line x1="37" y1="8" x2="63" y2="8" stroke="${c.main}" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  // ═══ Анимация на логине ═══
  function playLoginAnim(opts) {
    // Поддержка обоих вариантов вызова: playLoginAnim({ role, redirect }) или playLoginAnim('tutor', 'url')
    let role, redirect;
    if (typeof opts === 'object' && opts !== null) {
      role = opts.role;
      redirect = opts.redirect;
    } else {
      role = arguments[0];
      redirect = arguments[1];
    }

    if (!role || !redirect) {
      console.error('[LoginAnim] playAndRedirect: нужны { role, redirect }');
      return;
    }

    injectStyles();
    const c = COLORS[role] || COLORS.student;

    // Оверлей + колба
    const overlay = document.createElement('div');
    overlay.className = 'la-overlay';
    document.body.appendChild(overlay);

    const flaskWrap = document.createElement('div');
    flaskWrap.className = 'la-flask-wrap';
    flaskWrap.innerHTML = flaskSvg(role);
    overlay.appendChild(flaskWrap);

    // Находим жидкость и анимируем её подъём
    const liquid = flaskWrap.querySelector('.la-liquid-rect');

    // Фаза 1: налив (700 мс)
    requestAnimationFrame(() => {
      // Сдвигаем жидкость вверх, чтобы она заполнила примерно 60% колбы
      liquid.style.transform = 'translateY(65px)';
    });

    // Пузырьки
    let bubbleTimer = setInterval(() => spawnBubble(flaskWrap, c), 70);
    setTimeout(() => clearInterval(bubbleTimer), 700);

    // Фаза 2: выплеск (после налива)
    setTimeout(() => {
      const splash = document.createElement('div');
      splash.className = 'la-splash';
      splash.style.background = `radial-gradient(circle, ${c.main} 40%, ${c.dark} 100%)`;
      document.body.appendChild(splash);

      void splash.offsetWidth;

      const diag = Math.hypot(window.innerWidth, window.innerHeight);
      const scale = (diag / 60) * 1.2;
      splash.style.transition = 'transform .6s cubic-bezier(.4,0,.2,1)';
      splash.style.transform = `scale(${scale})`;

      // Фаза 3: сохраняем флаг и редиректим
      setTimeout(() => {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ role, ts: Date.now() }));
        } catch (e) {}
        window.location.href = redirect;
      }, 620);
    }, 720);
  }

  function spawnBubble(parent, c) {
    const b = document.createElement('div');
    b.className = 'la-bubble';
    const size = 5 + Math.random() * 9;
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.background = c.light;
    b.style.left = (30 + Math.random() * 40) + '%';
    b.style.bottom = (25 + Math.random() * 25) + '%';
    b.style.setProperty('--dx', ((Math.random() - 0.5) * 40).toFixed(1) + 'px');
    b.style.setProperty('--dy', (-(70 + Math.random() * 50)).toFixed(1) + 'px');
    b.style.animation = 'laBubbleRise 1s ease-out forwards';
    parent.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }

  // ═══ Анимация на дашборде ═══
  function playWelcomeAnim() {
    let data = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) { return; }

    if (!data || !data.ts) return;
    if (Date.now() - data.ts > FRESH_MS) return;

    injectStyles();
    const c = COLORS[data.role] || COLORS.student;

    const fill = document.createElement('div');
    fill.className = 'la-fill';
    fill.style.background = `linear-gradient(180deg, ${c.main}, ${c.dark})`;
    document.body.appendChild(fill);

    document.body.style.overflow = 'hidden';

    // Через короткую паузу — стекание вниз
    setTimeout(() => {
      fill.style.transition = 'transform .8s cubic-bezier(.5,0,.3,1)';
      fill.style.transform = 'translateY(105%)';
      setTimeout(() => {
        fill.remove();
        document.body.style.overflow = '';
      }, 850);
    }, 120);
  }

  // ═══ Тряска формы ═══
  function shakeForm(elOrSelector) {
    injectStyles();
    const el = typeof elOrSelector === 'string'
      ? document.querySelector(elOrSelector)
      : elOrSelector;
    if (!el) return;
    el.classList.remove('la-shake');
    void el.offsetWidth;
    el.classList.add('la-shake');
    setTimeout(() => el.classList.remove('la-shake'), 600);
  }

  global.LoginAnim = {
    playAndRedirect: playLoginAnim,
    playWelcome: playWelcomeAnim,
    shakeForm
  };

})(window);