/* public/js/solubility-table.js
   Интерактивная таблица растворимости.
   Экспорт: window.renderSolubility(containerId)
   Использует общий tooltip #chem-tooltip.
*/

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════
  //  ДАННЫЕ
  // ═══════════════════════════════════════════════════

  // Катионы (заголовки сверху)
  const CATIONS = [
    { sym: 'H⁺',    label: 'H⁺',     charge: '1+' },
    { sym: 'K⁺',    label: 'K⁺',     charge: '1+' },
    { sym: 'Na⁺',   label: 'Na⁺',    charge: '1+' },
    { sym: 'NH₄⁺',  label: 'NH₄⁺',   charge: '1+' },
    { sym: 'Li⁺',   label: 'Li⁺',    charge: '1+' },
    { sym: 'Ag⁺',   label: 'Ag⁺',    charge: '1+' },
    { sym: 'Ba²⁺',  label: 'Ba²⁺',   charge: '2+' },
    { sym: 'Ca²⁺',  label: 'Ca²⁺',   charge: '2+' },
    { sym: 'Mg²⁺',  label: 'Mg²⁺',   charge: '2+' },
    { sym: 'Fe²⁺',  label: 'Fe²⁺',   charge: '2+' },
    { sym: 'Cu²⁺',  label: 'Cu²⁺',   charge: '2+' },
    { sym: 'Zn²⁺',  label: 'Zn²⁺',   charge: '2+' },
    { sym: 'Pb²⁺',  label: 'Pb²⁺',   charge: '2+' },
    { sym: 'Al³⁺',  label: 'Al³⁺',   charge: '3+' },
    { sym: 'Fe³⁺',  label: 'Fe³⁺',   charge: '3+' }
  ];

  // Анионы (заголовки слева)
  const ANIONS = [
    { sym: 'OH⁻',   label: 'OH⁻' },
    { sym: 'F⁻',    label: 'F⁻' },
    { sym: 'Cl⁻',   label: 'Cl⁻' },
    { sym: 'Br⁻',   label: 'Br⁻' },
    { sym: 'I⁻',    label: 'I⁻' },
    { sym: 'S²⁻',   label: 'S²⁻' },
    { sym: 'SO₃²⁻', label: 'SO₃²⁻' },
    { sym: 'SO₄²⁻', label: 'SO₄²⁻' },
    { sym: 'NO₃⁻',  label: 'NO₃⁻' },
    { sym: 'PO₄³⁻', label: 'PO₄³⁻' },
    { sym: 'CO₃²⁻', label: 'CO₃²⁻' },
    { sym: 'SiO₃²⁻',label: 'SiO₃²⁻' },
    { sym: 'CH₃COO⁻', label: 'CH₃COO⁻' }
  ];

  // Матрица: строки = анионы, столбцы = катионы.
  // Каждая ячейка: { p: 'Р'|'М'|'Н'|'—'|'↑'|'↓', color: 'white'|'yellow'|..., note: '...' }
  // p: Р — растворимо, М — малорастворимо, Н — нерастворимо, — — не существует, ↑ — газ, ↓ — осадок
  // color — цвет осадка, note — короткое пояснение

  // Порядок столбцов:  H  K  Na  NH4  Li  Ag  Ba  Ca  Mg  Fe2  Cu  Zn  Pb  Al  Fe3
  const MATRIX = {
    'OH⁻': [
      { p: 'Р' },                            // HOH (вода)
      { p: 'Р' },                            // KOH
      { p: 'Р' },                            // NaOH
      { p: 'Р', note: 'Раствор аммиака' },   // NH4OH
      { p: 'Р' },                            // LiOH
      { p: '—', note: 'AgOH не существует, распадается на Ag₂O' },
      { p: 'М', color: 'white', note: 'Белый осадок' },  // Ba(OH)2
      { p: 'М', color: 'white', note: 'Белый осадок' },  // Ca(OH)2
      { p: 'Н', color: 'white', note: 'Белый осадок' },  // Mg(OH)2
      { p: 'Н', color: 'green', note: 'Зелёный осадок' },// Fe(OH)2
      { p: 'Н', color: 'blue',  note: 'Синий осадок' },  // Cu(OH)2
      { p: 'Н', color: 'white', note: 'Белый осадок' },  // Zn(OH)2
      { p: 'Н', color: 'white', note: 'Белый осадок' },  // Pb(OH)2
      { p: 'Н', color: 'white', note: 'Белый студенистый' }, // Al(OH)3
      { p: 'Н', color: 'brown', note: 'Бурый осадок' }   // Fe(OH)3
    ],
    'F⁻': [
      { p: 'Р', note: 'Плавиковая кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р', note: 'Хорошо растворим' },
      { p: 'М', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'М', color: 'green', note: 'Зелёный осадок' },
      { p: 'Р', color: 'blue',  note: 'Синий раствор' },
      { p: 'Р' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'brown' }
    ],
    'Cl⁻': [
      { p: 'Р', note: 'Соляная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'white', note: 'Белый творожистый' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'М', color: 'white', note: 'Белый осадок' },
      { p: 'Р' }, { p: 'Р' }
    ],
    'Br⁻': [
      { p: 'Р', note: 'Бромоводородная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'yellow', note: 'Желтоватый осадок' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'М', color: 'white' },
      { p: 'Р' }, { p: 'Р' }
    ],
    'I⁻': [
      { p: 'Р', note: 'Иодоводородная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'yellow', note: 'Жёлтый осадок' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'yellow', note: 'Жёлтый осадок' },
      { p: 'Р' }, { p: 'Р' }
    ],
    'S²⁻': [
      { p: '↑', note: 'H₂S — газ с запахом тухлых яиц' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'black', note: 'Чёрный осадок' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'black', note: 'Чёрный осадок' },
      { p: 'Н', color: 'black', note: 'Чёрный осадок' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'black', note: 'Чёрный осадок' },
      { p: '—', note: 'Al₂S₃ разлагается водой' },
      { p: '—', note: 'Fe₂S₃ разлагается' }
    ],
    'SO₃²⁻': [
      { p: '↑', note: 'SO₂ выделяется' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'green' },
      { p: 'Н', color: 'blue' },  { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'brown' }
    ],
    'SO₄²⁻': [
      { p: 'Р', note: 'Серная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'М', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'white', note: 'Белый осадок, нерастворим' },
      { p: 'М', color: 'white', note: 'Белый осадок' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'Р' }, { p: 'Р' }
    ],
    'NO₃⁻': [
      { p: 'Р', note: 'Азотная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }
    ],
    'PO₄³⁻': [
      { p: 'Р', note: 'Ортофосфорная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'yellow', note: 'Жёлтый осадок' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'green' },
      { p: 'Н', color: 'blue' },  { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'brown' }
    ],
    'CO₃²⁻': [
      { p: '↑', note: 'CO₂ выделяется' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Н', color: 'yellow', note: 'Желтоватый осадок' },
      { p: 'Н', color: 'white', note: 'Белый осадок' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'green' }, { p: 'Н', color: 'blue' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: '—' }, { p: '—' }
    ],
    'SiO₃²⁻': [
      { p: 'Н', color: 'white', note: 'Кремниевая кислота' },
      { p: 'Р' }, { p: 'Р' },
      { p: '—', note: 'Не существует' },
      { p: 'Р' },
      { p: 'Н', color: 'yellow' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'green' },
      { p: 'Н', color: 'blue' },  { p: 'Н', color: 'white' },
      { p: 'Н', color: 'white' }, { p: 'Н', color: 'white' },
      { p: 'Н', color: 'brown' }
    ],
    'CH₃COO⁻': [
      { p: 'Р', note: 'Уксусная кислота' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р', note: 'Хорошо растворим' },
      { p: 'Р' }, { p: 'Р' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р', color: 'blue' }, { p: 'Р' }, { p: 'Р' },
      { p: 'Р' }, { p: 'Р' }
    ]
  };

  // ═══════════════════════════════════════════════════
  //  ХЕЛПЕРЫ
  // ═══════════════════════════════════════════════════

  // Формула вещества по катиону и аниону — упрощённая, но узнаваемая
  function buildFormula(cation, anion) {
    // Особые случаи
    if (anion === 'OH⁻') {
      if (cation === 'H⁺')  return 'H₂O';
      if (cation === 'NH₄⁺') return 'NH₄OH';
      return cation.replace('⁺', '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '') + 'OH';
    }
    if (anion === 'NO₃⁻') {
      return cation.replace('⁺', '') + 'NO₃';
    }
    if (anion === 'Cl⁻')  return cation.replace('⁺','') + 'Cl';
    if (anion === 'Br⁻')  return cation.replace('⁺','') + 'Br';
    if (anion === 'I⁻')   return cation.replace('⁺','') + 'I';
    if (anion === 'F⁻')   return cation.replace('⁺','') + 'F';
    if (anion === 'S²⁻') {
      return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, '') + 'S';
    }
    if (anion === 'SO₄²⁻') return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,'') + 'SO₄';
    if (anion === 'SO₃²⁻') return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,'') + 'SO₃';
    if (anion === 'CO₃²⁻') return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,'') + 'CO₃';
    if (anion === 'PO₄³⁻') return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,'') + 'PO₄';
    if (anion === 'SiO₃²⁻') return cation.replace('⁺','').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g,'') + 'SiO₃';
    if (anion === 'CH₃COO⁻') return cation.replace('⁺','') + 'CH₃COO';
    return cation + anion;
  }

  // Свойство → класс CSS
  function pToClass(p) {
    if (p === 'Р') return 'solvable';
    if (p === 'М') return 'sparingly';
    if (p === 'Н') return 'insoluble';
    if (p === '↑') return 'gas';
    if (p === '—') return 'decompose';
    return 'unknown';
  }

  // Свойство → русская расшифровка
  function pToText(p) {
    if (p === 'Р') return 'Растворимо';
    if (p === 'М') return 'Малорастворимо';
    if (p === 'Н') return 'Нерастворимо';
    if (p === '↑') return 'Газ / улетучивается';
    if (p === '—') return 'Не существует / разлагается';
    return 'Неизвестно';
  }

  // Цвет осадка → русское название + css-цвет
  function colorInfo(color) {
    const map = {
      white:  { name: 'Белый',    css: '#f5f5f5' },
      yellow: { name: 'Жёлтый',   css: '#ffd84a' },
      orange: { name: 'Оранжевый',css: '#ff9b3d' },
      red:    { name: 'Красный',  css: '#e0435c' },
      brown:  { name: 'Бурый',    css: '#8b5a2b' },
      green:  { name: 'Зелёный',  css: '#4ecb71' },
      blue:   { name: 'Синий',    css: '#4a90e2' },
      black:  { name: 'Чёрный',   css: '#1a1a2e' },
      gray:   { name: 'Серый',    css: '#9a9ab0' },
      pink:   { name: 'Розовый',  css: '#ff8fc8' }
    };
    return map[color] || null;
  }

  // ═══════════════════════════════════════════════════
  //  РЕНДЕР
  // ═══════════════════════════════════════════════════

  function renderSolubility(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) {
      console.warn('renderSolubility: контейнер #' + containerId + ' не найден');
      return;
    }

    const cols = CATIONS.length + 1; // +1 для угла
    const rows = ANIONS.length + 1;  // +1 для угла

    let html = `<div class="solubility-grid" style="grid-template-columns: repeat(${cols}, minmax(60px, 1fr));">`;

    // Угловая ячейка
    html += `<div class="sol-cell sol-corner">
      <div>катион ↓</div>
      <div>анион →</div>
    </div>`;

    // Верхний ряд — катионы
    CATIONS.forEach(c => {
      html += `<div class="sol-cell sol-header">
        <div>${c.label}</div>
        <div class="charge">${c.charge}</div>
      </div>`;
    });

    // Строки — анионы + ячейки
    ANIONS.forEach((a, rowIdx) => {
      // Заголовок аниона
      html += `<div class="sol-cell sol-header accent">
        <div>${a.label}</div>
      </div>`;

      CATIONS.forEach((c, colIdx) => {
        const cell = (MATRIX[a.sym] && MATRIX[a.sym][colIdx]) || { p: 'Р' };
        const pClass = pToClass(cell.p);
        const dotHtml = cell.color
          ? `<span class="sol-dot ${cell.color}"></span>`
          : '';

        html += `<div class="sol-cell ${pClass}"
                      data-anion="${a.sym}"
                      data-cation="${c.sym}"
                      data-p="${cell.p}"
                      data-color="${cell.color || ''}"
                      data-note="${(cell.note || '').replace(/"/g, '&quot;')}">
          <div>${cell.p}</div>
          ${dotHtml}
        </div>`;
      });
    });

    html += '</div>';

    // Легенда
    html += `
      <div class="sol-legend">
        <div class="sol-legend-item"><div class="sol-legend-chip solvable"></div> Р — растворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip sparingly"></div> М — малорастворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip insoluble"></div> Н — нерастворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip gas"></div> ↑ — газ</div>
        <div class="sol-legend-item"><div class="sol-legend-chip decompose"></div> — — не существует</div>
        <div class="sol-legend-item">🔵 — цвет осадка</div>
      </div>
    `;

    wrap.innerHTML = html;

    // Навешиваем обработчики на ячейки с реактивами (не заголовки, не угол)
    wrap.querySelectorAll('.sol-cell').forEach(cell => {
      if (cell.classList.contains('sol-header') || cell.classList.contains('sol-corner')) return;

      cell.addEventListener('mouseenter', (e) => {
        showSolubilityTooltip(cell, e);
      });
      cell.addEventListener('mousemove', (e) => {
        positionTooltip(e);
      });
      cell.addEventListener('mouseleave', () => {
        hideTooltip();
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  TOOLTIP (тот же #chem-tooltip)
  // ═══════════════════════════════════════════════════

  function getTooltip() {
    return document.getElementById('chem-tooltip');
  }

  function positionTooltip(e) {
    const tt = getTooltip();
    if (!tt || !tt.classList.contains('show')) return;
    tt.style.left = e.clientX + 'px';
    tt.style.top  = e.clientY + 'px';
  }

  function hideTooltip() {
    const tt = getTooltip();
    if (!tt) return;
    tt.classList.remove('show');
  }

  function showSolubilityTooltip(cell, e) {
    const tt = getTooltip();
    if (!tt) return;

    const anion = cell.dataset.anion;
    const cation = cell.dataset.cation;
    const p = cell.dataset.p;
    const color = cell.dataset.color;
    const note = cell.dataset.note || '';

    const formula = buildFormula(cation, anion);
    const pClass = pToClass(p);
    const pText = pToText(p);
    const colorObj = color ? colorInfo(color) : null;

    let colorBlock = '';
    if (colorObj) {
      colorBlock = `
        <div class="tt-color-info">
          <div class="tt-color-circle" style="background:${colorObj.css};"></div>
          <div>
            <div class="tt-color-name">${colorObj.name} осадок</div>
            <div class="tt-color-sub">Цвет выпадающего осадка</div>
          </div>
        </div>
      `;
    }

    let noteBlock = '';
    if (note) {
      noteBlock = `<div class="tt-note">💡 ${note}</div>`;
    }

    tt.innerHTML = `
      <div class="tt-head">
        <div class="tt-formula">${formula}</div>
      </div>
      <div class="tt-names">
        <div class="tt-name-main">${cation} + ${anion}</div>
        <div class="tt-name-sub">Катион + анион</div>
      </div>
      <div class="tt-rows">
        <div class="tt-row">
          <span class="tt-lbl">Свойство</span>
          <span class="tt-val">
            <span class="tt-badge ${pClass}">${p} — ${pText}</span>
          </span>
        </div>
      </div>
      ${colorBlock}
      ${noteBlock}
    `;

    tt.classList.add('show');
    positionTooltip(e);
  }

  // Экспортируем
  global.renderSolubility = renderSolubility;
  global.SolubilityData = { CATIONS, ANIONS, MATRIX };

})(window);