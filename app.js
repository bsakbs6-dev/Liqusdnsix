/* FloryMine Minecraft Store Application - Official DeluxeMenus Server Ranks */

// Global State
let soundEnabled = true;
let currentNick = "";
let activeCategory = "all";
let selectedProduct = null;
let selectedQuantity = 1;
let currentDiscount = 0;
let appliedPromo = "";

// Web Audio API Synthesizer
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    initAudio();
    const now = audioCtx.currentTime;

    if (type === 'click') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'success') {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.3);
      });
    }
  } catch (e) {}
}

function toggleAudio() {
  soundEnabled = !soundEnabled;
  const icon = document.getElementById('soundIcon');
  if (soundEnabled) {
    if (icon) icon.setAttribute('data-lucide', 'volume-2');
    showToast('Звуки включены', '✓');
    playSound('click');
  } else {
    if (icon) icon.setAttribute('data-lucide', 'volume-x');
    showToast('Звуки выключены', '✕');
  }
  lucide.createIcons();
}

// Products Database with EXACT DeluxeMenus & Server Ranks (Dynamic & Fallback)
let dynamicPromoCodes = [];
let productsData = {
  privileges: [
    {
      id: "warrior",
      name: "Воин",
      icon: "⚔️",
      image: "images/warrior.jpg",
      color: "from-slate-600 to-zinc-500",
      borderColor: "border-slate-500/40",
      price: 79,
      badge: "Старт",
      perks: [
        "Точки дома: 2 точки",
        "Количество приватов: 4 региона",
        "Слотов на аукционе: 4 предмета",
        "Стартовый кит-набор (/kit Воин)",
        "Режим АФК и игнорирование (/afk, /ignore, /sit)",
        "Префикс в табе, чате и над головой",
        "Уникальная роль в Discord-сервере"
      ]
    },
    {
      id: "berserk",
      name: "Берсерк",
      icon: "🔥",
      image: "images/berserk.jpg",
      color: "from-orange-600 to-amber-500",
      borderColor: "border-orange-500/40",
      price: 159,
      badge: "Огонь",
      perks: [
        "Точки дома: 3 точки",
        "Количество приватов: 5 регионов",
        "Слотов на аукционе: 6 предметов",
        "Кит-набор Берсерка (/kit Берсек)",
        "Кормление игроков (/feed ник)",
        "Установка и удаление варпов (/setwarp, /delwarp)",
        "Виртуальный Эндер-сундук и поза лежа (/ec, /lay)",
        "Все возможности рангов ниже"
      ]
    },
    {
      id: "spartan",
      name: "Спартанец",
      icon: "🛡️",
      image: "images/spartan.jpg",
      color: "from-lime-600 to-emerald-500",
      borderColor: "border-lime-500/40",
      price: 359,
      badge: "Защитник",
      perks: [
        "Точки дома: 4 точки",
        "Количество приватов: 6 регионов",
        "Слотов на аукционе: 8 предметов",
        "Кит-набор Спартанца (/kit Спартанец)",
        "Лечение игроков и тушение (/heal ник, /ext)",
        "Починка предметов в руках (/repair)",
        "Возврат на место смерти и суицид (/back, /suicide)",
        "Все возможности рангов ниже"
      ]
    },
    {
      id: "knight",
      name: "Рыцарь",
      icon: "⚡",
      image: "images/knight.jpg",
      color: "from-yellow-500 to-amber-400",
      borderColor: "border-yellow-400/50",
      price: 579,
      badge: "Топ выбор",
      perks: [
        "Точки дома: 5 точек",
        "Количество приватов: 7 регионов",
        "Слотов на аукционе: 10 предметов",
        "Кит-набор Рыцаря (/kit Рыцарь)",
        "Поиск игроков рядом (/near)",
        "Персональное время и погода (/ptime, /pweather)",
        "Баланс игроков и верстак (/checkbalance ник, /workbench)",
        "Все возможности рангов ниже"
      ]
    },
    {
      id: "lord",
      name: "Лорд",
      icon: "🔮",
      image: "images/lord.jpg",
      color: "from-purple-600 to-indigo-500",
      borderColor: "border-purple-500/50",
      price: 899,
      badge: "Элита",
      perks: [
        "Точки дома: 6 точек",
        "Количество приватов: 8 регионов",
        "Слотов на аукционе: 10 предметов",
        "Кит-набор Лорда (/kit Лорд)",
        "Виртуальная наковальня (/anvil)",
        "Полная починка всего инвентаря (/repair all)",
        "Прыжок в точку взгляда (/jump)",
        "Объявления на весь сервер (/bc)",
        "Скрытие баланса (/checkbalance on|off)",
        "Все возможности рангов ниже"
      ]
    },
    {
      id: "vladyka",
      name: "Владыка",
      icon: "👑",
      image: "images/vladyka.jpg",
      color: "from-amber-600 via-orange-600 to-yellow-500",
      borderColor: "border-amber-500/60",
      price: 1249,
      badge: "ХИТ ПРОДАЖ",
      perks: [
        "Точки дома: 8 точек",
        "Количество приватов: 10 регионов",
        "Слотов на аукционе: 12 предметов",
        "Основной и дополнительный киты (/kit Владыка, /kit +)",
        "Режим бесконечного полета (/fly)",
        "Просмотр инвентаря игроков (/invsee ник)",
        "Переименование предметов (/rename)",
        "Все возможности рангов ниже"
      ]
    },
    {
      id: "emperor",
      name: "Император",
      icon: "💎",
      image: "images/emperor.jpg",
      color: "from-amber-500 via-yellow-400 to-orange-500",
      borderColor: "border-yellow-500/70",
      price: 1799,
      badge: "МАКСИМУМ",
      perks: [
        "Точки дома: 10 точек",
        "Количество приватов: 12 регионов",
        "Слотов на аукционе: 16 предметов",
        "Кит-набор Императора + Все киты сервера (/kit Император, /kit +)",
        "МОМЕНТАЛЬНАЯ телепортация без задержек",
        "Доступ в закрытый чат персонала (/sc [сообщение])",
        "Полноценная связь с модерацией сервера",
        "Все возможности и команды сервера"
      ]
    }
  ],
  cases: [
    {
      id: "case_donate_1",
      name: "Донат Кейс x1",
      icon: "📦",
      image: "images/case_donate_1.png",
      color: "from-amber-600 to-yellow-500",
      borderColor: "border-amber-500/40",
      price: 119,
      badge: "x1",
      perks: [
        "1 Ключ от Донат Кейса",
        "Дроп привилегий от Воина до Владыки",
        "100% окупаемость при открытии",
        "Мгновенное начисление на сервере"
      ]
    },
    {
      id: "case_donate_3",
      name: "Донат Кейс x3",
      icon: "📦",
      image: "images/case_donate_3.png",
      color: "from-amber-600 to-yellow-500",
      borderColor: "border-amber-500/40",
      price: 300,
      badge: "x3",
      perks: [
        "3 Ключа от Донат Кейса со скидкой",
        "Дроп привилегий от Воина до Владыки",
        "Высокий шанс выбить высшие ранги",
        "Мгновенное начисление на сервере"
      ]
    },
    {
      id: "case_donate_10",
      name: "Донат Кейс x10",
      icon: "👑",
      image: "images/case_donate_10.png",
      color: "from-amber-500 to-orange-500",
      borderColor: "border-amber-500/50",
      price: 890,
      badge: "x10",
      perks: [
        "10 Ключей от Донат Кейса (Оптом)",
        "Дроп привилегий от Воина до Владыки",
        "Максимальная выгода и шанс на Владыку",
        "Гарантированный крупный куш"
      ]
    },
    {
      id: "case_tokens_1",
      name: "Кейс с Жетонами x1",
      icon: "🪙",
      image: "images/case_tokens_1.png",
      color: "from-yellow-600 to-amber-500",
      borderColor: "border-yellow-500/40",
      price: 39,
      badge: "x1",
      perks: [
        "1 Ключ от Кейса с Жетонами",
        "Дроп от 25 до 2 500 Жетонов",
        "Быстрое зачисление валюты",
        "Мгновенное открытие на сервере"
      ]
    },
    {
      id: "case_tokens_5",
      name: "Кейс с Жетонами x5",
      icon: "🪙",
      image: "images/case_tokens_5.png",
      color: "from-yellow-600 to-amber-500",
      borderColor: "border-yellow-500/40",
      price: 150,
      badge: "x5",
      perks: [
        "5 Ключей от Кейса с Жетонами",
        "Экономия при покупке набором",
        "Дроп тысяч жетонов на баланс",
        "Мгновенное открытие на сервере"
      ]
    },
    {
      id: "case_tokens_15",
      name: "Кейс с Жетонами x15",
      icon: "💎",
      image: "images/case_tokens_15.png",
      color: "from-amber-500 to-yellow-400",
      borderColor: "border-amber-500/50",
      price: 375,
      badge: "x15",
      perks: [
        "15 Ключей от Кейса с Жетонами (Мега-пак)",
        "Максимальный шанс сорвать Джекпот",
        "Крупнейший набор для быстрой прокачки",
        "Мгновенное открытие на сервере"
      ]
    }
  ],
  currency: [
    {
      id: "tokens_50",
      name: "50 Жетонов",
      icon: "🪙",
      image: "images/tokens_50.png",
      color: "from-yellow-500 to-amber-400",
      borderColor: "border-yellow-500/30",
      price: 50,
      badge: "50 Жетонов",
      perks: [
        "50 Жетонов на игровой баланс",
        "Покупка уникальных товаров на спавне",
        "Моментальное авто-зачисление"
      ]
    },
    {
      id: "tokens_100",
      name: "100 Жетонов",
      icon: "🪙",
      image: "images/tokens_100.png",
      color: "from-yellow-500 to-amber-400",
      borderColor: "border-yellow-500/30",
      price: 89,
      badge: "100 Жетонов",
      perks: [
        "100 Жетонов на игровой баланс",
        "Стартовый пакет со скидкой",
        "Моментальное авто-зачисление"
      ]
    },
    {
      id: "tokens_500",
      name: "500 Жетонов",
      icon: "💰",
      image: "images/tokens_500.png",
      color: "from-amber-500 to-yellow-400",
      borderColor: "border-amber-500/40",
      price: 399,
      badge: "500 Жетонов",
      perks: [
        "500 Жетонов на игровой баланс",
        "Хватит на лучшую экипировку и ресурсы",
        "Моментальное авто-зачисление"
      ]
    },
    {
      id: "tokens_1000",
      name: "1 000 Жетонов",
      icon: "💰",
      image: "images/tokens_1000.png",
      color: "from-amber-500 to-orange-500",
      borderColor: "border-amber-500/40",
      price: 849,
      badge: "1000 Жетонов",
      perks: [
        "1 000 Жетонов на игровой баланс",
        "Крупный пакет валюты по выгодной цене",
        "Моментальное авто-зачисление"
      ]
    },
    {
      id: "tokens_5000",
      name: "5 000 Жетонов",
      icon: "💎",
      image: "images/tokens_5000.png",
      color: "from-yellow-500 to-amber-500",
      borderColor: "border-yellow-500/50",
      badge: "5000 Жетонов",
      price: 4699,
      perks: [
        "5 000 Жетонов на игровой баланс",
        "Премиальный запас для любого игрока",
        "Моментальное авто-зачисление"
      ]
    },
    {
      id: "tokens_10000",
      name: "10 000 Жетонов",
      icon: "👑",
      image: "images/tokens_10000.png",
      color: "from-amber-400 to-yellow-300",
      borderColor: "border-amber-400/60",
      price: 7500,
      badge: "10000 Жетонов",
      perks: [
        "10 000 Жетонов на игровой баланс",
        "Максимальный банк и статус миллионера",
        "Моментальное авто-зачисление"
      ]
    }
  ],
  services: [
    {
      id: "srv_unban",
      name: "Разбан",
      icon: "🔓",
      image: "images/unban.jpg",
      color: "from-amber-600 to-orange-500",
      borderColor: "border-amber-500/30",
      price: 199,
      badge: "Снятие бана",
      perks: [
        "Снятие блокировки на сервере FloryMine",
        "Снимает любые временные баны",
        "Не снимает вечные блокировки (навсегда)",
        "Моментальная авто-разблокировка"
      ]
    },
    {
      id: "srv_unmute",
      name: "Размут",
      icon: "💬",
      image: "images/unmute.jpg",
      color: "from-yellow-600 to-amber-500",
      borderColor: "border-yellow-500/30",
      price: 59,
      badge: "Снятие мута",
      perks: [
        "Снятие блокировки игрового чата",
        "Снимает любые временные муты",
        "Не снимает вечные блокировки чата",
        "Моментальная авто-разблокировка"
      ]
    }
  ]
};

