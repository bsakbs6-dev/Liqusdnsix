// FloryMine Super Admin Panel - Client Script
let adminToken = sessionStorage.getItem('flory_admin_token') || "";
let storeData = {
  categories: [],
  products: {},
  promoCodes: [],
  recentPurchases: []
};

// Audio Synthesizer
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    if (type === 'click') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'success') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.07 + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.25);
      });
    }
  } catch (e) {}
}

// Toast
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

// Password toggle
function togglePasswordVisibility() {
  const input = document.getElementById('adminPasswordInput');
  const icon = document.getElementById('eyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    input.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

// Login
async function handleLogin(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  const password = (document.getElementById('adminPasswordInput')?.value || "").trim();
  const errorMsg = document.getElementById('loginErrorMsg');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!password) {
    if (errorMsg) {
      errorMsg.classList.remove('hidden');
      errorMsg.innerText = 'Введите пароль администратора';
    }
    return false;
  }

  if (errorMsg) errorMsg.classList.add('hidden');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Проверка...';
  }

  try {
    const res = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success && data.token) {
      adminToken = data.token;
      sessionStorage.setItem('flory_admin_token', adminToken);
      playSound('success');
      showToast('Успешная авторизация!', '⚡');
      showDashboard();
      await loadStoreData();
    } else {
      playSound('click');
      if (errorMsg) {
        errorMsg.classList.remove('hidden');
        errorMsg.innerText = data.error || 'Неверный пароль администратора (попробуйте: devildev)';
      }
    }
  } catch (err) {
    if (errorMsg) {
      errorMsg.classList.remove('hidden');
      errorMsg.innerText = 'Ошибка соединения с сервером авторизации: ' + err.message;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Войти в систему</span> <i data-lucide="arrow-right" class="w-4 h-4"></i>';
      if (window.lucide) lucide.createIcons();
    }
  }
  return false;
}

function handleLogout() {
  playSound('click');
  adminToken = "";
  sessionStorage.removeItem('flory_admin_token');
  document.getElementById('adminDashboard').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  showToast('Вы вышли из админ-панели', '🔒');
}

function showDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  lucide.createIcons();
}

// Fetch Catalog Data
async function loadStoreData() {
  let localData = null;
  // 1. Initial hydrate from local storage
  try {
    const cached = localStorage.getItem('flory_store_catalog');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.products) {
        localData = parsed;
        storeData = parsed;
      }
    }
  } catch (e) {}

  // 2. Fetch fresh from server
  try {
    const res = await fetch('/api/store-data');
    if (res.ok) {
      const json = await res.json();
      if (json.data && json.data.products) {
        // If local admin data has custom promoCodes and is newer or explicit, preserve admin edits
        if (localData && Array.isArray(localData.promoCodes) && localData.updated_at && (!json.data.updated_at || localData.updated_at >= json.data.updated_at)) {
          storeData = { ...json.data, promoCodes: localData.promoCodes };
        } else {
          storeData = json.data;
        }
        try {
          localStorage.setItem('flory_store_catalog', JSON.stringify(storeData));
        } catch (e) {}
      }
    }
  } catch (e) {}

  updateStats();
  renderAdminProducts();
  renderAdminCategories();
  renderAdminPromos();
  await loadRecentPurchases();
}

// Save All Store Data
async function saveAllStoreData() {
  const btn = document.getElementById('saveChangesBtn');
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1.5">⏳</span> Сохранение...';
  }

  storeData.updated_at = Date.now();

  // Save to localStorage immediately
  try {
    localStorage.setItem('flory_store_catalog', JSON.stringify(storeData));
  } catch (e) {}

  // Sync with main shop dynamic promo codes
  try {
    if (Array.isArray(storeData.promoCodes)) {
      localStorage.setItem('flory_promos_cache', JSON.stringify(storeData.promoCodes));
    }
  } catch (e) {}

  try {
    const res = await fetch('/api/store-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(storeData)
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      playSound('success');
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.1, x: 0.9 } });
      showToast('Все изменения сохранены на сайте! 🎉', '✓');
      updateStats();
    } else {
      playSound('click');
      showToast(data.error || 'Ошибка сохранения на сервере (сохранено локально)', '⚠️');
    }
  } catch (e) {
    showToast('Сохранено в локальный кэш магазина', '✓');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      lucide.createIcons();
    }
  }
}

