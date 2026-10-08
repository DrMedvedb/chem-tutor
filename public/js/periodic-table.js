/* public/js/periodic-table.js
   Универсальный модуль таблицы Менделеева.
   Экспорт: window.renderPeriodic(containerId)
   Использует общий tooltip #chem-tooltip.
*/

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════
  //  ДАННЫЕ: 118 элементов
  //  [num, sym, nameRu, nameEn, mass, year, who, category, x, y]
  // ═══════════════════════════════════════════════════
  const ELEMENTS = [
    [1,  'H',  'Водород',    'Hydrogen',      '1.008',  1766, 'Генри Кавендиш',         'nonmetal',   1,  1],
    [2,  'He', 'Гелий',      'Helium',        '4.0026', 1868, 'Пьер Жансен',            'noble',     18,  1],

    [3,  'Li', 'Литий',      'Lithium',       '6.94',   1817, 'Юхан Арфведсон',         'alkali',     1,  2],
    [4,  'Be', 'Бериллий',   'Beryllium',     '9.0122', 1798, 'Луи Воклен',             'alkaline',   2,  2],
    [5,  'B',  'Бор',        'Boron',         '10.81',  1808, 'Жозеф Гей-Люссак',       'metalloid', 13,  2],
    [6,  'C',  'Углерод',    'Carbon',        '12.011', '—',  'Известен с древности',   'nonmetal',  14,  2],
    [7,  'N',  'Азот',       'Nitrogen',      '14.007', 1772, 'Даниэль Резерфорд',      'nonmetal',  15,  2],
    [8,  'O',  'Кислород',   'Oxygen',        '15.999', 1774, 'Джозеф Пристли',         'nonmetal',  16,  2],
    [9,  'F',  'Фтор',       'Fluorine',      '18.998', 1886, 'Анри Муассан',           'halogen',   17,  2],
    [10, 'Ne', 'Неон',       'Neon',          '20.180', 1898, 'Уильям Рамзай',          'noble',     18,  2],

    [11, 'Na', 'Натрий',     'Sodium',        '22.990', 1807, 'Хэмфри Дэви',            'alkali',     1,  3],
    [12, 'Mg', 'Магний',     'Magnesium',     '24.305', 1755, 'Джозеф Блэк',            'alkaline',   2,  3],
    [13, 'Al', 'Алюминий',   'Aluminium',     '26.982', 1825, 'Ханс Эрстед',            'post-trans',13,  3],
    [14, 'Si', 'Кремний',    'Silicon',       '28.085', 1824, 'Йёнс Берцелиус',         'metalloid', 14,  3],
    [15, 'P',  'Фосфор',     'Phosphorus',    '30.974', 1669, 'Хенниг Бранд',           'nonmetal',  15,  3],
    [16, 'S',  'Сера',       'Sulfur',        '32.06',  '—',  'Известна с древности',   'nonmetal',  16,  3],
    [17, 'Cl', 'Хлор',       'Chlorine',      '35.45',  1774, 'Карл Шееле',             'halogen',   17,  3],
    [18, 'Ar', 'Аргон',      'Argon',         '39.948', 1894, 'Уильям Рамзай',          'noble',     18,  3],

    [19, 'K',  'Калий',      'Potassium',     '39.098', 1807, 'Хэмфри Дэви',            'alkali',     1,  4],
    [20, 'Ca', 'Кальций',    'Calcium',       '40.078', 1808, 'Хэмфри Дэви',            'alkaline',   2,  4],
    [21, 'Sc', 'Скандий',    'Scandium',      '44.956', 1879, 'Ларс Нильсон',           'transition', 3,  4],
    [22, 'Ti', 'Титан',      'Titanium',      '47.867', 1791, 'Уильям Грегор',          'transition', 4,  4],
    [23, 'V',  'Ванадий',    'Vanadium',      '50.942', 1801, 'Андрес дель Рио',        'transition', 5,  4],
    [24, 'Cr', 'Хром',       'Chromium',      '51.996', 1797, 'Луи Воклен',             'transition', 6,  4],
    [25, 'Mn', 'Марганец',   'Manganese',     '54.938', 1774, 'Юхан Ган',               'transition', 7,  4],
    [26, 'Fe', 'Железо',     'Iron',          '55.845', '—',  'Известно с древности',   'transition', 8,  4],
    [27, 'Co', 'Кобальт',    'Cobalt',        '58.933', 1735, 'Георг Брандт',           'transition', 9,  4],
    [28, 'Ni', 'Никель',     'Nickel',        '58.693', 1751, 'Аксель Кронстедт',       'transition',10,  4],
    [29, 'Cu', 'Медь',       'Copper',        '63.546', '—',  'Известна с древности',   'transition',11,  4],
    [30, 'Zn', 'Цинк',       'Zinc',          '65.38',  '—',  'Известен с древности',   'transition',12,  4],
    [31, 'Ga', 'Галлий',     'Gallium',       '69.723', 1875, 'Поль Лекок де Буабодран','post-trans',13,  4],
    [32, 'Ge', 'Германий',   'Germanium',     '72.630', 1886, 'Клеменс Винклер',        'metalloid', 14,  4],
    [33, 'As', 'Мышьяк',     'Arsenic',       '74.922', 1250, 'Альберт Великий',        'metalloid', 15,  4],
    [34, 'Se', 'Селен',      'Selenium',      '78.971', 1817, 'Йёнс Берцелиус',         'nonmetal',  16,  4],
    [35, 'Br', 'Бром',       'Bromine',       '79.904', 1826, 'Антуан Балар',           'halogen',   17,  4],
    [36, 'Kr', 'Криптон',    'Krypton',       '83.798', 1898, 'Уильям Рамзай',          'noble',     18,  4],

    [37, 'Rb', 'Рубидий',    'Rubidium',      '85.468', 1861, 'Роберт Бунзен',          'alkali',     1,  5],
    [38, 'Sr', 'Стронций',   'Strontium',     '87.62',  1790, 'Адэр Кроуфорд',          'alkaline',   2,  5],
    [39, 'Y',  'Иттрий',     'Yttrium',       '88.906', 1794, 'Юхан Гадолин',           'transition', 3,  5],
    [40, 'Zr', 'Цирконий',   'Zirconium',     '91.224', 1789, 'Мартин Клапрот',         'transition', 4,  5],
    [41, 'Nb', 'Ниобий',     'Niobium',       '92.906', 1801, 'Чарльз Хатчетт',         'transition', 5,  5],
    [42, 'Mo', 'Молибден',   'Molybdenum',    '95.95',  1778, 'Карл Шееле',             'transition', 6,  5],
    [43, 'Tc', 'Технеций',   'Technetium',    '98',     1937, 'Эмилио Сегре',           'transition', 7,  5],
    [44, 'Ru', 'Рутений',    'Ruthenium',     '101.07', 1844, 'Карл Клаус',             'transition', 8,  5],
    [45, 'Rh', 'Родий',      'Rhodium',       '102.91', 1803, 'Уильям Волластон',       'transition', 9,  5],
    [46, 'Pd', 'Палладий',   'Palladium',     '106.42', 1803, 'Уильям Волластон',       'transition',10,  5],
    [47, 'Ag', 'Серебро',    'Silver',        '107.87', '—',  'Известно с древности',   'transition',11,  5],
    [48, 'Cd', 'Кадмий',     'Cadmium',       '112.41', 1817, 'Фридрих Штромейер',      'transition',12,  5],
    [49, 'In', 'Индий',      'Indium',        '114.82', 1863, 'Фердинанд Райх',         'post-trans',13,  5],
    [50, 'Sn', 'Олово',      'Tin',           '118.71', '—',  'Известно с древности',   'post-trans',14,  5],
    [51, 'Sb', 'Сурьма',     'Antimony',      '121.76', '—',  'Известна с древности',   'metalloid', 15,  5],
    [52, 'Te', 'Теллур',     'Tellurium',     '127.60', 1782, 'Франц Мюллер',           'metalloid', 16,  5],
    [53, 'I',  'Иод',        'Iodine',        '126.90', 1811, 'Бернар Куртуа',          'halogen',   17,  5],
    [54, 'Xe', 'Ксенон',     'Xenon',         '131.29', 1898, 'Уильям Рамзай',          'noble',     18,  5],

    [55, 'Cs', 'Цезий',      'Caesium',       '132.91', 1860, 'Роберт Бунзен',          'alkali',     1,  6],
    [56, 'Ba', 'Барий',      'Barium',        '137.33', 1808, 'Хэмфри Дэви',            'alkaline',   2,  6],
    [57, 'La', 'Лантан',     'Lanthanum',     '138.91', 1839, 'Карл Мосандер',          'lanthanide', 3,  9],
    [58, 'Ce', 'Церий',      'Cerium',        '140.12', 1803, 'Йёнс Берцелиус',         'lanthanide', 4,  9],
    [59, 'Pr', 'Празеодим',  'Praseodymium',  '140.91', 1885, 'Карл Вельсбах',          'lanthanide', 5,  9],
    [60, 'Nd', 'Неодим',     'Neodymium',     '144.24', 1885, 'Карл Вельсбах',          'lanthanide', 6,  9],
    [61, 'Pm', 'Прометий',   'Promethium',    '145',    1945, 'Джейкоб Марински',       'lanthanide', 7,  9],
    [62, 'Sm', 'Самарий',    'Samarium',      '150.36', 1879, 'Поль Лекок де Буабодран','lanthanide', 8,  9],
    [63, 'Eu', 'Европий',    'Europium',      '151.96', 1901, 'Эжен Демарсе',           'lanthanide', 9,  9],
    [64, 'Gd', 'Гадолиний',  'Gadolinium',    '157.25', 1880, 'Жан де Мариньяк',        'lanthanide',10,  9],
    [65, 'Tb', 'Тербий',     'Terbium',       '158.93', 1843, 'Карл Мосандер',          'lanthanide',11,  9],
    [66, 'Dy', 'Диспрозий',  'Dysprosium',    '162.50', 1886, 'Поль Лекок де Буабодран','lanthanide',12,  9],
    [67, 'Ho', 'Гольмий',    'Holmium',       '164.93', 1878, 'Марк Делафонтен',        'lanthanide',13,  9],
    [68, 'Er', 'Эрбий',      'Erbium',        '167.26', 1843, 'Карл Мосандер',          'lanthanide',14,  9],
    [69, 'Tm', 'Тулий',      'Thulium',       '168.93', 1879, 'Пер Клеве',              'lanthanide',15,  9],
    [70, 'Yb', 'Иттербий',   'Ytterbium',     '173.05', 1878, 'Жан де Мариньяк',        'lanthanide',16,  9],
    [71, 'Lu', 'Лютеций',    'Lutetium',      '174.97', 1907, 'Жорж Урбен',             'lanthanide',17,  9],
    [72, 'Hf', 'Гафний',     'Hafnium',       '178.49', 1923, 'Дирк Костер',            'transition', 4,  6],
    [73, 'Ta', 'Тантал',     'Tantalum',      '180.95', 1802, 'Андерс Экеберг',         'transition', 5,  6],
    [74, 'W',  'Вольфрам',   'Tungsten',      '183.84', 1783, 'Хуан Элюяр',             'transition', 6,  6],
    [75, 'Re', 'Рений',      'Rhenium',       '186.21', 1925, 'Вальтер Ноддак',         'transition', 7,  6],
    [76, 'Os', 'Осмий',      'Osmium',        '190.23', 1803, 'Смитсон Теннант',        'transition', 8,  6],
    [77, 'Ir', 'Иридий',     'Iridium',       '192.22', 1803, 'Смитсон Теннант',        'transition', 9,  6],
    [78, 'Pt', 'Платина',    'Platinum',      '195.08', 1735, 'Антонио Ульоа',          'transition',10,  6],
    [79, 'Au', 'Золото',     'Gold',          '196.97', '—',  'Известно с древности',   'transition',11,  6],
    [80, 'Hg', 'Ртуть',      'Mercury',       '200.59', '—',  'Известна с древности',   'transition',12,  6],
    [81, 'Tl', 'Таллий',     'Thallium',      '204.38', 1861, 'Уильям Крукс',           'post-trans',13,  6],
    [82, 'Pb', 'Свинец',     'Lead',          '207.2',  '—',  'Известен с древности',   'post-trans',14,  6],
    [83, 'Bi', 'Висмут',     'Bismuth',       '208.98', 1753, 'Клод Жоффруа',           'post-trans',15,  6],
    [84, 'Po', 'Полоний',    'Polonium',      '209',    1898, 'Мария Кюри',             'post-trans',16,  6],
    [85, 'At', 'Астат',      'Astatine',      '210',    1940, 'Эмилио Сегре',           'halogen',   17,  6],
    [86, 'Rn', 'Радон',      'Radon',         '222',    1900, 'Фридрих Дорн',           'noble',     18,  6],

    [87, 'Fr', 'Франций',    'Francium',      '223',    1939, 'Маргарита Перей',        'alkali',     1,  7],
    [88, 'Ra', 'Радий',      'Radium',        '226',    1898, 'Мария Кюри',             'alkaline',   2,  7],
    [89, 'Ac', 'Актиний',    'Actinium',      '227',    1899, 'Андре Дебьерн',          'actinide',   3, 10],
    [90, 'Th', 'Торий',      'Thorium',       '232.04', 1829, 'Йёнс Берцелиус',         'actinide',   4, 10],
    [91, 'Pa', 'Протактиний','Protactinium',  '231.04', 1913, 'Казимир Фаянс',          'actinide',   5, 10],
    [92, 'U',  'Уран',       'Uranium',       '238.03', 1789, 'Мартин Клапрот',         'actinide',   6, 10],
    [93, 'Np', 'Нептуний',   'Neptunium',     '237',    1940, 'Эдвин Макмиллан',        'actinide',   7, 10],
    [94, 'Pu', 'Плутоний',   'Plutonium',     '244',    1940, 'Гленн Сиборг',           'actinide',   8, 10],
    [95, 'Am', 'Америций',   'Americium',     '243',    1944, 'Гленн Сиборг',           'actinide',   9, 10],
    [96, 'Cm', 'Кюрий',      'Curium',        '247',    1944, 'Гленн Сиборг',           'actinide',  10, 10],
    [97, 'Bk', 'Берклий',    'Berkelium',     '247',    1949, 'Гленн Сиборг',           'actinide',  11, 10],
    [98, 'Cf', 'Калифорний', 'Californium',   '251',    1950, 'Гленн Сиборг',           'actinide',  12, 10],
    [99, 'Es', 'Эйнштейний', 'Einsteinium',   '252',    1952, 'Альберт Гиорсо',         'actinide',  13, 10],
    [100,'Fm', 'Фермий',     'Fermium',       '257',    1952, 'Альберт Гиорсо',         'actinide',  14, 10],
    [101,'Md', 'Менделевий', 'Mendelevium',   '258',    1955, 'Альберт Гиорсо',         'actinide',  15, 10],
    [102,'No', 'Нобелий',    'Nobelium',      '259',    1958, 'Альберт Гиорсо',         'actinide',  16, 10],
    [103,'Lr', 'Лоуренсий',  'Lawrencium',    '266',    1961, 'Альберт Гиорсо',         'actinide',  17, 10],
    [104,'Rf', 'Резерфордий','Rutherfordium','267',    1964, 'Гленн Сиборг',           'transition', 4,  7],
    [105,'Db', 'Дубний',     'Dubnium',       '268',    1967, 'Гленн Сиборг',           'transition', 5,  7],
    [106,'Sg', 'Сиборгий',   'Seaborgium',    '269',    1974, 'Альберт Гиорсо',         'transition', 6,  7],
    [107,'Bh', 'Борий',      'Bohrium',       '270',    1981, 'Петер Армбрустер',       'transition', 7,  7],
    [108,'Hs', 'Хассий',     'Hassium',       '269',    1984, 'Петер Армбрустер',       'transition', 8,  7],
    [109,'Mt', 'Мейтнерий',  'Meitnerium',    '278',    1982, 'Петер Армбрустер',       'unknown',    9,  7],
    [110,'Ds', 'Дармштадтий','Darmstadtium',  '281',    1994, 'Петер Армбрустер',       'unknown',   10,  7],
    [111,'Rg', 'Рентгений',  'Roentgenium',   '282',    1994, 'Петер Армбрустер',       'unknown',   11,  7],
    [112,'Cn', 'Коперниций', 'Copernicium',   '285',    1996, 'Петер Армбрустер',       'transition',12,  7],
    [113,'Nh', 'Нихоний',    'Nihonium',      '286',    2004, 'Косукэ Морита',          'unknown',   13,  7],
    [114,'Fl', 'Флеровий',   'Flerovium',     '289',    1999, 'Юрий Оганесян',          'unknown',   14,  7],
    [115,'Mc', 'Московий',   'Moscovium',     '290',    2003, 'Юрий Оганесян',          'unknown',   15,  7],
    [116,'Lv', 'Ливерморий', 'Livermorium',   '293',    2000, 'Юрий Оганесян',          'unknown',   16,  7],
    [117,'Ts', 'Теннессин',  'Tennessine',    '294',    2010, 'Юрий Оганесян',          'halogen',   17,  7],
    [118,'Og', 'Оганесон',   'Oganesson',     '294',    2002, 'Юрий Оганесян',          'noble',     18,  7]
  ];

  // ═══════════════════════════════════════════════════
  //  РЕНДЕР
  // ═══════════════════════════════════════════════════

  function renderPeriodic(containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) {
      console.warn('renderPeriodic: контейнер #' + containerId + ' не найден');
      return;
    }

    const html = ELEMENTS.map(el => {
      const [num, sym, nameRu, nameEn, mass, year, who, cat, x, y] = el;
      const catClass = 'cat-' + cat;
      const massMini = String(mass).split('.')[0];

      return `
        <div class="p-el ${catClass}"
             style="grid-column: ${x}; grid-row: ${y};"
             data-num="${num}"
             data-sym="${sym}"
             data-name-ru="${nameRu}"
             data-name-en="${nameEn}"
             data-mass="${mass}"
             data-year="${year}"
             data-who="${who}">
          <span class="num">${num}</span>
          <span class="sym">${sym}</span>
          <span class="mass-mini">${massMini}</span>
        </div>
      `;
    }).join('');

    grid.innerHTML = html;

    // Навешиваем hover на каждый элемент
    grid.querySelectorAll('.p-el').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        showPeriodicTooltip(el, e);
      });
      el.addEventListener('mousemove', (e) => {
        positionTooltip(e);
      });
      el.addEventListener('mouseleave', () => {
        hideTooltip();
      });
    });
  }

  // ═══════════════════════════════════════════════════
  //  TOOLTIP
  // ═══════════════════════════════════════════════════

  function getTooltip() {
    return document.getElementById('chem-tooltip');
  }

  function positionTooltip(e) {
    const tt = getTooltip();
    if (!tt || !tt.classList.contains('show')) return;
    const x = e.clientX;
    const y = e.clientY;
    // небольшое смещение, чтобы не закрывать сам элемент
    tt.style.left = x + 'px';
    tt.style.top  = y + 'px';
  }

  function hideTooltip() {
    const tt = getTooltip();
    if (!tt) return;
    tt.classList.remove('show');
  }

  function showPeriodicTooltip(el, e) {
    const tt = getTooltip();
    if (!tt) return;

    const num = el.dataset.num;
    const sym = el.dataset.sym;
    const nameRu = el.dataset.nameRu;
    const nameEn = el.dataset.nameEn;
    const mass = el.dataset.mass;
    const year = el.dataset.year;
    const who = el.dataset.who;

    tt.innerHTML = `
      <div class="tt-head">
        <div class="tt-num">${num}</div>
        <div class="tt-sym">${sym}</div>
      </div>
      <div class="tt-names">
        <div class="tt-name-main">${nameRu}</div>
        <div class="tt-name-sub">${nameEn}</div>
      </div>
      <div class="tt-rows">
        <div class="tt-row">
          <span class="tt-lbl">Атомная масса</span>
          <span class="tt-val">${mass}</span>
        </div>
        <div class="tt-row">
          <span class="tt-lbl">Год открытия</span>
          <span class="tt-val">${year}</span>
        </div>
        <div class="tt-row">
          <span class="tt-lbl">Первооткрыватель</span>
          <span class="tt-val">${who}</span>
        </div>
      </div>
    `;

    tt.classList.add('show');
    positionTooltip(e);
  }

  // Экспортируем
  global.renderPeriodic = renderPeriodic;
  global.PeriodicData = ELEMENTS;

})(window);