// Switch Category
function switchCategory(cat) {
  activeCategory = cat;
  playSound('click');
  document.querySelectorAll('.cat-tab').forEach(el => {
    el.className = "cat-tab px-3 sm:px-5 py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm text-gray-400 hover:text-white transition flex items-center gap-1.5 shrink-0";
  });
  const activeBtn = document.getElementById(`tab-${cat}`);
  if (activeBtn) {
    activeBtn.className = "cat-tab px-3 sm:px-5 py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]";
  }
  renderProducts();
}

// Render Products Grid
function renderProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;
  
  let items = [];
  if (activeCategory === 'all') {
    // Collect all items across all registered categories
    const allCategories = Object.values(productsData || {});
    items = allCategories.flat().filter(Boolean);
  } else {
    items = (productsData && productsData[activeCategory]) ? productsData[activeCategory] : [];
  }
  
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-gray-500 text-sm font-medium">
        В этой категории пока нет товаров.
      </div>
    `;
    return;
  }
  
  container.innerHTML = items.map(item => {
    const perksList = (Array.isArray(item.perks) && item.perks.length > 0)
      ? item.perks
      : ["Мгновенное начисление на сервере", "100% гарантия доставки", "Навсегда без сгорания"];
    
    return `
    <div class="product-card group relative bg-gradient-to-b from-[#0f1422] to-[#0a0d16] border ${item.borderColor || 'border-amber-500/30'} rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col justify-between shadow-xl overflow-hidden hover:border-amber-500/60 hover:shadow-[0_0_30px_rgba(245,158,11,0.2)] transition-all duration-300">
      <div class="absolute -top-12 -right-12 w-28 h-28 bg-gradient-to-br ${item.color || 'from-amber-600 to-yellow-500'} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity pointer-events-none"></div>
      
      <div>
        <!-- Rounded Image Card Banner with Overlay Badges -->
        <div class="relative w-full aspect-[16/11] sm:aspect-[4/3] rounded-xl sm:rounded-2xl overflow-hidden mb-3.5 sm:mb-4 bg-gray-950 border border-gray-800/80 group-hover:border-amber-500/40 transition-all shadow-inner">
          <img src="${item.image || 'images/vladyka.jpg'}" alt="${item.name}" class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out" loading="lazy" />
          <div class="absolute inset-0 bg-gradient-to-t from-[#0a0d16] via-black/10 to-black/40 pointer-events-none"></div>
          
          <!-- Badges Overlay -->
          <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
            <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 flex items-center justify-center text-lg sm:text-xl shadow-lg">
              ${item.icon || '📦'}
            </div>
            <span class="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-amber-500/40 text-amber-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider shadow-lg">
              ${item.badge || 'VIP'}
            </span>
          </div>
        </div>

        <h3 class="font-brand font-black text-lg sm:text-xl text-white tracking-wide mb-1.5 group-hover:text-amber-400 transition-colors flex items-center justify-between">
          <span>${item.name}</span>
        </h3>

        <ul class="space-y-1 sm:space-y-1.5 my-3 sm:my-4 text-[11px] sm:text-xs text-gray-300">
          ${perksList.slice(0, 3).map(p => `
            <li class="flex items-center gap-1.5">
              <span class="text-amber-400 font-bold">✓</span>
              <span class="truncate">${p}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <div class="pt-3 sm:pt-4 border-t border-gray-800/80">
        <div class="flex items-baseline justify-between mb-3">
          <div>
            <span class="text-xl sm:text-2xl font-black font-brand text-white">${item.price} ₽</span>
          </div>
          <span class="text-[10px] sm:text-[11px] text-amber-400 font-semibold">Навсегда</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button onclick="openDetailsModal('${item.id}')" class="py-2 sm:py-2.5 px-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs transition text-center active:scale-95">
            Инфо
          </button>
          <button onclick="openCheckout('${item.id}')" class="py-2 sm:py-2.5 px-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-brand font-black text-[11px] sm:text-xs uppercase tracking-wider transition text-center shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95">
            Купить
          </button>
        </div>
      </div>
    </div>
    `;
  }).join('');

  lucide.createIcons();
}