// Stats
function updateStats() {
  let count = 0;
  Object.values(storeData.products || {}).forEach(arr => {
    if (Array.isArray(arr)) count += arr.length;
  });

  const pEl = document.getElementById('statTotalProducts');
  if (pEl) pEl.innerText = count;

  const cEl = document.getElementById('statTotalCategories');
  if (cEl) cEl.innerText = (storeData.categories || []).length;

  const prEl = document.getElementById('statTotalPromos');
  if (prEl) prEl.innerText = (storeData.promoCodes || []).length;
}

// Tabs Switching
function switchAdminTab(tab) {
  playSound('click');
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.className = "admin-tab-btn px-4 py-2.5 rounded-xl font-brand font-bold text-xs sm:text-sm tracking-wide transition flex items-center gap-2 text-gray-400 hover:text-white bg-transparent border border-transparent hover:bg-gray-900";
  });

  const activeBtn = document.getElementById(`tabBtn-${tab}`);
  if (activeBtn) {
    activeBtn.className = "admin-tab-btn active px-4 py-2.5 rounded-xl font-brand font-bold text-xs sm:text-sm tracking-wide transition flex items-center gap-2 text-amber-400 bg-amber-500/15 border border-amber-500/30";
  }

  document.querySelectorAll('.admin-tab-content').forEach(sec => sec.classList.add('hidden'));
  const activeContent = document.getElementById(`tabContent-${tab}`);
  if (activeContent) activeContent.classList.remove('hidden');

  if (tab === 'purchases') {
    loadRecentPurchases();
  } else if (tab === 'promos') {
    loadStoreData();
  }

  lucide.createIcons();
}

