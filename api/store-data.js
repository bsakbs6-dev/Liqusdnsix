// Vercel Serverless Function: Store Data Management (Products, Categories, Promos)
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SECRET_JWT_KEY = process.env.ADMIN_SECRET || 'florymine_super_admin_secret_2026';
const TMP_PATH = '/tmp/store-data.json';
const LOCAL_PATH = path.join(process.cwd(), 'store-data.json');

let memoryStore = null;

function verifyAdminToken(req) {
  const token = req.headers['x-admin-token'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : '');
  if (!token) return false;

  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return false;

    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', SECRET_JWT_KEY).update(payload).digest('hex');

    return signature === expectedSig;
  } catch (e) {
    return false;
  }
}

function getStoreData() {
  // 1. Try reading from /tmp first
  try {
    if (fs.existsSync(TMP_PATH)) {
      const data = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
      if (data && data.categories) return data;
    }
  } catch (e) {}

  // 2. Try reading from bundled file
  try {
    if (fs.existsSync(LOCAL_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
      try { fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch (wErr) {}
      return data;
    }
  } catch (e) {}

  return {
    categories: [
      { id: "all", name: "Все товары", icon: "sparkles" },
      { id: "privileges", name: "Привилегии", icon: "crown" },
      { id: "cases", name: "Кейсы", icon: "box" },
      { id: "currency", name: "Валюта", icon: "coins" },
      { id: "services", name: "Услуги", icon: "wrench" }
    ],
    products: {},
    promoCodes: [],
    recentPurchases: []
  };
}

function saveStoreData(data) {
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
  try {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Public or admin catalog lookup
  if (req.method === 'GET') {
    const store = getStoreData();
    return res.status(200).json({
      success: true,
      data: store
    });
  }

  // POST: Admin update of catalog
  if (req.method === 'POST') {
    if (!verifyAdminToken(req)) {
      return res.status(403).json({ success: false, error: 'Доступ запрещен. Недействительный токен администратора.' });
    }

    try {
      const { categories, products, promoCodes } = req.body || {};

      if (!categories || !products) {
        return res.status(400).json({ success: false, error: 'Некорректная структура данных' });
      }

      const existingStore = getStoreData();
      const updatedStore = {
        categories: categories,
        products: products,
        promoCodes: promoCodes || [],
        recentPurchases: existingStore.recentPurchases || [],
        updated_at: req.body.updated_at || Date.now()
      };

      saveStoreData(updatedStore);

      return res.status(200).json({
        success: true,
        message: 'Каталог товаров и промокоды успешно сохранены!',
        data: updatedStore
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
