// Vercel Serverless Function: Check & Verify Payment Status
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
  try {
    if (fs.existsSync(TMP_PATH)) {
      const data = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
      if (data && data.categories) store = data;
    }
  } catch (e) {}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const yooId = req.query.yoo_id || req.body?.yoo_id || '';
    const orderId = req.query.order_id || req.body?.order_id || '';

    if (!yooId && !orderId) {
      return res.status(400).json({ success: false, paid: false, error: 'Payment ID is required' });
    }

    const store = getStoreData();
    const existing = (store.recentPurchases || []).find(p => p.order_id === orderId || (yooId && p.order_id === yooId));
    if (existing) {
      return res.status(200).json({
        success: true,
        paid: true,
        status: 'succeeded',
        player: existing.nick,
        item: existing.item,
        price: existing.price,
        promo: existing.promo,
        is_upgrade: existing.is_upgrade,
        from_rank: existing.from_rank,
        promoCodes: store.promoCodes
      });
    }

    // If not found in processed purchases, payment is either pending or unconfirmed
    return res.status(200).json({
      success: true,
      paid: false,
      status: 'pending',
      error: 'Платёж ещё обрабатывается или ожидает подтверждения'
    });
  } catch (err) {
    return res.status(500).json({ success: false, paid: false, error: err.message });
  }
}