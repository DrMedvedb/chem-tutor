/* public/js/molar-calc.js
   Химический калькулятор — 4 вкладки:
   1. ⚖️ Молярная масса
   2. 💧 Растворы
   3. 🔄 Разведение (C₁V₁ = C₂V₂)
   4. 🧮 Моль

   Публичное API:
     MolarCalc.init()          — навесить обработчики (вызывается автоматически)
     MolarCalc.open()          — открыть панель
     MolarCalc.close()         — закрыть панель
     MolarCalc.parse(formula)  — распарсить формулу → { elements, mass }
     MolarCalc.calcMolarMass() — молярная масса + разбор
     MolarCalc.solveSolution() — растворы
     MolarCalc.solveDilution() — разведение
     MolarCalc.solveMole()     — моль
*/

(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ═══════════════════════════════════════════════════
  //  ТАБЛИЦА АТОМНЫХ МАСС (г/моль)
  // ═══════════════════════════════════════════════════
  const ATOMIC_MASS = {
    H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011,
    N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305,
    Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948,
    K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
    Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
    Ga: 69.723, Ge: 72.630, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
    Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95,
    Tc: 98, Ru: 101.07, Rh: 102.91, Pd: 106.42, Ag: 107.87, Cd: 112.41,
    In: 114.82, Sn: 118.71, Sb: 121.76, Te: 127.60, I: 126.90, Xe: 131.29,
    Cs: 132.91, Ba: 137.33, La: 138.91, Ce: 140.12, Pr: 140.91, Nd: 144.24,
    Pm: 145, Sm: 150.36, Eu: 151.96, Gd: 157.25, Tb: 158.93, Dy: 162.50,
    Ho: 164.93, Er: 167.26, Tm: 168.93, Yb: 173.05, Lu: 174.97,
    Hf: 178.49, Ta: 180.95, W: 183.84, Re: 186.21, Os: 190.23, Ir: 192.22,
    Pt: 195.08, Au: 196.97, Hg: 200.59, Tl: 204.38, Pb: 207.2, Bi: 208.98,
    Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227, Th: 232.04,
    Pa: 231.04, U: 238.03, Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247,
    Cf: 251, Es: 252, Fm: 257, Md: 258, No: 259, Lr: 266,
    Rf: 267, Db: 268, Sg: 269, Bh: 270, Hs: 269, Mt: 278, Ds: 281,
    Rg: 282, Cn: 285, Nh: 286, Fl: 289, Mc: 290, Lv: 293, Ts: 294, Og: 294
  };

  // ═══════════════════════════════════════════════════
  //  ХЕЛПЕРЫ
  // ═══════════════════════════════════════════════════

  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function fmt(n, digits = 3) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs === 0) return '0';
    if (abs >= 1e6 || abs < 1e-3) {
      return n.toExponential(3).replace('e', '·10^');
    }
    return Number(n.toFixed(digits)).toString();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ═══════════════════════════════════════════════════
  //  ПАРСЕР ФОРМУЛ
  //  Поддерживает: H2O, Ca(OH)2, Al2(SO4)3, CuSO4·5H2O, Na2CO3·10H2O
  // ═══════════════════════════════════════════════════

  function parseFormula(input) {
    const formula = String(input || '').trim().replace(/\s+/g, '');
    if (!formula) throw new Error('Введите формулу');

    // Разбиваем по точкам-гидратам: · . * или x
    const parts = formula.split(/[·.*x](?=[A-Z0-9(])/i);

    const total = {};
    for (const part of parts) {
      const sub = parseSingleFormula(part);
      for (const [el, count] of Object.entries(sub)) {
        total[el] = (total[el] || 0) + count;
      }
    }

    let mass = 0;
    for (const [el, count] of Object.entries(total)) {
      if (!(el in ATOMIC_MASS)) {
        throw new Error(`Неизвестный элемент: ${el}`);
      }
      mass += ATOMIC_MASS[el] * count;
    }

    return { elements: total, mass };
  }

  function parseSingleFormula(str) {
    const stack = [{}];
    let i = 0;

    while (i < str.length) {
      const ch = str[i];

      if (ch === '(' || ch === '[') {
        stack.push({});
        i++;
      } else if (ch === ')' || ch === ']') {
        if (stack.length < 2) throw new Error('Несогласованные скобки');
        const group = stack.pop();
        i++;
        const numObj = readNumber(str, i);
        i = numObj.newIndex;
        const mult = numObj.value || 1;
        const parent = stack[stack.length - 1];
        for (const [el, count] of Object.entries(group)) {
          parent[el] = (parent[el] || 0) + count * mult;
        }
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i++;
        while (i < str.length && /[a-z]/.test(str[i])) {
          sym += str[i];
          i++;
        }
        const numObj = readNumber(str, i);
        i = numObj.newIndex;
        const count = numObj.value || 1;
        const top = stack[stack.length - 1];
        top[sym] = (top[sym] || 0) + count;
      } else if (/[0-9]/.test(ch)) {
        i++;
      } else {
        throw new Error(`Неожиданный символ: ${ch}`);
      }
    }

    if (stack.length !== 1) throw new Error('Несогласованные скобки');
    return stack[0];
  }

  function readNumber(str, i) {
    let numStr = '';
    while (i < str.length && /[0-9]/.test(str[i])) {
      numStr += str[i];
      i++;
    }
    return { value: numStr ? parseInt(numStr, 10) : 0, newIndex: i };
  }

  // ═══════════════════════════════════════════════════
  //  РАСЧЁТЫ
  // ═══════════════════════════════════════════════════

  // 1. Молярная масса
  function calcMolarMass(formula) {
    const { elements, mass } = parseFormula(formula);

    const breakdown = Object.entries(elements).map(([el, count]) => {
      const elMass = ATOMIC_MASS[el] * count;
      return {
        el,
        count,
        mass: elMass,
        pct: (elMass / mass) * 100
      };
    }).sort((a, b) => b.pct - a.pct);

    return { mass, breakdown };
  }

  // 2. Растворы — честное решение через цепочку связей
  // Связи:
  //   pct = m / ms * 100
  //   C   = m / (M · V)
  function solveSolution({ m, ms, V, C, M }) {
    m  = num(m);   // г
    ms = num(ms);  // г (масса раствора)
    V  = num(V);   // л
    C  = num(C);   // моль/л
    M  = num(M);   // г/моль

    const result = {};
    let changed = true;
    let iterations = 0;

    // Итеративно выводим всё, что можно (максимум 6 проходов)
    while (changed && iterations < 6) {
      changed = false;
      iterations++;

      // pct = m / ms * 100
      if (result.pct === undefined && m !== null && ms !== null && ms > 0) {
        result.pct = (m / ms) * 100;
        changed = true;
      }
      // m = pct / 100 * ms
      if (m === null && result.pct !== undefined && ms !== null) {
        m = (result.pct / 100) * ms;
        result.m = m;
        changed = true;
      }
      // ms = m / pct * 100
      if (ms === null && m !== null && result.pct !== undefined && result.pct > 0) {
        ms = (m / result.pct) * 100;
        result.ms = ms;
        changed = true;
      }

      // C = m / (M · V)
      if (result.C === undefined && m !== null && M !== null && V !== null && V > 0 && M > 0) {
        result.C = m / (M * V);
        changed = true;
      }
      // m = C · M · V
      if (m === null && result.C !== undefined && M !== null && V !== null) {
        m = result.C * M * V;
        result.m = m;
        changed = true;
      }
      // V = m / (C · M)
      if (V === null && m !== null && result.C !== undefined && M !== null && result.C > 0 && M > 0) {
        V = m / (result.C * M);
        result.V = V;
        changed = true;
      }
      // M = m / (C · V)
      if (M === null && m !== null && result.C !== undefined && V !== null && result.C > 0 && V > 0) {
        M = m / (result.C * V);
        result.M = M;
        changed = true;
      }

      // Если есть ms и m, но нет pct — уже посчитали выше
      // Дополнительно: если V и M есть, но нет C — тоже выше
    }

    return result;
  }

  // 3. Разведение C₁V₁ = C₂V₂
  function solveDilution({ C1, V1, C2, V2 }) {
    C1 = num(C1); V1 = num(V1); C2 = num(C2); V2 = num(V2);
    const given = [C1, V1, C2, V2].filter(x => x !== null).length;
    if (given < 3) throw new Error('Заполните любые 3 поля');

    const result = {};
    if (C2 === null) result.C2 = (C1 * V1) / V2;
    if (V2 === null) result.V2 = (C1 * V1) / C2;
    if (C1 === null) result.C1 = (C2 * V2) / V1;
    if (V1 === null) result.V1 = (C2 * V2) / C1;
    return result;
  }

  // 4. Моль
  function solveMole({ m, n, N, V, M }) {
    m = num(m); n = num(n); N = num(N); V = num(V); M = num(M);
    const NA = 6.02214076e23;
    const Vm = 22.4; // л/моль при н.у.

    const result = {};
    let changed = true;
    let iterations = 0;

    while (changed && iterations < 8) {
      changed = false;
      iterations++;

      // n = m / M
      if (n === null && m !== null && M !== null && M > 0) {
        n = m / M; result.n = n; changed = true;
      }
      // m = n · M
      if (m === null && n !== null && M !== null) {
        m = n * M; result.m = m; changed = true;
      }
      // M = m / n
      if (M === null && m !== null && n !== null && n > 0) {
        M = m / n; result.M = M; changed = true;
      }
      // N = n · NA
      if (N === null && n !== null) {
        N = n * NA; result.N = N; changed = true;
      }
      // n = N / NA
      if (n === null && N !== null) {
        n = N / NA; result.n = n; changed = true;
      }
      // V = n · Vm
      if (V === null && n !== null) {
        V = n * Vm; result.V = V; changed = true;
      }
      // n = V / Vm
      if (n === null && V !== null) {
        n = V / Vm; result.n = n; changed = true;
      }
      // V = (m / M) · Vm
      if (V === null && m !== null && M !== null && M > 0) {
        V = (m / M) * Vm; result.V = V; changed = true;
      }
      // m = V / Vm · M
      if (m === null && V !== null && M !== null) {
        m = (V / Vm) * M; result.m = m; changed = true;
      }
      // N = V / Vm · NA
      if (N === null && V !== null) {
        N = (V / Vm) * NA; result.N = N; changed = true;
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════
  //  UI
  // ═══════════════════════════════════════════════════

  let inited = false;

  function initMolarCalc() {
    if (inited) return;
    const overlay = document.getElementById('molar-overlay');
    const fab     = document.getElementById('molar-fab');
    const closeBtn = document.getElementById('molar-close');

    if (!overlay || !fab) {
      console.warn('[MolarCalc] Нет #molar-overlay или #molar-fab — калькулятор не активирован');
      return;
    }
    inited = true;

    // Открытие/закрытие
    fab.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // Вкладки
    $$('.molar-tab', overlay).forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.mtab;
        $$('.molar-tab', overlay).forEach(t => t.classList.toggle('active', t === tab));
        $$('.molar-pane', overlay).forEach(p => {
          p.classList.toggle('active', p.dataset.mtab === name);
        });
      });
    });

    // ─── Вкладка 1: Молярная масса ───
    const mmForm = document.getElementById('mm-form');
    mmForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('mm-formula');
      const out = document.getElementById('mm-result');
      try {
        const { mass, breakdown } = calcMolarMass(input.value);
        out.className = 'molar-result show';
        out.innerHTML = `
          <div class="molar-answer">${fmt(mass, 3)} г/моль</div>
          <div class="molar-answer-sub">Молярная масса ${escapeHtml(input.value.trim())}</div>
          <div class="molar-breakdown">
            ${breakdown.map(b => `
              <div class="molar-row">
                <span class="el">${b.el}${b.count > 1 ? '<sub>' + b.count + '</sub>' : ''}</span>
                <span class="mass">${fmt(b.mass, 3)} г</span>
                <span class="pct">${b.pct.toFixed(2)}%</span>
              </div>
            `).join('')}
          </div>
        `;
      } catch (err) {
        out.className = 'molar-result error show';
        out.textContent = '⚠ ' + err.message;
      }
    });

    // Быстрые примеры
    $$('#mm-examples .molar-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const inp = document.getElementById('mm-formula');
        inp.value = chip.textContent;
        inp.focus();
      });
    });

    // ─── Вкладка 2: Растворы ───
    // Автоподстановка M из формулы
    const solFormulaInput = document.getElementById('sol-formula');
    const solMInput = document.getElementById('sol-M');
    solFormulaInput?.addEventListener('input', () => {
      const val = solFormulaInput.value.trim();
      if (!val) return;
      try {
        const { mass } = parseFormula(val);
        solMInput.value = mass.toFixed(3);
      } catch (e) {
        // тихо игнорируем — пользователь ещё печатает
      }
    });

    const solForm = document.getElementById('sol-form');
    solForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = document.getElementById('sol-result');
      try {
        const payload = {
          m:  document.getElementById('sol-mass').value,
          ms: document.getElementById('sol-msolution').value,
          V:  document.getElementById('sol-volume').value,
          C:  document.getElementById('sol-molarity').value,
          M:  document.getElementById('sol-M').value
        };
        const given = Object.values(payload).filter(v => v && String(v).trim()).length;
        if (given < 3) throw new Error('Заполните минимум 3 поля');

        const res = solveSolution(payload);
        if (Object.keys(res).length === 0) throw new Error('Недостаточно данных для расчёта');

        out.className = 'molar-result show';
        let html = '<div class="molar-breakdown">';
        const labels = {
          m:  'Масса вещества (г)',
          ms: 'Масса раствора (г)',
          V:  'Объём (л)',
          C:  'Молярность (моль/л)',
          M:  'Молярная масса (г/моль)',
          pct: 'Массовая доля (%)'
        };

        for (const key of ['m', 'ms', 'V', 'C', 'M', 'pct']) {
          const inputEmpty = !payload[key] || !String(payload[key]).trim();
          if (inputEmpty && res[key] !== undefined) {
            html += `<div class="molar-row">
              <span class="el">${labels[key]}</span>
              <span class="val">${fmt(res[key], 4)}</span>
            </div>`;
          }
        }
        html += '</div>';
        out.innerHTML = '<div class="molar-answer-sub" style="margin-bottom:10px">Найдено:</div>' + html;
      } catch (err) {
        out.className = 'molar-result error show';
        out.textContent = '⚠ ' + err.message;
      }
    });

    // ─── Вкладка 3: Разведение ───
    const dilForm = document.getElementById('dil-form');
    dilForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = document.getElementById('dil-result');
      try {
        const payload = {
          C1: document.getElementById('dil-c1').value,
          V1: document.getElementById('dil-v1').value,
          C2: document.getElementById('dil-c2').value,
          V2: document.getElementById('dil-v2').value
        };
        const res = solveDilution(payload);

        out.className = 'molar-result show';
        let html = '<div class="molar-breakdown">';
        const labels = { C1: 'C₁ (моль/л)', V1: 'V₁ (мл или л)', C2: 'C₂ (моль/л)', V2: 'V₂ (мл или л)' };
        for (const key of ['C1','V1','C2','V2']) {
          const inputEmpty = !payload[key] || !String(payload[key]).trim();
          if (inputEmpty && res[key] !== undefined) {
            html += `<div class="molar-row">
              <span class="el">${labels[key]}</span>
              <span class="val">${fmt(res[key], 4)}</span>
            </div>`;
          }
        }
        html += '</div>';
        out.innerHTML = '<div class="molar-answer-sub" style="margin-bottom:10px">Найдено:</div>' + html;
      } catch (err) {
        out.className = 'molar-result error show';
        out.textContent = '⚠ ' + err.message;
      }
    });

    // ─── Вкладка 4: Моль ───
    const molForm = document.getElementById('mol-form');
    molForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = document.getElementById('mol-result');
      try {
        const payload = {
          m: document.getElementById('mol-mass').value,
          M: document.getElementById('mol-M').value,
          n: document.getElementById('mol-n').value,
          N: document.getElementById('mol-N').value,
          V: document.getElementById('mol-V').value
        };
        const given = Object.values(payload).filter(v => v && String(v).trim()).length;
        if (given < 2) throw new Error('Заполните минимум 2 поля');

        const res = solveMole(payload);
        if (Object.keys(res).length === 0) throw new Error('Недостаточно данных для расчёта');

        out.className = 'molar-result show';
        let html = '<div class="molar-breakdown">';
        const labels = {
          m: 'Масса (г)',
          M: 'Молярная масса (г/моль)',
          n: 'Количество (моль)',
          N: 'Частиц',
          V: 'Объём газа при н.у. (л)'
        };
        for (const key of ['m', 'M', 'n', 'N', 'V']) {
          const inputEmpty = !payload[key] || !String(payload[key]).trim();
          if (inputEmpty && res[key] !== undefined) {
            const val = key === 'N' ? Number(res[key]).toExponential(3) : fmt(res[key], 4);
            html += `<div class="molar-row">
              <span class="el">${labels[key]}</span>
              <span class="val">${val}</span>
            </div>`;
          }
        }
        html += '</div>';
        out.innerHTML = '<div class="molar-answer-sub" style="margin-bottom:10px">Найдено:</div>' + html;
      } catch (err) {
        out.className = 'molar-result error show';
        out.textContent = '⚠ ' + err.message;
      }
    });
  }

  function open() {
    const overlay = document.getElementById('molar-overlay');
    overlay?.classList.add('open');
    setTimeout(() => {
      document.getElementById('mm-formula')?.focus();
    }, 100);
  }

  function close() {
    const overlay = document.getElementById('molar-overlay');
    overlay?.classList.remove('open');
  }

  // ═══════════════════════════════════════════════════
  //  ЭКСПОРТ + АВТОИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════════════════

  window.MolarCalc = {
    init: initMolarCalc,
    open,
    close,
    parse: parseFormula,
    calcMolarMass,
    solveSolution,
    solveDilution,
    solveMole
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMolarCalc);
  } else {
    initMolarCalc();
  }
})();