// Render Products in Admin
function renderAdminProducts() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  const catFilter = document.getElementById('filterProductCategory')?.value || "all";
  const searchFilter = (document.getElementById('searchProductInput')?.value || "").toLowerCase().trim();

  let allList = [];
  Object.entries(storeData.products || {}).forEach(([catKey, items]) => {
    if (Array.isArray(items)) {
      items.forEach(item => {
        allList.push({ ...item, categoryKey: catKey });
      });
    }
  });

  if (catFilter !== 'all') {
    allList = allList.filter(i => i.categoryKey === catFilter || i.category === catFilter);
  }

  if (searchFilter) {
    allList = allList.filter(i => 
      (i.name && i.name.toLowerCase().includes(searchFilter)) ||
      (i.id && i.id.toLowerCase().includes(searchFilter))
    );
  }

  if (allList.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-gray-500 text-sm font-medium">
        Товары не найдены. Нажмите «Добавить товар», чтобы создать новый!
      </div>
    `;
    return;
  }

  container.innerHTML = allList.map(item => `
    <div class="p-4 rounded-2xl bg-[#0e1320] border border-gray-800 hover:border-amber-500/40 transition-all flex flex-col justify-between group shadow-sm">
      <div>
        <div class="flex items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-2xl">${item.icon || '📦'}</span>
            <div>
              <h4 class="font-brand font-bold text-white text-sm">${item.name}</h4>
              <span class="text-[10px] font-mono text-gray-400">ID: ${item.id}</span>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">${item.badge || item.categoryKey}</span>
        </div>

        <div class="relative w-full h-24 rounded-xl overflow-hidden bg-gray-950 mb-3 border border-gray-800">
          <img src="${item.image || 'images/vladyka.jpg'}" alt="${item.name}" class="w-full h-full object-cover">
        </div>

        <div class="flex items-center justify-between text-xs py-1 border-t border-gray-800/80">
          <span class="text-gray-400">Цена:</span>
          <span class="font-black font-brand text-amber-400 text-sm">${item.price} ₽</span>
        </div>

        <div class="text-[11px] text-gray-400 py-1">
          <span class="font-semibold text-gray-300">Команды (${(item.commands || []).length}):</span>
          <div class="font-mono text-[10px] text-emerald-400 truncate mt-0.5">${(item.commands || [])[0] || 'нет команд'}</div>
        </div>
      </div>

      <div class="pt-3 border-t border-gray-800/80 flex items-center justify-end gap-2 mt-2">
        <button onclick="openProductEditModal('${item.id}')" class="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-xs flex items-center gap-1 transition">
          <i data-lucide="edit" class="w-3.5 h-3.5"></i> Изменить
        </button>
        <button onclick="deleteProduct('${item.id}')" class="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center gap-1 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

function filterProductsDisplay() {
  renderAdminProducts();
}

// Product Modal
function openProductEditModal(id) {
  playSound('click');
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  if (!modal) return;

  // Populate category options
  const catSelect = document.getElementById('modalProductCategory');
  if (catSelect && storeData.categories) {
    catSelect.innerHTML = storeData.categories
      .filter(c => c.id !== 'all')
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join('');
  }

  if (id) {
    // Edit existing
    let found = null;
    let foundCat = 'privileges';
    Object.entries(storeData.products || {}).forEach(([catKey, list]) => {
      const match = (list || []).find(x => x.id === id);
      if (match) {
        found = match;
        foundCat = catKey;
      }
    });

    if (found) {
      if (title) title.innerText = `Редактирование: ${found.name}`;
      document.getElementById('modalProductOriginalId').value = found.id;
      document.getElementById('modalProductId').value = found.id;
      document.getElementById('modalProductName').value = found.name;
      document.getElementById('modalProductCategory').value = found.category || foundCat;
      document.getElementById('modalProductIcon').value = found.icon || '⚔️';
      document.getElementById('modalProductPrice').value = found.price || 99;
      document.getElementById('modalProductBadge').value = found.badge || '';
      document.getElementById('modalProductImage').value = found.image || '';
      document.getElementById('modalProductCommands').value = (found.commands || []).join('\n');
      document.getElementById('modalProductPerks').value = (found.perks || []).join('\n');
    }
  } else {
    // Add new
    if (title) title.innerText = "Создание нового товара";
    document.getElementById('modalProductOriginalId').value = "";
    document.getElementById('modalProductId').value = `item_${Date.now()}`;
    document.getElementById('modalProductName').value = "";
    document.getElementById('modalProductIcon').value = "📦";
    document.getElementById('modalProductPrice').value = "99";
    document.getElementById('modalProductBadge').value = "NEW";
    document.getElementById('modalProductImage').value = "images/vladyka.jpg";
    document.getElementById('modalProductCommands').value = "say [Донат] Игрок {player} приобрел товар!";
    document.getElementById('modalProductPerks').value = "Уникальные возможности\nВысокий статус на сервере";
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    lucide.createIcons();
  }, 10);
}