function findProduct(id) {
  for (let cat in productsData) {
    const found = (productsData[cat] || []).find(p => p.id === id);
    if (found) return found;
  }
  return null;
}

// Details Modal
function openDetailsModal(id) {
  const item = findProduct(id);
  if (!item) return;
  playSound('click');

  document.getElementById('detailsIconBox').innerHTML = item.icon || '📦';
  document.getElementById('detailsTitle').innerText = item.name;
  document.getElementById('detailsPrice').innerText = `${item.price} ₽`;
  
  const imgEl = document.getElementById('detailsImage');
  if (imgEl) {
    if (item.image) {
      imgEl.src = item.image;
      imgEl.classList.remove('hidden');
    } else {
      imgEl.classList.add('hidden');
    }
  }

  const perkBox = document.getElementById('detailsPerks');
  if (perkBox) {
    const perksList = (Array.isArray(item.perks) && item.perks.length > 0)
      ? item.perks
      : ["Мгновенное начисление на сервере", "100% гарантия доставки", "Навсегда без сгорания"];
    
    perkBox.innerHTML = perksList.map(p => `
      <li class="flex items-start gap-2 bg-gray-950/60 p-2.5 rounded-xl border border-gray-800/80">
        <span class="text-amber-400 font-bold shrink-0 mt-0.5">✓</span>
        <span class="text-xs text-gray-200 font-medium leading-relaxed">${p}</span>
      </li>
    `).join('');
  }

  document.getElementById('detailsBuyBtn').onclick = () => {
    closeDetailsModal();
    openCheckout(id);
  };

  const modal = document.getElementById('detailsModal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
  }, 10);
  lucide.createIcons();
}

