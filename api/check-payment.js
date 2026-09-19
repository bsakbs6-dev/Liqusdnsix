// Vercel Serverless Function: Check & Verify YooKassa Payment Status
import fs from 'fs';
import path from 'path';

const TMP_PATH = '/tmp/store-data.json';
const LOCAL_PATH = path.join(process.cwd(), 'store-data.json');

function getStoreData() {
  try {
    if (fs.existsSync(TMP_PATH)) {
      const data = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
      if (data && data.categories) return data;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(LOCAL_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
      try { fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch (wErr) {}
      return data;
    }
  } catch (e) {}

  return { categories: [], products: {}, promoCodes: [], recentPurchases: [], processedOrders: [] };
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

    const shopId = process.env.YOOKASSA_SHOP_ID || '1470048';
    const secretKey = process.env.YOOKASSA_SECRET_KEY || 'test_ZJY4_fYM_0i5vlcCf_95ICzT_QcM5xpTTFBU3cV_qTU';
    const authHeader = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    let paymentData = null;

    if (yooId) {
      // Query YooKassa API directly
      const yooRes = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(yooId)}`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });
      if (yooRes.ok) {
        paymentData = await yooRes.json();
      }
    }

    if (!paymentData && orderId) {
      // Fallback: search recent payments by orderId in metadata
      const listRes = await fetch('https://api.yookassa.ru/v3/payments?limit=25', {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      });
      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson && Array.isArray(listJson.items)) {
          paymentData = listJson.items.find(item => item.metadata?.order_id === orderId || item.id === orderId) || null;
        }
      }
    }

    if (!paymentData) {
      return res.status(200).json({
        success: true,
        paid: false,
        status: 'unknown',
        error: 'Платёж не найден в платёжной системе ЮKassa'
      });
    }

    const isPaid = (paymentData.status === 'succeeded' || paymentData.status === 'waiting_for_capture') && (paymentData.paid === true);

    if (!isPaid) {
      return res.status(200).json({
        success: true,
        paid: false,
        status: paymentData.status || 'canceled',
        error: paymentData.cancellation_details?.reason || 'Платёж не был оплачен или был отменён'
      });
    }

    // Payment is genuinely SUCCEEDED / PAID!
    const metadata = paymentData.metadata || {};
    const player = metadata.player || '';
    const itemId = metadata.item_id || 'item';
    const itemName = metadata.item_name || itemId;
    const promoCode = (metadata.promo || '').trim().toUpperCase();
    const cleanPrice = Number(paymentData.amount?.value) || Number(metadata.price) || 0;
    const safeOrderId = metadata.order_id || orderId || yooId;

    const store = getStoreData();
    if (!Array.isArray(store.recentPurchases)) store.recentPurchases = [];
    if (!Array.isArray(store.promoCodes)) store.promoCodes = [];
    if (!Array.isArray(store.processedOrders)) store.processedOrders = [];

    const isAlreadyProcessed = safeOrderId && store.processedOrders.includes(safeOrderId);

    if (!isAlreadyProcessed) {
      // 1. Deliver to Minecraft Server Plugin
      const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
      const port = process.env.MINECRAFT_PORT || '25933';
      const donateSecretKey = process.env.DONATE_SECRET_KEY || 'CHANGE_ME_SECRET_KEY';

      const commandTemplates = {
        warrior: ["lp user {player} parent set voin"],
        berserk: ["lp user {player} parent set berserk"],
        spartan: ["lp user {player} parent set spartanec"],
        knight: ["lp user {player} parent set rytsart"],
        lord: ["lp user {player} parent set lord"],
        vladyka: ["lp user {player} parent set vladika"],
        emperor: ["lp user {player} parent set imperator"],

        case_donate_1: ["florycase give {player} 1 donate"],
        case_donate_3: ["florycase give {player} 3 donate"],
        case_donate_10: ["florycase give {player} 10 donate"],
        case_tokens_1: ["florycase give {player} 1 tokens"],
        case_tokens_5: ["florycase give {player} 5 tokens"],
        case_tokens_15: ["florycase give {player} 15 tokens"],

        tokens_50: ["p give {player} 50"],
        tokens_100: ["p give {player} 100"],
        tokens_500: ["p give {player} 500"],
        tokens_1000: ["p give {player} 1000"],
        tokens_5000: ["p give {player} 5000"],
        tokens_10000: ["p give {player} 10000"],

        srv_unban: ["unban {player}", "pardon {player}", "unbanip {player}"],
        srv_unmute: ["unmute {player}"]
      };

      const rawCommands = commandTemplates[itemId] || [`lp user {player} parent set ${itemId}`];
      const commands = rawCommands.map(cmd => cmd.replace(/\{player\}/g, player));

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        await fetch(`http://${host}:${port}/api/donate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': donateSecretKey,
            'Authorization': `Bearer ${donateSecretKey}`
          },
          body: JSON.stringify({
            transaction_id: `YOO-${yooId}`,
            player: player,
            item_id: itemId,
            item_name: itemName,
            quantity: Number(metadata.quantity) || 1,
            commands: commands,
            price: cleanPrice,
            timestamp: new Date().toISOString()
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (err) {}

      // 2. Increment promo code
      if (promoCode) {
        const promoObj = store.promoCodes.find(p => p.code && p.code.toUpperCase() === promoCode);
        if (promoObj) {
          promoObj.used_count = (Number(promoObj.used_count) || 0) + 1;
        }
      }

      // 3. Record purchase to live ticker
      if (player && itemName) {
        store.recentPurchases.unshift({
          nick: player,
          item: itemName,
          price: cleanPrice,
          promo: promoCode || '',
          time: 'только что',
          timestamp: Date.now(),
          order_id: safeOrderId
        });
        if (store.recentPurchases.length > 30) {
          store.recentPurchases = store.recentPurchases.slice(0, 30);
        }
      }

      if (safeOrderId) {
        store.processedOrders.push(safeOrderId);
        if (store.processedOrders.length > 500) {
          store.processedOrders = store.processedOrders.slice(-500);
        }
      }

      saveStoreData(store);
    }

    return res.status(200).json({
      success: true,
      paid: true,
      status: 'succeeded',
      player: player,
      item: itemName,
      price: cleanPrice,
      promo: promoCode,
      promoCodes: store.promoCodes
    });
  } catch (err) {
    return res.status(500).json({ success: false, paid: false, error: err.message });
  }
}