function closeProductModal() {
  playSound('click');
  const modal = document.getElementById('productModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

function saveProductModal(e) {
  if (e) e.preventDefault();
  const origId = document.getElementById('modalProductOriginalId').value;
  const newId = (document.getElementById('modalProductId').value || "").trim().toLowerCase();
  const name = (document.getElementById('modalProductName').value || "").trim();
  const cat = document.getElementById('modalProductCategory').value || "privileges";
  const icon = (document.getElementById('modalProductIcon').value || "📦").trim();
  const price = Number(document.getElementById('modalProductPrice').value) || 99;
  const badge = (document.getElementById('modalProductBadge').value || "").trim();
  const image = (document.getElementById('modalProductImage').value || "").trim();
  const cmds = document.getElementById('modalProductCommands').value.split('\n').map(s => s.trim()).filter(Boolean);
  const perks = document.getElementById('modalProductPerks').value.split('\n').map(s => s.trim()).filter(Boolean);

  if (!newId || !name) {
    showToast('Заполните ID и название товара!', '✕');
    return;
  }

  // Remove old if ID changed or editing
  if (origId) {
    Object.keys(storeData.products || {}).forEach(k => {
      storeData.products[k] = (storeData.products[k] || []).filter(x => x.id !== origId);
    });
  }

  if (!storeData.products[cat]) {
    storeData.products[cat] = [];
  }

  storeData.products[cat].push({
    id: newId,
    name: name,
    category: cat,
    icon: icon,
    price: price,
    badge: badge,
    image: image,
    commands: cmds,
    perks: perks
  });

  closeProductModal();
  renderAdminProducts();
  updateStats();
  saveAllStoreData();
  showToast(`Товар [${name}] сохранен!`, '✓');
}

function deleteProduct(id) {
  if (!confirm(`Вы точно хотите удалить товар с ID: ${id}?`)) return;
  playSound('click');
  Object.keys(storeData.products || {}).forEach(k => {
    storeData.products[k] = (storeData.products[k] || []).filter(x => x.id !== id);
  });
  renderAdminProducts();
  updateStats();
  saveAllStoreData();
  showToast('Товар удален', '🗑️');
}

// Categories
function renderAdminCategories() {
  const container = document.getElementById('adminCategoriesList');
  if (!container) return;

  container.innerHTML = (storeData.categories || []).map(cat => `
    <div class="p-4 rounded-2xl bg-[#0e1320] border border-gray-800 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <i data-lucide="${cat.icon || 'folder'}" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="font-brand font-bold text-white text-sm">${cat.name}</h4>
          <span class="text-[10px] font-mono text-gray-400">ID: ${cat.id}</span>
        </div>
      </div>
      ${cat.id !== 'all' ? `
        <button onclick="deleteCategory('${cat.id}')" class="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition" title="Удалить">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      ` : '<span class="text-[10px] text-gray-500 uppercase font-bold">Базовый</span>'}
    </div>
  `).join('');

  lucide.createIcons();
}

function openCategoryEditModal() {
  const name = prompt('Введите название нового каталога (например: Наборы, Косметика, Кланы):');
  if (!name || !name.trim()) return;
  const id = prompt('Введите ID каталога латиницей (например: sets, cosmetics, clans):') || name.toLowerCase().trim();
  
  if (!storeData.categories) storeData.categories = [];
  storeData.categories.push({
    id: id.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''),
    name: name.trim(),
    icon: 'folder'
  });

  renderAdminCategories();
  updateStats();
  saveAllStoreData();
  showToast(`Каталог [${name}] добавлен!`, '📁');
}

function deleteCategory(id) {
  if (id === 'all') return;
  if (!confirm(`Удалить категорию ${id}?`)) return;
  storeData.categories = (storeData.categories || []).filter(c => c.id !== id);
  renderAdminCategories();
  updateStats();
  saveAllStoreData();
  showToast('Категория удалена', '🗑️');
}

// Promo Codes
function renderAdminPromos() {
  const container = document.getElementById('adminPromosList');
  if (!container) return;

  const catTitles = {
    all: 'Все товары',
    privileges: 'Привилегии',
    cases: 'Кейсы',
    currency: 'Валюта',
    services: 'Услуги'
  };

  container.innerHTML = (storeData.promoCodes || []).map(p => {
    const maxUsesStr = p.max_uses && Number(p.max_uses) > 0 ? `${p.used_count || 0} / ${p.max_uses}` : 'Безлимит';
    const targetScope = catTitles[p.applies_to] || p.applies_to || 'Все товары';
    
    let timeStr = '';
    if (p.valid_from && p.valid_until) {
      const fromFmt = new Date(p.valid_from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const untilFmt = new Date(p.valid_until).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      timeStr = `С ${fromFmt} по ${untilFmt}`;
    } else if (p.valid_until) {
      const untilFmt = new Date(p.valid_until).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      timeStr = `До ${untilFmt}`;
    } else if (p.valid_from) {
      const fromFmt = new Date(p.valid_from).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      timeStr = `С ${fromFmt}`;
    }

    return `
    <div class="p-4 rounded-2xl bg-[#0e1320] border ${p.active ? 'border-amber-500/30' : 'border-gray-800 opacity-60'} flex flex-col justify-between gap-3 shadow-sm">
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="font-mono font-black text-amber-400 text-base tracking-wider">${p.code}</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">-${p.discount}%</span>
          </div>
          <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${p.active ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-gray-800 text-gray-400'}">
            ${p.active ? 'Активен' : 'Выключен'}
          </span>
        </div>

        <p class="text-[11px] text-gray-300 font-medium">${p.desc || 'Скидка на товары'}</p>
        
        <div class="space-y-1 mt-2.5 pt-2.5 border-t border-gray-800/80 text-[10px] text-gray-400">
          <div class="flex items-center justify-between">
            <span>Применимость:</span>
            <span class="text-amber-300 font-semibold">${targetScope}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Использовано:</span>
            <span class="font-mono text-gray-200 font-bold">${maxUsesStr}</span>
          </div>
          ${timeStr ? `
            <div class="flex items-center justify-between">
              <span>Период:</span>
              <span class="text-yellow-300 font-mono">${timeStr}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-gray-800/60">
        <button onclick="openPromoEditModal('${p.code}')" class="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-xs flex items-center gap-1 transition">
          <i data-lucide="edit" class="w-3.5 h-3.5"></i> Изменить
        </button>
        <button onclick="togglePromoActive('${p.code}')" class="p-1.5 rounded-xl ${p.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'} transition" title="${p.active ? 'Выключить' : 'Включить'}">
          <i data-lucide="${p.active ? 'check-circle' : 'circle'}" class="w-4 h-4"></i>
        </button>
        <button onclick="deletePromo('${p.code}')" class="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition" title="Удалить">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `}).join('');

  lucide.createIcons();
}

function openPromoEditModal(code) {
  playSound('click');
  const modal = document.getElementById('promoModal');
  const title = document.getElementById('promoModalTitle');
  if (!modal) return;

  if (code) {
    const promo = (storeData.promoCodes || []).find(p => p.code === code);
    if (promo) {
      if (title) title.innerText = `Редактирование: ${promo.code}`;
      document.getElementById('modalPromoOriginalCode').value = promo.code;
      document.getElementById('modalPromoCode').value = promo.code;
      document.getElementById('modalPromoDiscount').value = promo.discount || 20;
      document.getElementById('modalPromoMaxUses').value = promo.max_uses || 0;
      document.getElementById('modalPromoUsedCount').value = promo.used_count || 0;
      document.getElementById('modalPromoAppliesTo').value = promo.applies_to || 'all';
      document.getElementById('modalPromoValidFrom').value = promo.valid_from || '';
      document.getElementById('modalPromoValidUntil').value = promo.valid_until || '';
      document.getElementById('modalPromoDesc').value = promo.desc || '';
      document.getElementById('modalPromoActive').checked = promo.active !== false;
    }
  } else {
    if (title) title.innerText = "Создание нового промокода";
    document.getElementById('modalPromoOriginalCode').value = "";
    document.getElementById('modalPromoCode').value = "";
    document.getElementById('modalPromoDiscount').value = "25";
    document.getElementById('modalPromoMaxUses').value = "0";
    document.getElementById('modalPromoUsedCount').value = "0";
    document.getElementById('modalPromoAppliesTo').value = "all";
    document.getElementById('modalPromoValidFrom').value = "";
    document.getElementById('modalPromoValidUntil').value = "";
    document.getElementById('modalPromoDesc').value = "Скидка в честь вайпа";
    document.getElementById('modalPromoActive').checked = true;
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    lucide.createIcons();
  }, 10);
}

function closePromoModal() {
  playSound('click');
  const modal = document.getElementById('promoModal');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

function savePromoModal(e) {
  if (e) e.preventDefault();
  const orig = document.getElementById('modalPromoOriginalCode').value;
  const code = (document.getElementById('modalPromoCode').value || "").trim().toUpperCase();
  const disc = Number(document.getElementById('modalPromoDiscount').value) || 20;
  const maxUses = Number(document.getElementById('modalPromoMaxUses').value) || 0;
  const usedCount = Number(document.getElementById('modalPromoUsedCount').value) || 0;
  const appliesTo = document.getElementById('modalPromoAppliesTo').value || 'all';
  const validFrom = document.getElementById('modalPromoValidFrom').value || '';
  const validUntil = document.getElementById('modalPromoValidUntil').value || '';
  const desc = (document.getElementById('modalPromoDesc').value || "").trim();
  const active = document.getElementById('modalPromoActive').checked;

  if (!code) {
    showToast('Введите промокод!', '✕');
    return;
  }

  if (!storeData.promoCodes) storeData.promoCodes = [];
  
  if (orig) {
    storeData.promoCodes = storeData.promoCodes.filter(p => p.code !== orig);
  }

  storeData.promoCodes.push({
    code: code,
    discount: disc,
    max_uses: maxUses,
    used_count: usedCount,
    valid_from: validFrom,
    valid_until: validUntil,
    applies_to: appliesTo,
    desc: desc,
    active: active
  });

  closePromoModal();
  renderAdminPromos();
  updateStats();
  saveAllStoreData();
  showToast(`Промокод [${code}] сохранен!`, '🏷️');
}

function togglePromoActive(code) {
  const promo = (storeData.promoCodes || []).find(p => p.code === code);
  if (promo) {
    promo.active = !promo.active;
    renderAdminPromos();
    saveAllStoreData();
  }
}

function deletePromo(code) {
  if (!confirm(`Удалить промокод ${code}?`)) return;
  storeData.promoCodes = (storeData.promoCodes || []).filter(p => p.code !== code);
  renderAdminPromos();
  updateStats();
  saveAllStoreData();
  showToast('Промокод удален', '🗑️');
}

// Purchases Ticker Tab
function deduplicatePurchasesList(list) {
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
        timestamp: item.timestamp || Date.now(),
        is_upgrade: item.is_upgrade === true || item.is_upgrade === 'true',
        from_rank: item.from_rank || ''
      });
    }
  }
  return clean;
}

async function loadRecentPurchases() {
  let list = [];
  
  // 1. Load from local cache first
  try {
    const local = localStorage.getItem('flory_recent_purchases');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        list = deduplicatePurchasesList(parsed);
        renderAdminPurchases(list);
      }
    }
  } catch (e) {}

  // 2. Fetch from API
  try {
    const res = await fetch('/api/purchases');
    if (res.ok) {
      const json = await res.json();
      if (json.purchases && Array.isArray(json.purchases)) {
        list = deduplicatePurchasesList(json.purchases);
        try { localStorage.setItem('flory_recent_purchases', JSON.stringify(list)); } catch (e) {}
        renderAdminPurchases(list);
      }
      if (json.promoCodes && Array.isArray(json.promoCodes)) {
        storeData.promoCodes = json.promoCodes;
        try { localStorage.setItem('flory_store_catalog', JSON.stringify(storeData)); } catch (e) {}
        renderAdminPromos();
        updateStats();
      }
      return;
    }
  } catch (e) {}

  renderAdminPurchases(list);
}

function renderAdminPurchases(list) {
  const tbody = document.getElementById('adminPurchasesTableBody');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500">Покупок пока не зафиксировано</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((p, idx) => {
    const isUpgr = p.is_upgrade === true || p.is_upgrade === 'true' || (typeof p.item === 'string' && p.item.toLowerCase().startsWith('докуп'));
    const itemLabel = isUpgr
      ? `<div class="flex items-center gap-1.5 flex-wrap">
          <span class="px-2 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 font-brand font-extrabold text-[10px] uppercase tracking-wider">ДОКУП</span>
          <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-brand font-bold text-xs shadow-sm">Докуп: ${p.item}${p.from_rank ? ' (с ' + p.from_rank + ')' : ''}</span>
        </div>`
      : `<span class="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 font-brand font-bold text-xs shadow-sm">${p.item}</span>`;

    return `
      <tr class="hover:bg-gray-900/50 transition border-b border-gray-800/40">
        <td class="p-3.5 flex items-center gap-2.5">
          <span class="w-2.5 h-2.5 rounded-full ${isUpgr ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse"></span>
          <span class="font-bold text-white font-sans">${p.nick}</span>
        </td>
        <td class="p-3.5">
          ${itemLabel}
        </td>
        <td class="p-3.5">
          ${p.promo ? `<span class="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold text-[11px]">${p.promo}</span>` : `<span class="text-gray-600 font-mono text-[11px]">—</span>`}
        </td>
        <td class="p-3.5">
          ${(p.price !== undefined && p.price !== null && p.price !== '') ? `<span class="font-bold text-emerald-400 font-mono text-xs">${p.price} ₽</span>` : `<span class="text-gray-500 font-mono text-[11px]">—</span>`}
        </td>
        <td class="p-3.5 text-gray-400 font-mono text-[11px]">${p.time || 'недавно'}</td>
        <td class="p-3.5 text-right space-x-2">
          <button onclick="reDispatchPurchase('${p.nick}', '${p.item}')" class="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 font-bold text-[11px] transition">
            Выдать заново
          </button>
          <button onclick="deletePurchaseItem(${idx})" class="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/30 font-bold text-[11px] transition">
            Удалить
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function deletePurchaseItem(index) {
  if (!confirm('Удалить эту покупку из списка и базы данных?')) return;
  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', index })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.purchases) {
        localStorage.setItem('flory_recent_purchases', JSON.stringify(json.purchases));
      }
    }
  } catch (e) {}
  showToast('Покупка удалена', '✓');
  await loadRecentPurchases();
}

async function clearAllPurchases() {
  if (!confirm('Вы уверены, что хотите удалить ВСЕ покупки из ленты и базы данных?')) return;
  try {
    await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' })
    });
    localStorage.removeItem('flory_recent_purchases');
  } catch (e) {}
  showToast('Все покупки очищены!', '🗑️');
  await loadRecentPurchases();
}