function closeDetailsModal() {
  playSound('click');
  const modal = document.getElementById('detailsModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

// Checkout Modal
function openCheckout(id) {
  const item = findProduct(id);
  if (!item) return;
  playSound('click');
  selectedProduct = item;
  selectedQuantity = 1;
  currentDiscount = 0;
  appliedPromo = "";

  // Set Top Image Banner
  const modalImg = document.getElementById('modalProductImage');
  if (modalImg) modalImg.src = item.image || 'images/vladyka.jpg';

  const modalBadge = document.getElementById('modalItemBadge');
  if (modalBadge) modalBadge.innerText = item.badge || 'VIP';

  const modalIcon = document.getElementById('modalItemIconBox');
  if (modalIcon) modalIcon.innerHTML = item.icon;

  const modalTitle = document.getElementById('modalItemTitle');
  if (modalTitle) modalTitle.innerText = `Товар: ${item.name.toUpperCase()}`;

  // Default Nickname: leave empty with placeholder unless player already typed one
  const nickInput = document.getElementById('modalNicknameInput');
  if (nickInput) {
    nickInput.value = (currentNick && currentNick !== "Steve") ? currentNick : "";
  }

  // Quantity Selector: Show for cases and currency, hide for privileges and services
  const qtyContainer = document.getElementById('modalQuantityContainer');
  const qtyInput = document.getElementById('modalQuantityInput');
  if (qtyInput) qtyInput.value = "1";
  
  const isMultiItem = id.startsWith('case_') || id.startsWith('tokens_') || id.startsWith('coins_');
  if (qtyContainer) {
    if (isMultiItem) {
      qtyContainer.classList.remove('hidden');
    } else {
      qtyContainer.classList.add('hidden');
    }
  }

  // Warning for Services
  const warningBox = document.getElementById('modalServiceWarning');
  if (warningBox) warningBox.className = "hidden";

  // Reset Payment Method to SBP default
  selectPaymentMethod('sbp');

  // Reset Promo
  const promoInput = document.getElementById('promoCodeInput');
  if (promoInput) promoInput.value = "";
  
  const promoStatus = document.getElementById('promoStatusMessage');
  if (promoStatus) promoStatus.className = "text-xs mt-1 hidden";
  
  updateModalPrice();

  const modal = document.getElementById('checkoutModal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    lucide.createIcons();
  }, 10);

  if (nickInput && nickInput.value.trim()) {
    checkPlayerPunishment(nickInput.value.trim(), item.id);
  }
}

let selectedPaymentMethod = "sbp";

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  const input = document.getElementById('paymentMethodSelect');
  if (input) input.value = method;
  
  try {
    playSound('click');
  } catch (e) {}

  const tiles = document.querySelectorAll('.payment-method-tile');
  tiles.forEach(tile => {
    tile.className = "payment-method-tile cursor-pointer p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-950/70 hover:border-gray-700 hover:bg-gray-900/60 transition-all flex items-center gap-2 sm:gap-2.5 group";
  });

  const activeTile = document.getElementById(`payMethod-${method}`);
  if (activeTile) {
    activeTile.className = "payment-method-tile cursor-pointer p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border-2 border-amber-400 bg-amber-500/15 shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all flex items-center gap-2 sm:gap-2.5 group active";
  }
}

