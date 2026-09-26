import fs from 'fs';
import path from 'path';

const TMP_PATH = '/tmp/store-data.json';
const LOCAL_PATH = path.join(process.cwd(), 'store-data.json');

function reconcileStore(data) {
  if (!data) return data;
  if (!Array.isArray(data.promoCodes)) data.promoCodes = [];
  if (!Array.isArray(data.recentPurchases)) data.recentPurchases = [];
  if (!Array.isArray(data.processedOrders)) data.processedOrders = [];

  for (const promo of data.promoCodes) {
    if (!promo || !promo.code) continue;
    const pCode = String(promo.code).trim().toUpperCase();
    const purchaseCount = data.recentPurchases.filter(p => {
      const pPromo = p && p.promo ? String(p.promo).trim().toUpperCase() : '';
      return pPromo === pCode;
    }).length;
    promo.used_count = Math.max(Number(promo.used_count) || 0, purchaseCount);
  }
  return data;
}

function getStoreData() {
  let store = null;
  // 1. Try reading from /tmp first (Vercel serverless writable storage)
  try {
    if (fs.existsSync(TMP_PATH)) {
      const data = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
      if (data && data.categories) store = data;
    }
  } catch (e) {}

  // 2. Try reading from bundled store-data.json
  if (!store) {
    try {
      if (fs.existsSync(LOCAL_PATH)) {
        const data = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
        try { fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch (wErr) {}
        store = data;
      }
    } catch (e) {}
  }

  if (!store) {
    store = { categories: [], products: {}, promoCodes: [], recentPurchases: [], processedOrders: [] };
  }

  return reconcileStore(store);
}

function saveStoreData(data) {
  const reconciled = reconcileStore(data);
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(reconciled, null, 2), 'utf8');
  } catch (e) {}
  try {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(reconciled, null, 2), 'utf8');
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const store = getStoreData();

  // GET: Return recent purchases & promo codes
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      purchases: store.recentPurchases,
      promoCodes: store.promoCodes
    });
  }

  // DELETE: Clear all purchases
  if (req.method === 'DELETE') {
    store.recentPurchases = [];
    saveStoreData(store);
    return res.status(200).json({ success: true, purchases: [], promoCodes: store.promoCodes });
  }

  // POST: Record purchase or actions (clear, delete, use-promo)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};

      // Action: Clear all purchases
      if (body.action === 'clear') {
        store.recentPurchases = [];
        saveStoreData(store);
        return res.status(200).json({ success: true, purchases: [], promoCodes: store.promoCodes });
      }

      // Action: Delete purchase by index
      if (body.action === 'delete' && typeof body.index === 'number') {
        if (body.index >= 0 && body.index < store.recentPurchases.length) {
          store.recentPurchases.splice(body.index, 1);
          saveStoreData(store);
        }
        return res.status(200).json({ success: true, purchases: store.recentPurchases, promoCodes: store.promoCodes });
      }

      const { nick, item, time, price, promo, order_id, is_upgrade, from_rank } = body;
      const cleanNick = nick ? String(nick).trim() : '';
      const cleanItem = item ? String(item).trim() : '';
      const cleanPromo = promo ? String(promo).trim().toUpperCase() : '';
      const cleanPrice = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
      const cleanOrderId = order_id ? String(order_id).trim() : null;
      const isUpgr = is_upgrade === true || is_upgrade === 'true';
      const fromRnk = from_rank ? String(from_rank).trim() : '';

      // Deduplicate order_id processing
      const isAlreadyProcessed = cleanOrderId && store.processedOrders.includes(cleanOrderId);
      let didChange = false;

      // Increment promo usage (once per order_id, or if no order_id passed)
      if (cleanPromo && !isAlreadyProcessed) {
        const promoObj = store.promoCodes.find(p => p.code && (p.code.toUpperCase() === cleanPromo || cleanPromo.includes(p.code.toUpperCase())));
        if (promoObj) {
          promoObj.used_count = (Number(promoObj.used_count) || 0) + 1;
          console.log(`[PROMO INCREMENTED]: ${promoObj.code} -> ${promoObj.used_count}`);
          didChange = true;
        }
      }

      if (cleanOrderId && !isAlreadyProcessed) {
        store.processedOrders.push(cleanOrderId);
        if (store.processedOrders.length > 500) {
          store.processedOrders = store.processedOrders.slice(-500);
        }
        didChange = true;
      }

      if (cleanNick && cleanItem) {
        const now = Date.now();
        // Only treat as duplicate if same nick, same item AND within 15 seconds (e.g. webhook + redirect race condition)
        const isImmediateDuplicate = store.recentPurchases.length > 0 &&
          store.recentPurchases[0].nick.toLowerCase() === cleanNick.toLowerCase() &&
          store.recentPurchases[0].item.toLowerCase() === cleanItem.toLowerCase() &&
          (now - (store.recentPurchases[0].timestamp || 0) < 15000);

        if (!isImmediateDuplicate) {
          store.recentPurchases.unshift({
            nick: cleanNick,
            item: cleanItem,
            price: cleanPrice,
            promo: cleanPromo || '',
            time: time || 'только что',
            timestamp: now,
            order_id: cleanOrderId || '',
            is_upgrade: isUpgr,
            from_rank: fromRnk
          });
          if (store.recentPurchases.length > 30) {
            store.recentPurchases = store.recentPurchases.slice(0, 30);
          }
        } else {
          store.recentPurchases[0].time = time || 'только что';
          if (cleanPrice !== null) store.recentPurchases[0].price = cleanPrice;
          if (cleanPromo) store.recentPurchases[0].promo = cleanPromo;
          if (cleanOrderId) store.recentPurchases[0].order_id = cleanOrderId;
          if (isUpgr) store.recentPurchases[0].is_upgrade = isUpgr;
          if (fromRnk) store.recentPurchases[0].from_rank = fromRnk;
        }
        didChange = true;
      }

      if (didChange) {
        saveStoreData(store);
      }

      return res.status(200).json({
        success: true,
        purchases: store.recentPurchases,
        promoCodes: store.promoCodes
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