async function openAddPurchaseModal() {
  const nick = prompt('Никнейм игрока (например, Devil_First_More):');
  if (!nick || !nick.trim()) return;
  const item = prompt('Название товара (например, Спартанец, Донат Кейс x3):');
  if (!item || !item.trim()) return;
  const isUpgr = confirm('Это докуп привилегии? (OK - Да, Отмена - Обычная покупка)');
  let fromRank = '';
  if (isUpgr) {
    fromRank = prompt('С какой привилегии докуп? (например, Берсерк):', 'Берсерк') || '';
  }
  const promo = prompt('Промокод (необязательно, например TWOUSE):', '');
  const price = prompt('Оплаченная сумма в ₽ (например, 200):', '');

  const newEntry = {
    nick: nick.trim(),
    item: item.trim(),
    promo: promo ? promo.trim().toUpperCase() : '',
    price: price ? Number(price) : null,
    is_upgrade: isUpgr,
    from_rank: fromRank ? fromRank.trim() : '',
    time: 'только что'
  };

  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry)
    });
    if (res.ok) {
      const json = await res.json();
      if (json.purchases) {
        localStorage.setItem('flory_recent_purchases', JSON.stringify(json.purchases));
      }
      if (json.promoCodes) {
        storeData.promoCodes = json.promoCodes;
        renderAdminPromos();
      }
    }
  } catch (e) {}

  showToast(`Покупка для ${nick} добавлена!`, '🎉');
  await loadRecentPurchases();
}

