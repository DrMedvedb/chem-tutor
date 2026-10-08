/* public/js/cheatsheet.js
   Модуль шпаргалок в тесте.
   - Плавающие кнопки справа: Периодическая система + Растворимость
   - Открывает overlay с затемнением поверх теста
   - Таблицы СТАТИЧНЫЕ (без тултипов)
   - У растворимости — подсветка строки/столбца при наведении
*/

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  //  ДАННЫЕ: 118 ЭЛЕМЕНТОВ
  //  [num, sym, mass, category, x, y]
  // ═══════════════════════════════════════════════════════
  const ELEMENTS = [
    [1,'H','1.008','nonmetal',1,1],      [2,'He','4.003','noble',18,1],

    [3,'Li','6.94','alkali',1,2],        [4,'Be','9.012','alkaline',2,2],
    [5,'B','10.81','metalloid',13,2],    [6,'C','12.011','nonmetal',14,2],
    [7,'N','14.007','nonmetal',15,2],    [8,'O','15.999','nonmetal',16,2],
    [9,'F','18.998','halogen',17,2],     [10,'Ne','20.180','noble',18,2],

    [11,'Na','22.990','alkali',1,3],     [12,'Mg','24.305','alkaline',2,3],
    [13,'Al','26.982','post-trans',13,3],[14,'Si','28.085','metalloid',14,3],
    [15,'P','30.974','nonmetal',15,3],   [16,'S','32.06','nonmetal',16,3],
    [17,'Cl','35.45','halogen',17,3],    [18,'Ar','39.948','noble',18,3],

    [19,'K','39.098','alkali',1,4],      [20,'Ca','40.078','alkaline',2,4],
    [21,'Sc','44.956','transition',3,4], [22,'Ti','47.867','transition',4,4],
    [23,'V','50.942','transition',5,4],  [24,'Cr','51.996','transition',6,4],
    [25,'Mn','54.938','transition',7,4], [26,'Fe','55.845','transition',8,4],
    [27,'Co','58.933','transition',9,4], [28,'Ni','58.693','transition',10,4],
    [29,'Cu','63.546','transition',11,4], [30,'Zn','65.38','transition',12,4],
    [31,'Ga','69.723','post-trans',13,4],[32,'Ge','72.630','metalloid',14,4],
    [33,'As','74.922','metalloid',15,4], [34,'Se','78.971','nonmetal',16,4],
    [35,'Br','79.904','halogen',17,4],   [36,'Kr','83.798','noble',18,4],

    [37,'Rb','85.468','alkali',1,5],     [38,'Sr','87.62','alkaline',2,5],
    [39,'Y','88.906','transition',3,5],  [40,'Zr','91.224','transition',4,5],
    [41,'Nb','92.906','transition',5,5], [42,'Mo','95.95','transition',6,5],
    [43,'Tc','98','transition',7,5],     [44,'Ru','101.07','transition',8,5],
    [45,'Rh','102.91','transition',9,5], [46,'Pd','106.42','transition',10,5],
    [47,'Ag','107.87','transition',11,5], [48,'Cd','112.41','transition',12,5],
    [49,'In','114.82','post-trans',13,5],[50,'Sn','118.71','post-trans',14,5],
    [51,'Sb','121.76','metalloid',15,5], [52,'Te','127.60','metalloid',16,5],
    [53,'I','126.90','halogen',17,5],    [54,'Xe','131.29','noble',18,5],

    [55,'Cs','132.91','alkali',1,6],     [56,'Ba','137.33','alkaline',2,6],
    [57,'La','138.91','lanthanide',3,9], [58,'Ce','140.12','lanthanide',4,9],
    [59,'Pr','140.91','lanthanide',5,9], [60,'Nd','144.24','lanthanide',6,9],
    [61,'Pm','145','lanthanide',7,9],    [62,'Sm','150.36','lanthanide',8,9],
    [63,'Eu','151.96','lanthanide',9,9], [64,'Gd','157.25','lanthanide',10,9],
    [65,'Tb','158.93','lanthanide',11,9],[66,'Dy','162.50','lanthanide',12,9],
    [67,'Ho','164.93','lanthanide',13,9],[68,'Er','167.26','lanthanide',14,9],
    [69,'Tm','168.93','lanthanide',15,9],[70,'Yb','173.05','lanthanide',16,9],
    [71,'Lu','174.97','lanthanide',17,9],
    [72,'Hf','178.49','transition',4,6], [73,'Ta','180.95','transition',5,6],
    [74,'W','183.84','transition',6,6],  [75,'Re','186.21','transition',7,6],
    [76,'Os','190.23','transition',8,6], [77,'Ir','192.22','transition',9,6],
    [78,'Pt','195.08','transition',10,6],[79,'Au','196.97','transition',11,6],
    [80,'Hg','200.59','transition',12,6],[81,'Tl','204.38','post-trans',13,6],
    [82,'Pb','207.2','post-trans',14,6], [83,'Bi','208.98','post-trans',15,6],
    [84,'Po','209','post-trans',16,6],   [85,'At','210','halogen',17,6],
    [86,'Rn','222','noble',18,6],

    [87,'Fr','223','alkali',1,7],        [88,'Ra','226','alkaline',2,7],
    [89,'Ac','227','actinide',3,10],     [90,'Th','232.04','actinide',4,10],
    [91,'Pa','231.04','actinide',5,10],  [92,'U','238.03','actinide',6,10],
    [93,'Np','237','actinide',7,10],     [94,'Pu','244','actinide',8,10],
    [95,'Am','243','actinide',9,10],     [96,'Cm','247','actinide',10,10],
    [97,'Bk','247','actinide',11,10],    [98,'Cf','251','actinide',12,10],
    [99,'Es','252','actinide',13,10],    [100,'Fm','257','actinide',14,10],
    [101,'Md','258','actinide',15,10],   [102,'No','259','actinide',16,10],
    [103,'Lr','266','actinide',17,10],
    [104,'Rf','267','transition',4,7],   [105,'Db','268','transition',5,7],
    [106,'Sg','269','transition',6,7],   [107,'Bh','270','transition',7,7],
    [108,'Hs','269','transition',8,7],   [109,'Mt','278','unknown',9,7],
    [110,'Ds','281','unknown',10,7],     [111,'Rg','282','unknown',11,7],
    [112,'Cn','285','transition',12,7],  [113,'Nh','286','unknown',13,7],
    [114,'Fl','289','unknown',14,7],     [115,'Mc','290','unknown',15,7],
    [116,'Lv','293','unknown',16,7],     [117,'Ts','294','halogen',17,7],
    [118,'Og','294','noble',18,7]
  ];

  // ═══════════════════════════════════════════════════════
  //  ДАННЫЕ: РАСТВОРИМОСТЬ
  // ═══════════════════════════════════════════════════════
  const CATIONS = ['H⁺','K⁺','Na⁺','NH₄⁺','Li⁺','Ag⁺','Ba²⁺','Ca²⁺','Mg²⁺','Fe²⁺','Cu²⁺','Zn²⁺','Pb²⁺','Al³⁺','Fe³⁺'];
  const CATION_CHARGES = ['1+','1+','1+','1+','1+','1+','2+','2+','2+','2+','2+','2+','2+','3+','3+'];
  const ANIONS = ['OH⁻','F⁻','Cl⁻','Br⁻','I⁻','S²⁻','SO₃²⁻','SO₄²⁻','NO₃⁻','PO₄³⁻','CO₃²⁻','SiO₃²⁻','CH₃COO⁻'];

  // Свойства: массив строк, каждая = одна строка аниона (13 значений для 15 катионов)
  // Р — растворимо, М — малорастворимо, Н — нерастворимо, — — не существует, ↑ — газ
  const PROPS = {
    'OH⁻':    ['Р','Р','Р','Р','Р','—','М','М','Н','Н','Н','Н','Н','Н','Н'],
    'F⁻':     ['Р','Р','Р','Р','Р','Р','М','Н','Н','М','Р','Р','Н','Н','Н'],
    'Cl⁻':    ['Р','Р','Р','Р','Р','Н','Р','Р','Р','Р','Р','Р','М','Р','Р'],
    'Br⁻':    ['Р','Р','Р','Р','Р','Н','Р','Р','Р','Р','Р','Р','М','Р','Р'],
    'I⁻':     ['Р','Р','Р','Р','Р','Н','Р','Р','Р','Р','Р','Р','Н','Р','Р'],
    'S²⁻':    ['↑','Р','Р','Р','Р','Н','Р','Р','Р','Н','Н','Н','Н','—','—'],
    'SO₃²⁻':  ['↑','Р','Р','Р','Р','Н','Н','Н','Н','Н','Н','Н','Н','Н','Н'],
    'SO₄²⁻':  ['Р','Р','Р','Р','Р','М','Н','М','Р','Р','Р','Р','Н','Р','Р'],
    'NO₃⁻':   ['Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р'],
    'PO₄³⁻':  ['Р','Р','Р','Р','Р','Н','Н','Н','Н','Н','Н','Н','Н','Н','Н'],
    'CO₃²⁻':  ['↑','Р','Р','Р','Р','Н','Н','Н','Н','Н','Н','Н','Н','—','—'],
    'SiO₃²⁻': ['Н','Р','Р','—','Р','Н','Н','Н','Н','Н','Н','Н','Н','Н','Н'],
    'CH₃COO⁻':['Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р','Р']
  };

  // Цвета осадков: matrix[anion][cationIdx] = 'white'|'yellow'|...|null
  const COLORS = {
    'OH⁻':    [null,null,null,null,null,null,'white','white','white','green','blue','white','white','white','brown'],
    'F⁻':     [null,null,null,null,null,null,'white','white','white','green','blue',null,'white','white','brown'],
    'Cl⁻':    [null,null,null,null,null,'white',null,null,null,null,null,null,'white',null,null],
    'Br⁻':    [null,null,null,null,null,'yellow',null,null,null,null,null,null,'white',null,null],
    'I⁻':     [null,null,null,null,null,'yellow',null,null,null,null,null,null,'yellow',null,null],
    'S²⁻':    [null,null,null,null,null,'black',null,null,null,'black','black','white','black',null,null],
    'SO₃²⁻':  [null,null,null,null,null,'white','white','white','white','green','blue','white','white','white','brown'],
    'SO₄²⁻':  [null,null,null,null,null,'white','white','white',null,null,null,null,'white',null,null],
    'NO₃⁻':   [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
    'PO₄³⁻':  [null,null,null,null,null,'yellow','white','white','white','green','blue','white','white','white','brown'],
    'CO₃²⁻':  [null,null,null,null,null,'yellow','white','white','white','green','blue','white','white',null,null],
    'SiO₃²⁻': ['white',null,null,null,null,'yellow','white','white','white','green','blue','white','white','white','brown'],
    'CH₃COO⁻':[null,null,null,null,null,null,null,null,null,null,'blue',null,null,null,null]
  };

  // Формулы: matrix[anion][cationIdx] = 'формула'
  const FORMULAS = {
    'OH⁻':    ['H₂O','KOH','NaOH','NH₄OH','LiOH','—','Ba(OH)₂','Ca(OH)₂','Mg(OH)₂','Fe(OH)₂','Cu(OH)₂','Zn(OH)₂','Pb(OH)₂','Al(OH)₃','Fe(OH)₃'],
    'F⁻':     ['HF','KF','NaF','NH₄F','LiF','AgF','BaF₂','CaF₂','MgF₂','FeF₂','CuF₂','ZnF₂','PbF₂','AlF₃','FeF₃'],
    'Cl⁻':    ['HCl','KCl','NaCl','NH₄Cl','LiCl','AgCl','BaCl₂','CaCl₂','MgCl₂','FeCl₂','CuCl₂','ZnCl₂','PbCl₂','AlCl₃','FeCl₃'],
    'Br⁻':    ['HBr','KBr','NaBr','NH₄Br','LiBr','AgBr','BaBr₂','CaBr₂','MgBr₂','FeBr₂','CuBr₂','ZnBr₂','PbBr₂','AlBr₃','FeBr₃'],
    'I⁻':     ['HI','KI','NaI','NH₄I','LiI','AgI','BaI₂','CaI₂','MgI₂','FeI₂','CuI₂','ZnI₂','PbI₂','AlI₃','FeI₃'],
    'S²⁻':    ['H₂S','K₂S','Na₂S','(NH₄)₂S','Li₂S','Ag₂S','BaS','CaS','MgS','FeS','CuS','ZnS','PbS','Al₂S₃','Fe₂S₃'],
    'SO₃²⁻':  ['H₂SO₃','K₂SO₃','Na₂SO₃','(NH₄)₂SO₃','Li₂SO₃','Ag₂SO₃','BaSO₃','CaSO₃','MgSO₃','FeSO₃','CuSO₃','ZnSO₃','PbSO₃','Al₂(SO₃)₃','Fe₂(SO₃)₃'],
    'SO₄²⁻':  ['H₂SO₄','K₂SO₄','Na₂SO₄','(NH₄)₂SO₄','Li₂SO₄','Ag₂SO₄','BaSO₄','CaSO₄','MgSO₄','FeSO₄','CuSO₄','ZnSO₄','PbSO₄','Al₂(SO₄)₃','Fe₂(SO₄)₃'],
    'NO₃⁻':   ['HNO₃','KNO₃','NaNO₃','NH₄NO₃','LiNO₃','AgNO₃','Ba(NO₃)₂','Ca(NO₃)₂','Mg(NO₃)₂','Fe(NO₃)₂','Cu(NO₃)₂','Zn(NO₃)₂','Pb(NO₃)₂','Al(NO₃)₃','Fe(NO₃)₃'],
    'PO₄³⁻':  ['H₃PO₄','K₃PO₄','Na₃PO₄','(NH₄)₃PO₄','Li₃PO₄','Ag₃PO₄','Ba₃(PO₄)₂','Ca₃(PO₄)₂','Mg₃(PO₄)₂','Fe₃(PO₄)₂','Cu₃(PO₄)₂','Zn₃(PO₄)₂','Pb₃(PO₄)₂','AlPO₄','FePO₄'],
    'CO₃²⁻':  ['H₂CO₃','K₂CO₃','Na₂CO₃','(NH₄)₂CO₃','Li₂CO₃','Ag₂CO₃','BaCO₃','CaCO₃','MgCO₃','FeCO₃','CuCO₃','ZnCO₃','PbCO₃','Al₂(CO₃)₃','Fe₂(CO₃)₃'],
    'SiO₃²⁻': ['H₂SiO₃','K₂SiO₃','Na₂SiO₃','—','Li₂SiO₃','Ag₂SiO₃','BaSiO₃','CaSiO₃','MgSiO₃','FeSiO₃','CuSiO₃','ZnSiO₃','PbSiO₃','Al₂(SiO₃)₃','Fe₂(SiO₃)₃'],
    'CH₃COO⁻':['CH₃COOH','CH₃COOK','CH₃COONa','CH₃COONH₄','CH₃COOLi','CH₃COOAg','(CH₃COO)₂Ba','(CH₃COO)₂Ca','(CH₃COO)₂Mg','(CH₃COO)₂Fe','(CH₃COO)₂Cu','(CH₃COO)₂Zn','(CH₃COO)₂Pb','(CH₃COO)₃Al','(CH₃COO)₃Fe']
  };

  // ═══════════════════════════════════════════════════════
  //  ХЕЛПЕРЫ
  // ═══════════════════════════════════════════════════════

  function pToClass(p) {
    if (p === 'Р') return 'solvable';
    if (p === 'М') return 'sparingly';
    if (p === 'Н') return 'insoluble';
    if (p === '↑') return 'gas';
    if (p === '—') return 'decompose';
    return 'unknown';
  }

  // ═══════════════════════════════════════════════════════
  //  РЕНДЕР ПЕРИОДИЧЕСКОЙ СИСТЕМЫ (статичная)
  // ═══════════════════════════════════════════════════════

  function renderStaticPeriodic(container) {
    let html = '';
    ELEMENTS.forEach(el => {
      const [num, sym, mass, cat, x, y] = el;
      const massMini = String(mass).split('.')[0];
      html += `
        <div class="cheat-p-el cat-${cat}" style="grid-column: ${x}; grid-row: ${y};">
          <span class="num">${num}</span>
          <span class="sym">${sym}</span>
          <span class="mass-mini">${massMini}</span>
        </div>
      `;
    });
    container.innerHTML = `<div class="cheat-periodic-grid">${html}</div>`;
  }

  // ═══════════════════════════════════════════════════════
  //  РЕНДЕР РАСТВОРИМОСТИ (статичная, с подсветкой)
  // ═══════════════════════════════════════════════════════

  function renderStaticSolubility(container) {
    const cols = CATIONS.length + 1;

    let html = `<div class="cheat-sol-grid" style="grid-template-columns: repeat(${cols}, minmax(64px, 1fr));">`;

    // Угол
    html += `<div class="cheat-sol-cell cheat-corner" data-col="0" data-row="0">
      <div>катион ↓</div>
      <div>анион →</div>
    </div>`;

    // Заголовки-катионы (первая строка)
    CATIONS.forEach((c, idx) => {
      html += `<div class="cheat-sol-cell cheat-header" data-col="${idx + 1}" data-row="0">
        <div>${c}</div>
        <div class="charge">${CATION_CHARGES[idx]}</div>
      </div>`;
    });

    // Строки — анионы + ячейки
    ANIONS.forEach((a, rIdx) => {
      const rowIdx = rIdx + 1;

      html += `<div class="cheat-sol-cell cheat-header accent" data-col="0" data-row="${rowIdx}">
        <div>${a}</div>
      </div>`;

      const props    = PROPS[a] || [];
      const colors   = COLORS[a] || [];
      const formulas = FORMULAS[a] || [];

      CATIONS.forEach((c, cIdx) => {
        const p = props[cIdx] || 'Р';
        const color = colors[cIdx];
        const formula = formulas[cIdx] || '';
        const pClass = pToClass(p);
        const dotHtml = color ? `<span class="sol-dot ${color}"></span>` : '';

        html += `<div class="cheat-sol-cell ${pClass}"
                      data-col="${cIdx + 1}"
                      data-row="${rowIdx}">
          <div class="sol-p">${p}</div>
          ${formula ? `<div class="sol-formula">${formula}</div>` : ''}
          ${dotHtml}
        </div>`;
      });
    });

    html += '</div>';

    // Легенда
    html += `
      <div class="sol-legend" style="margin-top:18px">
        <div class="sol-legend-item"><div class="sol-legend-chip solvable"></div> Р — растворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip sparingly"></div> М — малорастворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip insoluble"></div> Н — нерастворимо</div>
        <div class="sol-legend-item"><div class="sol-legend-chip gas"></div> ↑ — газ</div>
        <div class="sol-legend-item"><div class="sol-legend-chip decompose"></div> — — не существует</div>
        <div class="sol-legend-item">🔵 — цвет осадка</div>
      </div>
    `;

    container.innerHTML = html;

    // ── Подсветка строки/столбца ──
    const grid = container.querySelector('.cheat-sol-grid');
    const cells = grid.querySelectorAll('.cheat-sol-cell');

    function clearHighlight() {
      cells.forEach(c => c.classList.remove('hl-row', 'hl-col'));
    }

    cells.forEach(cell => {
      cell.addEventListener('mouseenter', () => {
        const col = cell.dataset.col;
        const row = cell.dataset.row;
        clearHighlight();
        cells.forEach(c => {
          if (c.dataset.col === col) c.classList.add('hl-col');
          if (c.dataset.row === row) c.classList.add('hl-row');
        });
      });
    });

    grid.addEventListener('mouseleave', clearHighlight);
  }

  // ═══════════════════════════════════════════════════════
  //  ЛОГИКА OVERLAY
  // ═══════════════════════════════════════════════════════

  const overlay = document.getElementById('cheat-overlay');
  const overlayTitle = document.getElementById('cheat-title');
  const overlayBody = document.getElementById('cheat-body');
  const overlayClose = document.getElementById('cheat-close');
  const fabPeriodic = document.getElementById('fab-periodic');
  const fabSolubility = document.getElementById('fab-solubility');
  const fabWrap = document.getElementById('cheat-fab-wrap');

  let rendered = { periodic: false, solubility: false };

  function openCheat(type) {
    if (!overlay) return;

    if (type === 'periodic') {
      overlayTitle.textContent = '⚛️ Периодическая система';
      if (!rendered.periodic) {
        overlayBody.innerHTML = '';
        renderStaticPeriodic(overlayBody);
        rendered.periodic = true;
      }
    } else if (type === 'solubility') {
      overlayTitle.textContent = '💧 Таблица растворимости';
      if (!rendered.solubility) {
        overlayBody.innerHTML = '';
        renderStaticSolubility(overlayBody);
        rendered.solubility = true;
      }
    }
    overlay.classList.add('open');
  }

  function closeCheat() {
    if (!overlay) return;
    overlay.classList.remove('open');
  }

  // Кнопки-шпаргалки
  if (fabPeriodic)   fabPeriodic.addEventListener('click', () => openCheat('periodic'));
  if (fabSolubility) fabSolubility.addEventListener('click', () => openCheat('solubility'));

  // Крестик
  if (overlayClose) overlayClose.addEventListener('click', closeCheat);

  // Клик по фону overlay
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCheat();
    });
  }

  // Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
      closeCheat();
    }
  });

  // ═══════════════════════════════════════════════════════
  //  ЭКСПОРТ
  // ═══════════════════════════════════════════════════════

  window.Cheatsheet = {
    show: () => { if (fabWrap) fabWrap.style.display = ''; },
    hide: () => { if (fabWrap) fabWrap.style.display = 'none'; },
    open: openCheat,
    close: closeCheat
  };

})();