function closeCheckoutModal() {
  playSound('click');
  const modal = document.getElementById('checkoutModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

function changeQuantity(delta) {
  const input = document.getElementById('modalQuantityInput');
  if (!input) return;
  let val = parseInt(input.value) || 1;
  val = Math.max(1, Math.min(99, val + delta));
  input.value = val;
  selectedQuantity = val;
  playSound('click');
  updateModalPrice();
}

function onQuantityChange() {
  const input = document.getElementById('modalQuantityInput');
  if (!input) return;
  let val = parseInt(input.value);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 99) val = 99;
  selectedQuantity = val;
  updateModalPrice();
}

function updateModalPrice() {
  if (!selectedProduct) return;
  const isMultiItem = selectedProduct.id.startsWith('case_') || selectedProduct.id.startsWith('tokens_') || selectedProduct.id.startsWith('coins_');
  const qty = isMultiItem ? selectedQuantity : 1;
  const basePrice = selectedProduct.price * qty;

  if (currentDiscount > 0) {
    const discounted = Math.max(1, Math.round(basePrice * (1 - currentDiscount)));
    document.getElementById('modalOldPrice').classList.remove('hidden');
    document.getElementById('modalOldPrice').innerText = `${basePrice} ₽`;
    document.getElementById('modalTotalPrice').innerText = `${discounted} ₽`;
  } else {
    document.getElementById('modalOldPrice').classList.add('hidden');
    document.getElementById('modalTotalPrice').innerText = `${basePrice} ₽`;
  }
}

function applyPromoCode(silent = false) {
  const code = (document.getElementById('promoCodeInput')?.value || "").trim().toUpperCase();
  const statusEl = document.getElementById('promoStatusMessage');
  if (!statusEl) return;
  
  if (!code) {
    if (!silent) {
      showToast('Введите промокод', '✕');
      statusEl.className = "text-xs mt-1 text-red-400 font-bold block";
      statusEl.innerText = "✕ Введите код промокода";
    } else {
      statusEl.className = "text-xs mt-1 hidden";
      statusEl.innerText = "";
    }
    currentDiscount = 0;
    appliedPromo = "";
    updateModalPrice();
    return;
  }

  // Load from dynamicPromoCodes, or localStorage cache, or fallback list
  let promoPool = Array.isArray(dynamicPromoCodes) && dynamicPromoCodes.length > 0 ? dynamicPromoCodes : [];
  if (promoPool.length === 0) {
    try {
      const cached = localStorage.getItem('flory_promos_cache');
      if (cached) promoPool = JSON.parse(cached);
    } catch (e) {}
  }

  let foundPromo = promoPool.find(p => p.code && p.code.toUpperCase() === code);

  if (!foundPromo) {
    if (!silent) {
      playSound('click');
      statusEl.className = "text-xs mt-1 text-red-400 font-bold block";
      statusEl.innerText = "✕ Промокод не существует или удален";
      showToast('Промокод не найден', '✕');
    }
    currentDiscount = 0;
    appliedPromo = "";
    updateModalPrice();
    return;
  }

  // 1. Check if active
  if (foundPromo.active === false) {
    if (!silent) {
      playSound('click');
      statusEl.className = "text-xs mt-1 text-red-400 font-bold block";
      statusEl.innerText = "✕ Этот промокод временно отключен";
      showToast('Промокод отключен', '✕');
    }
    currentDiscount = 0;
    appliedPromo = "";
    updateModalPrice();
    return;
  }

  const now = Date.now();

  // 2. Check valid_from (start time)
  if (foundPromo.valid_from) {
    const fromTime = new Date(foundPromo.valid_from).getTime();
    if (!isNaN(fromTime) && now < fromTime) {
      if (!silent) {
        playSound('click');
        const dateStr = new Date(foundPromo.valid_from).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        statusEl.className = "text-xs mt-1 text-yellow-400 font-bold block";
        statusEl.innerText = `⏳ Промокод станет активен с ${dateStr}`;
        showToast(`Промокод активен только с ${dateStr}`, '⏳');
      }
      currentDiscount = 0;
      appliedPromo = "";
      updateModalPrice();
      return;
    }
  }

  // 3. Check valid_until (expiry time)
  if (foundPromo.valid_until) {
    const untilTime = new Date(foundPromo.valid_until).getTime();
    if (!isNaN(untilTime) && now > untilTime) {
      if (!silent) {
        playSound('click');
        statusEl.className = "text-xs mt-1 text-red-400 font-bold block";
        statusEl.innerText = "✕ Срок действия этого промокода истек";
        showToast('Срок действия промокода завершен', '✕');
      }
      currentDiscount = 0;
      appliedPromo = "";
      updateModalPrice();
      return;
    }
  }

  // 4. Check max_uses limit
  if (foundPromo.max_uses && Number(foundPromo.max_uses) > 0) {
    const used = Number(foundPromo.used_count) || 0;
    if (used >= Number(foundPromo.max_uses)) {
      if (!silent) {
        playSound('click');
        statusEl.className = "text-xs mt-1 text-red-400 font-bold block";
        statusEl.innerText = `✕ Лимит активаций промокода исчерпан (${foundPromo.max_uses} из ${foundPromo.max_uses})`;
        showToast('Лимит активаций промокода исчерпан', '✕');
      }
      currentDiscount = 0;
      appliedPromo = "";
      updateModalPrice();
      return;
    }
  }

  // 5. Check applies_to (product or category target)
  if (foundPromo.applies_to && foundPromo.applies_to !== 'all' && selectedProduct) {
    const target = foundPromo.applies_to.toLowerCase();
    const productCat = (selectedProduct.category || "").toLowerCase();
    const productId = (selectedProduct.id || "").toLowerCase();
    const curCat = (activeCategory || "").toLowerCase();

    const isMatch = (productCat === target || productId === target || curCat === target);
    if (!isMatch) {
      if (!silent) {
        playSound('click');
        const catTitles = {
          privileges: 'Привилегии',
          cases: 'Кейсы',
          currency: 'Валюта',
          services: 'Услуги'
        };
        const readableTarget = catTitles[target] || target;
        statusEl.className = "text-xs mt-1 text-orange-400 font-bold block";
        statusEl.innerText = `✕ Промокод действует только на раздел «${readableTarget}»`;
        showToast(`Действует только на «${readableTarget}»`, '⚠️');
      }
      currentDiscount = 0;
      appliedPromo = "";
      updateModalPrice();
      return;
    }
  }

  // All validations passed: Apply strictly to checkout modal
  const discPercent = Math.min(99, Math.max(1, Number(foundPromo.discount) || 20));
  currentDiscount = discPercent / 100;
  appliedPromo = foundPromo.code;
  
  if (!silent) playSound('success');
  statusEl.className = "text-xs mt-1 text-emerald-400 font-bold block";
  statusEl.innerText = `✓ Промокод [${foundPromo.code}] применен! Скидка -${discPercent}%`;
  if (!silent) showToast(`Скидка ${discPercent}% успешно применена!`, '🔥');
  updateModalPrice();
}

// Verification for Permanent Ban & Mute before purchase
async function checkPlayerPunishment(nick, itemId) {
  const warningBox = document.getElementById('modalServiceWarning');
  const payBtn = document.querySelector('#checkoutModal button[onclick="processPayment()"]');
  if (!warningBox) return true;

  if (itemId !== 'srv_unban' && itemId !== 'srv_unmute') {
    warningBox.className = 'hidden';
    if (payBtn) payBtn.disabled = false;
    return true;
  }

  if (!nick) {
    warningBox.className = 'hidden';
    if (payBtn) payBtn.disabled = false;
    return true;
  }

  try {
    const res = await fetch(`/api/player?name=${encodeURIComponent(nick)}`);
    if (res.ok) {
      const data = await res.json();
      if (itemId === 'srv_unban' && data.ban_is_permanent) {
        warningBox.className = 'block text-xs p-2.5 rounded-xl font-semibold leading-relaxed bg-red-500/20 text-red-300 border border-red-500/40';
        warningBox.innerHTML = `⚠️ У игрока <b>${nick}</b> перманентная (навсегда) блокировка! Разбан перманентно заблокированных игроков невозможен.`;
        if (payBtn) payBtn.disabled = true;
        return false;
      }
      if (itemId === 'srv_unmute' && data.mute_is_permanent) {
        warningBox.className = 'block text-xs p-2.5 rounded-xl font-semibold leading-relaxed bg-red-500/20 text-red-300 border border-red-500/40';
        warningBox.innerHTML = `⚠️ У игрока <b>${nick}</b> перманентный (навсегда) мут! Снятие вечной блокировки чата невозможно.`;
        if (payBtn) payBtn.disabled = true;
        return false;
      }
    }
  } catch (e) {}

  warningBox.className = 'hidden';
  if (payBtn) payBtn.disabled = false;
  return true;
}

// Claim Daily Bonus Functionality (1 claim / 24h / IP, online check)
async function claimDailyBonus() {
  const input = document.getElementById('bonusNicknameInput');
  const btn = document.getElementById('claimBonusBtn');
  const statusMsg = document.getElementById('bonusStatusMsg');
  const nick = (input ? input.value : "").trim();

  if (!nick) {
    playSound('click');
    showToast('Напишите свой игровой никнейм!', '✕');
    if (statusMsg) {
      statusMsg.className = "block text-[11px] sm:text-xs text-center p-2.5 rounded-xl font-medium leading-relaxed bg-red-500/20 text-red-300 border border-red-500/40";
      statusMsg.innerText = "Пожалуйста, введите никнейм перед получением бонуса.";
    }
    if (input) input.focus();
    return;
  }

  currentNick = nick;
  const originalBtnHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1.5">⏳</span> Проверка и выдача...';
  }

  try {
    const response = await fetch('/api/bonus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nick })
    });

    const data = await response.json().catch(() => ({ ok: false, error: 'Ошибка ответа сервера' }));

    if (response.ok && data.ok) {
      playSound('success');
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
      showToast('Ежедневный бонус выдан на сервере!', '🎁');
      if (statusMsg) {
        statusMsg.className = "block text-[11px] sm:text-xs text-center p-2.5 rounded-xl font-semibold leading-relaxed bg-amber-500/20 text-amber-300 border border-amber-500/40";
        statusMsg.innerText = data.message || "🎉 Бонус успешно начислен на ваш баланс!";
      }
      if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-60', 'cursor-not-allowed');
        btn.innerHTML = '<i data-lucide="check" class="w-4 h-4 mr-1"></i> Бонус получен!';
        lucide.createIcons();
      }
    } else {
      playSound('click');
      const errText = data.error || 'Не удалось получить бонус';
      showToast(errText, '✕');
      if (statusMsg) {
        statusMsg.className = "block text-[11px] sm:text-xs text-center p-2.5 rounded-xl font-medium leading-relaxed bg-red-500/20 text-red-300 border border-red-500/40";
        statusMsg.innerText = errText;
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
      }
    }
  } catch (e) {
    playSound('click');
    const msg = 'Ошибка связи с сервером. Попробуйте еще раз.';
    showToast(msg, '✕');
    if (statusMsg) {
      statusMsg.className = "block text-[11px] sm:text-xs text-center p-2.5 rounded-xl font-medium leading-relaxed bg-red-500/20 text-red-300 border border-red-500/40";
      statusMsg.innerText = msg;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
    }
  }
}