async function reDispatchPurchase(nick, item) {
  if (!confirm(`Повторно отправить команду выдачи [${item}] игроку ${nick} на сервер?`)) return;
  await dispatchConsoleCommand(`say [FloryAdmin] Повторная выдача товара [${item}] игроку ${nick}`, nick);
}

// Minecraft Server Console Dispatcher
function setConsoleTemplate(cmd) {
  const input = document.getElementById('consoleCommandInput');
  if (input) input.value = cmd;
}

async function dispatchConsoleCommand(customCmd, customPlayer) {
  const player = customPlayer || (document.getElementById('consolePlayerInput')?.value || "Devil_First_More").trim();
  const cmd = customCmd || (document.getElementById('consoleCommandInput')?.value || "").trim();
  const log = document.getElementById('consoleOutputLog');

  if (!cmd) {
    showToast('Введите команду!', '✕');
    return;
  }

  if (log) log.innerText = `[ОТПРАВКА НА СЕРВЕР]: ${cmd} (Игрок: ${player})...\n`;

  try {
    const res = await fetch('/api/admin-execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ command: cmd, player: player })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      playSound('success');
      showToast('Команда успешно выполнена на сервере!', '⚡');
      if (log) log.innerText += `[УСПЕХ]: ${data.message}\n` + JSON.stringify(data.server_response, null, 2);
    } else {
      playSound('click');
      showToast(data.error || 'Ошибка выполнения', '✕');
      if (log) log.innerText += `[ОШИБКА]: ${data.error || 'Сервер не ответил'}\n`;
    }
  } catch (e) {
    if (log) log.innerText += `[ОШИБКА СЕТИ]: ${e.message}\n`;
  }
}

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  if (adminToken) {
    showDashboard();
    await loadStoreData();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    lucide.createIcons();
  }
});
