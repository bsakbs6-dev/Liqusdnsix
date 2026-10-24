import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TMP_PATH = '/tmp/store-data.json';
const LOCAL_PATH = path.join(process.cwd(), 'store-data.json');

function verifyAdminToken(req) {
  const token = req.headers['x-admin-token'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : '');
  if (!token) return false;

  const secretJwtKey = (process.env.ADMIN_SECRET || '').trim();
  if (!secretJwtKey) return false;

  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return false;

    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', secretJwtKey).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    const parts = payload.split(':');
    if (parts.length >= 3) {
      const expiresAt = parseInt(parts[1], 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

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

let lastRemoteFetchTime = 0;

async function fetchRemotePurchases() {
  const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
  const port = process.env.MINECRAFT_PORT || '25933';
  const url = `http://${host}:${port}/api/recent-purchases?limit=30`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.purchases)) {
        return data.purchases;
      }
    }
  } catch (e) {
    // Minecraft server down or timeout - graceful fallback
  }
  return null;
}

function mergePurchases(localList, remoteList) {
  const combined = [...(Array.isArray(localList) ? localList : [])];
  if (Array.isArray(remoteList)) {
    for (const r of remoteList) {
      if (!r || !r.nick || !r.item) continue;
      combined.push(r);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const item of combined) {
    if (!item || !item.nick || !item.item) continue;
    const cleanNick = String(item.nick).trim();
    const cleanItem = String(item.item).trim();
    const orderKey = item.order_id ? String(item.order_id).trim() : '';
    const key = orderKey ? `order_${orderKey}` : `${cleanNick.toLowerCase()}_${cleanItem.toLowerCase()}_${Math.floor((item.timestamp || 0) / 20000)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      nick: cleanNick,
      item: cleanItem,
      price: (item.price !== undefined && item.price !== null && item.price !== '') ? Number(item.price) : null,
      promo: item.promo ? String(item.promo).trim().toUpperCase() : '',
      time: item.time || 'только что',
      timestamp: item.timestamp || Date.now(),
      order_id: orderKey,
      is_upgrade: item.is_upgrade === true || item.is_upgrade === 'true',
      from_rank: item.from_rank || ''
    });
  }

  deduped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return deduped.slice(0, 30);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const store = getStoreData();

  // GET: Return recent purchases & promo codes
  if (req.method === 'GET') {
    const now = Date.now();
    // Rehydrate from Minecraft server SQLite if local is empty or cache expired (>15s)
    if (store.recentPurchases.length === 0 || now - lastRemoteFetchTime > 15000) {
      lastRemoteFetchTime = now;
      const remotePurchases = await fetchRemotePurchases();
      if (remotePurchases && remotePurchases.length > 0) {
        store.recentPurchases = mergePurchases(store.recentPurchases, remotePurchases);
        saveStoreData(store);
      }
    }

    return res.status(200).json({
      success: true,
      purchases: store.recentPurchases,
      promoCodes: store.promoCodes
    });
  }

  // DELETE: Clear all purchases (Admin only)
  if (req.method === 'DELETE') {
    if (!verifyAdminToken(req)) {
      return res.status(401).json({ success: false, error: 'Необходима авторизация администратора' });
    }
    store.recentPurchases = [];
    saveStoreData(store);
    return res.status(200).json({ success: true, purchases: [], promoCodes: store.promoCodes });
  }

  // POST: Record purchase or actions (clear, delete, use-promo)
  if (req.method === 'POST') {
    try {
      const body = req.body || {};

      // Action: Clear all purchases (Admin only)
      if (body.action === 'clear') {
        if (!verifyAdminToken(req)) {
          return res.status(401).json({ success: false, error: 'Необходима авторизация администратора' });
        }
        store.recentPurchases = [];
        saveStoreData(store);
        return res.status(200).json({ success: true, purchases: [], promoCodes: store.promoCodes });
      }

      // Action: Delete purchase by index (Admin only)
      if (body.action === 'delete' && typeof body.index === 'number') {
        if (!verifyAdminToken(req)) {
          return res.status(401).json({ success: false, error: 'Необходима авторизация администратора' });
        }
        if (body.index >= 0 && body.index < store.recentPurchases.length) {
          store.recentPurchases.splice(body.index, 1);
          saveStoreData(store);
        }
        return res.status(200).json({ success: true, purchases: store.recentPurchases, promoCodes: store.promoCodes });
      }

      const { nick, item, time, price, promo, order_id, is_upgrade, from_rank } = body;
      const rawNick = nick ? String(nick).trim() : '';
      const cleanNick = /^[a-zA-Z0-9_]{3,16}$/.test(rawNick) ? rawNick : '';
      const cleanItem = item ? String(item).trim().slice(0, 80) : '';
      const cleanPromo = promo ? String(promo).trim().toUpperCase().slice(0, 32) : '';
      const cleanPrice = (price !== undefined && price !== null && price !== '') ? Number(price) : null;
      const cleanOrderId = order_id ? String(order_id).trim().slice(0, 64) : null;
      const isUpgr = is_upgrade === true || is_upgrade === 'true';
      const fromRnk = from_rank ? String(from_rank).trim().slice(0, 32) : '';

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