// Payment Processing
async function processPayment() {
  const nick = (document.getElementById('modalNicknameInput').value || "").trim();
  if (!nick) {
    playSound('click');
    showToast('Пожалуйста, введите никнейм!', '✕');
    const nickInput = document.getElementById('modalNicknameInput');
    if (nickInput) nickInput.focus();
    return;
  }
  currentNick = nick;

  // Check permanent punishment for unban / unmute
  if (selectedProduct && (selectedProduct.id === 'srv_unban' || selectedProduct.id === 'srv_unmute')) {
    const isAllowed = await checkPlayerPunishment(nick, selectedProduct.id);
    if (!isAllowed) {
      playSound('click');
      showToast('Невозможно приобрести разбан/размут для вечной блокировки!', '✕');
      return;
    }
  }

  // Auto-activate promo if user typed a code but did not click Apply
  const promoInputVal = (document.getElementById('promoCodeInput')?.value || "").trim().toUpperCase();
  if (promoInputVal && promoInputVal !== appliedPromo) {
    applyPromoCode(true);
  }

  const paymentMethod = document.getElementById('paymentMethodSelect')?.value || "sbp";
  const isMultiItem = selectedProduct.id.startsWith('case_') || selectedProduct.id.startsWith('tokens_') || selectedProduct.id.startsWith('coins_');
  const qty = isMultiItem ? selectedQuantity : 1;
  const basePrice = selectedProduct.price * qty;
  const discountedPrice = Math.max(1, Math.round(basePrice * (1 - currentDiscount)));

  const payBtn = document.querySelector('#checkoutModal button[onclick="processPayment()"]');
  const originalBtnText = payBtn ? payBtn.innerHTML : '';
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Переход к оплате...';
  }

  try {
    // Create signed invoice for AnyPay
    const response = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: nick,
        item_id: selectedProduct.id,
        item_name: selectedProduct.name,
        price: discountedPrice,
        quantity: qty,
        promo: appliedPromo,
        category: activeCategory,
        method: paymentMethod
      })
    });

    const data = await response.json().catch(() => null);

    if (data && data.payment_url) {
      const generatedOrderId = data.idempotence_key || data.order_id || `ORD-${Date.now()}`;
      const yooId = data.order_id || '';
      try {
        localStorage.setItem('flory_last_pending_order', JSON.stringify({
          order_id: generatedOrderId,
          yoo_id: yooId,
          player: nick,
          item: selectedProduct.name,
          price: discountedPrice,
          promo: appliedPromo || '',
          time: Date.now()
        }));
      } catch (e) {}

      playSound('click');
      showToast('Перенаправляем в платёжный шлюз...', '💳');
      setTimeout(() => {
        window.location.href = data.payment_url;
      }, 600);
      return;
    }

    playSound('click');
    showToast(data?.error || 'Не удалось создать платёж в ЮKassa', '✕');
  } catch (e) {
    playSound('click');
    showToast('Ошибка создания счета на оплату', '✕');
  } finally {
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.innerHTML = originalBtnText;
    }
  }
}

// Live Purchases Ticker (Gliding Marquee)
let recentPurchases = [];

function deduplicatePurchases(list) {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const item of list) {
    if (!item || !item.nick || !item.item) continue;
    const last = clean[clean.length - 1];
    if (!last || last.nick.toLowerCase() !== item.nick.toLowerCase() || last.item.toLowerCase() !== item.item.toLowerCase()) {
      clean.push({
        nick: String(item.nick).trim(),
        item: String(item.item).trim(),
        price: (item.price !== undefined && item.price !== null && item.price !== '') ? Number(item.price) : null,
        promo: item.promo ? String(item.promo).trim().toUpperCase() : '',
        time: item.time || 'только что',
        timestamp: item.timestamp || Date.now()
      });
    }
  }
  return clean;
}

function initPurchasesTicker() {
  const ticker = document.getElementById('recentPurchasesTicker');
  if (!ticker) return;

  if (!recentPurchases || recentPurchases.length === 0) {
    try {
      const cached = localStorage.getItem('flory_recent_purchases');
      if (cached) {
        recentPurchases = JSON.parse(cached);
      }
    } catch (e) {}
  }

  recentPurchases = deduplicatePurchases(recentPurchases);

  if (!recentPurchases || recentPurchases.length === 0) {
    ticker.style.animation = 'none';
    ticker.style.paddingLeft = '0';
    ticker.innerHTML = `
      <div class="ticker-empty flex items-center justify-center gap-2 py-1 px-4 text-amber-300 font-bold text-xs sm:text-sm whitespace-nowrap">
        <i data-lucide="sparkles" class="w-4 h-4 text-yellow-400"></i>
        <span>Покупок еще нету, но будем рады вашей!</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Restore animated gliding marquee
  ticker.style.animation = '';
  ticker.style.paddingLeft = '';

  // Render each purchase strictly once without any duplication
  ticker.innerHTML = recentPurchases.map(p => createTickerItemHTML(p.nick, p.item, p.time)).join('');
}

function createTickerItemHTML(nick, item, time) {
  return `
    <div class="flex items-center gap-2.5 bg-gradient-to-r from-[#111726] to-[#0c101a] border border-amber-500/30 px-3.5 py-1.5 rounded-full shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.12)]">
      <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
      <span class="font-bold text-xs text-white tracking-wide font-sans">${nick}</span>
      <span class="text-[11px] font-brand font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 shadow-sm">${item}</span>
      <span class="text-[10px] text-gray-400 font-medium">${time || 'только что'}</span>
    </div>
  `;
}

function addPurchaseToTicker(nick, item, time, price, promo) {
  if (!nick || !item) return;
  const cleanNick = String(nick).trim();
  const cleanItem = String(item).trim();
  const timeStr = time || "только что";
  const cleanPrice = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
  const cleanPromo = promo ? String(promo).trim().toUpperCase() : '';

  const now = Date.now();
  // Deduplicate against first element if within 10 seconds
  if (recentPurchases.length > 0 && 
      recentPurchases[0].nick.toLowerCase() === cleanNick.toLowerCase() && 
      recentPurchases[0].item.toLowerCase() === cleanItem.toLowerCase() &&
      (now - (recentPurchases[0].timestamp || 0) < 10000)) {
    recentPurchases[0].time = timeStr;
    if (cleanPrice !== null) recentPurchases[0].price = cleanPrice;
    if (cleanPromo) recentPurchases[0].promo = cleanPromo;
  } else {
    recentPurchases.unshift({
      nick: cleanNick,
      item: cleanItem,
      price: cleanPrice,
      promo: cleanPromo,
      time: timeStr,
      timestamp: now
    });
  }

  recentPurchases = deduplicatePurchases(recentPurchases);
  if (recentPurchases.length > 30) recentPurchases = recentPurchases.slice(0, 30);

  try {
    localStorage.setItem('flory_recent_purchases', JSON.stringify(recentPurchases));
  } catch (e) {}

  initPurchasesTicker();
}

// Fetch dynamic catalog from /api/store-data
async function fetchStoreCatalog() {
  // 1. Initial hydrate from localStorage cache if available
  try {
    const cachedProds = localStorage.getItem('flory_products_cache');
    if (cachedProds && (!productsData || Object.keys(productsData).length === 0)) {
      productsData = JSON.parse(cachedProds);
      renderProducts();
    }
    const cachedPromos = localStorage.getItem('flory_promos_cache');
    if (cachedPromos && (!dynamicPromoCodes || dynamicPromoCodes.length === 0)) {
      dynamicPromoCodes = JSON.parse(cachedPromos);
    }
  } catch (e) {}

  // 2. Fetch fresh catalog from API
  try {
    const res = await fetch('/api/store-data');
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        if (json.data.products && Object.keys(json.data.products).length > 0) {
          productsData = json.data.products;
          try { localStorage.setItem('flory_products_cache', JSON.stringify(productsData)); } catch (e) {}
          renderProducts();
        }
        if (json.data.promoCodes && Array.isArray(json.data.promoCodes)) {
          dynamicPromoCodes = json.data.promoCodes;
          try { localStorage.setItem('flory_promos_cache', JSON.stringify(dynamicPromoCodes)); } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

// Fetch live recent purchases for the ticker
async function fetchRecentPurchases() {
  try {
    const res = await fetch('/api/purchases');
    if (res.ok) {
      const json = await res.json();
      if (json.purchases && Array.isArray(json.purchases)) {
        recentPurchases = deduplicatePurchases(json.purchases);
        try { localStorage.setItem('flory_recent_purchases', JSON.stringify(recentPurchases)); } catch (e) {}
        initPurchasesTicker();
      }
      if (json.promoCodes && Array.isArray(json.promoCodes)) {
        dynamicPromoCodes = json.promoCodes;
        try { localStorage.setItem('flory_promos_cache', JSON.stringify(dynamicPromoCodes)); } catch (e) {}
      }
    }
  } catch (e) {}
}

// Live Server Online Ping from d15.aurorix.net:25853
async function fetchServerOnline() {
  const onlineEl = document.getElementById('headerOnline');
  if (!onlineEl) return;

  try {
    // Primary: direct fetch to public MC Status API
    const res = await fetch('https://api.mcstatus.io/v2/status/java/d15.aurorix.net:25853', {
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.online) {
        const count = data.players ? (data.players.online ?? 0) : 0;
        onlineEl.innerText = `${count} игроков`;
        return;
      }
    }

    // Fallback: internal server-status API
    const fallbackRes = await fetch('/api/server-status').catch(() => null);
    if (fallbackRes && fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      onlineEl.innerText = `${fbData.online_players || 0} игроков`;
      return;
    }

    onlineEl.innerText = "Онлайн";
  } catch (err) {
    if (onlineEl.innerText === "...") {
      onlineEl.innerText = "Онлайн";
    }
  }
}

// Copy Server IP
function copyServerIP() {
  const ip = document.getElementById('serverIpText')?.innerText || "mc.florymine.fun";
  navigator.clipboard.writeText(ip).then(() => {
    playSound('click');
    showToast(`IP ${ip} скопирован!`, '✓');
  }).catch(() => {
    showToast(`IP: ${ip}`, '📋');
  });
}

// Toast Notifications
let toastTimer = null;
function showToast(message, icon = "✓") {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIco = document.getElementById('toastIcon');
  if (!toast) return;

  if (toastMsg) toastMsg.innerText = message;
  if (toastIco) toastIco.innerText = icon;

  toast.classList.remove('opacity-0', 'translate-y-20');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-20');
  }, 3500);
}

// Legal Modals (Terms, Privacy, Rules)
function openLegalModal(type) {
  const modal = document.getElementById('legalModal');
  const title = document.getElementById('legalModalTitle');
  const icon = document.getElementById('legalModalIcon');
  const content = document.getElementById('legalModalContent');
  if (!modal) return;

  playSound('click');

  if (type === 'terms') {
    if (icon) icon.innerText = "📜";
    if (title) title.innerText = "Пользовательское соглашение (Публичная оферта)";
    if (content) {
      content.innerHTML = `
        <p class="font-bold text-white">1. Общие положения</p>
        <p>1.1. Настоящее соглашение является публичной офертой индивидуального проекта FloryMine (ИНН: 910614106137, Луцюк И. А.) и регулирует порядок предоставления внутриигровых цифровых услуг на игровом сервере FloryMine (Minecraft).</p>
        <p>1.2. Оплата любых товаров на сайте означает полное и безоговорочное согласие Покупателя с условиями настоящего Соглашения.</p>
        
        <p class="font-bold text-white pt-2">2. Предмет соглашения и доставка</p>
        <p>2.1. Все товары на сайте являются цифровыми внутриигровыми привилегиями, правами и виртуальными предметами.</p>
        <p>2.2. Доставка виртуальных товаров осуществляется в автоматическом режиме в течение 1–5 минут после подтверждения оплаты прямо на указанный никнейм на сервере FloryMine.</p>
        
        <p class="font-bold text-white pt-2">3. Возврат и ответственность</p>
        <p>3.1. Цифровые внутриигровые услуги считаются оказанными в полном объеме с момента их активации на сервере.</p>
        <p>3.2. В случае нарушения правил сервера и последующей блокировки игрока, средства за приобретенные привилегии не возвращаются.</p>
        
        <p class="font-bold text-white pt-2">4. Контакты</p>
        <p>По всем вопросам поддержки и доставки: <a href="mailto:support@florymine.fun" class="text-amber-400 underline">support@florymine.fun</a></p>
      `;
    }
  } else if (type === 'privacy') {
    if (icon) icon.innerText = "🔒";
    if (title) title.innerText = "Политика конфиденциальности";
    if (content) {
      content.innerHTML = `
        <p class="font-bold text-white">1. Сбор информации</p>
        <p>1.1. Для оформления заказа на сайте собираются только минимально необходимые данные: игровой никнейм и данные транзакции.</p>
        
        <p class="font-bold text-white pt-2">2. Безопасность данных</p>
        <p>2.1. Мы не храним и не обрабатываем данные ваших банковских карт. Все платежные транзакции осуществляются через защищенные шлюзы официальных банков и платежных партнеров по стандарту PCI DSS.</p>
        
        <p class="font-bold text-white pt-2">3. Использование файлов Cookie</p>
        <p>3.1. Сайт использует локальные файлы cookies и сессии исключительно для сохранения настроек громкости звука и привязанного никнейма.</p>
      `;
    }
  } else if (type === 'rules') {
    if (icon) icon.innerText = "⚖️";
    if (title) title.innerText = "Правила игрового сервера FloryMine";
    if (content) {
      content.innerHTML = `
        <p class="font-bold text-white">1. Игровой процесс</p>
        <p>1.1. Запрещено использование стороннего ПО, дающего преимущество (читы, автокликеры, боты).</p>
        <p>1.2. Запрещено создание помех стабильной работе сервера (дюпы, лаг-машины).</p>
        
        <p class="font-bold text-white pt-2">2. Общение и чат</p>
        <p>2.1. Запрещены оскорбления родителей, реклама сторонних серверов, спам и флуд в глобальном чате.</p>
        <p>2.2. Донатеры обязаны соблюдать правила наравне с обычными игроками.</p>
      `;
    }
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
  }, 10);
  lucide.createIcons();
}

function closeLegalModal() {
  const modal = document.getElementById('legalModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300);
}

// Cursor Golden Amber Spark Particles Trail
function initCursorSparkTrail() {
  if (document.getElementById('cursorSparkCanvas')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'cursorSparkCanvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '999999';
  canvas.style.display = 'block';
  
  if (document.body) {
    document.body.appendChild(canvas);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('cursorSparkCanvas')) {
        document.body.appendChild(canvas);
      }
    });
  }

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const colors = ['#f59e0b', '#fbbf24', '#f97316', '#fef08a', '#ffffff', '#eab308'];

  function addSpark(x, y, count = 2) {
    if (particles.length > 80) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;
      particles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.6,
        size: Math.random() * 2.8 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: Math.random() * 0.025 + 0.018
      });
    }
  }

  window.addEventListener('mousemove', (e) => {
    addSpark(e.clientX, e.clientY, 2);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      addSpark(e.touches[0].clientX, e.touches[0].clientY, 2);
    }
  }, { passive: true });

  window.addEventListener('click', (e) => {
    addSpark(e.clientX, e.clientY, 8);
  }, { passive: true });

  function renderLoop() {
    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      p.size = Math.max(0, p.size - 0.02);

      if (p.alpha <= 0 || p.size <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
}

// Immediate execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCursorSparkTrail);
} else {
  initCursorSparkTrail();
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  initPurchasesTicker();
  fetchServerOnline();
  fetchStoreCatalog();
  fetchRecentPurchases();
  initCursorSparkTrail();

  // Periodic refreshes
  setInterval(fetchServerOnline, 25000);
  setInterval(fetchRecentPurchases, 15000);
  setInterval(fetchStoreCatalog, 45000);

  // Bind Enter key on Bonus Input
  const bonusInput = document.getElementById('bonusNicknameInput');
  if (bonusInput) {
    bonusInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') claimDailyBonus();
    });
  }

  // Bind Enter & Input key on Modal Nickname Input
  const modalNickInput = document.getElementById('modalNicknameInput');
  if (modalNickInput) {
    modalNickInput.addEventListener('input', () => {
      if (selectedProduct) {
        checkPlayerPunishment(modalNickInput.value.trim(), selectedProduct.id);
      }
    });
    modalNickInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') processPayment();
    });
  }

  // Bind Promo Code Input: Auto-activate on typing (>= 2 chars), on blur (focus leaves), and on Enter
  const promoInput = document.getElementById('promoCodeInput');
  if (promoInput) {
    promoInput.addEventListener('input', () => {
      const val = promoInput.value.trim().toUpperCase();
      if (val.length >= 2) {
        applyPromoCode(true); // Silent validation
      } else if (val.length === 0) {
        applyPromoCode(true); // Reset discount
      }
    });
    promoInput.addEventListener('blur', () => {
      if (promoInput.value.trim()) {
        applyPromoCode(true);
      }
    });
    promoInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') applyPromoCode(false);
    });
  }

  // Check URL params from Payment redirect (YooKassa returns to return_url)
  const urlParams = new URLSearchParams(window.location.search);
  const isPaymentCheck = urlParams.get('payment_check');
  const paymentStatus = urlParams.get('status');
  const urlOrderId = urlParams.get('order_id');

  if (isPaymentCheck || paymentStatus || urlOrderId) {
    let pending = null;
    try {
      const pendingRaw = localStorage.getItem('flory_last_pending_order');
      if (pendingRaw) pending = JSON.parse(pendingRaw);
    } catch (e) {}

    // Immediately remove query params from address bar
    try {
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {}

    if (paymentStatus === 'fail' || paymentStatus === 'cancel') {
      try { localStorage.removeItem('flory_last_pending_order'); } catch (e) {}
      setTimeout(() => {
        playSound('click');
        showToast('Оплата отменена или не была завершена', '✕');
      }, 500);
    } else {
      const checkYooId = pending?.yoo_id || '';
      const checkOrderId = urlOrderId || pending?.order_id || '';

      if (checkYooId || checkOrderId) {
        showToast('Проверяем статус оплаты в платёжной системе...', '⏳');

        fetch(`/api/check-payment?yoo_id=${encodeURIComponent(checkYooId)}&order_id=${encodeURIComponent(checkOrderId)}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.paid === true) {
              const pPlayer = data.player || pending?.player || '';
              const pItem = data.item || pending?.item || '';
              const pPrice = data.price !== undefined ? data.price : pending?.price;
              const pPromo = data.promo || pending?.promo || '';
              const safeKey = checkOrderId || checkYooId || `DONE_${Date.now()}`;

              if (!sessionStorage.getItem(`flory_done_${safeKey}`)) {
                sessionStorage.setItem(`flory_done_${safeKey}`, '1');
                addPurchaseToTicker(pPlayer, pItem, 'только что', pPrice, pPromo);
              }

              if (data.promoCodes && Array.isArray(data.promoCodes)) {
                dynamicPromoCodes = data.promoCodes;
                try { localStorage.setItem('flory_promos_cache', JSON.stringify(dynamicPromoCodes)); } catch (e) {}
              }

              try { localStorage.removeItem('flory_last_pending_order'); } catch (e) {}

              playSound('success');
              if (typeof confetti === 'function') {
                confetti({ particleCount: 120, spread: 85, origin: { y: 0.5 } });
              }
              showToast(`Спасибо за покупку${pPlayer ? ', ' + pPlayer : ''}! Донат ${pItem ? '[' + pItem + '] ' : ''}выдан на сервере! 🎉`, '⭐');
            } else {
              try { localStorage.removeItem('flory_last_pending_order'); } catch (e) {}
              playSound('click');
              showToast(data?.error || '✕ Оплата не была завершена или была отменена', '✕');
            }
          })
          .catch(() => {
            try { localStorage.removeItem('flory_last_pending_order'); } catch (e) {}
            showToast('Не удалось проверить статус платежа', '✕');
          });
      }
    }
  }
});
