// Vercel Serverless Function: RollyPay Webhook Handler -> FloryAutoDonate Plugin
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TMP_PATH = '/tmp/store-data.json';
const LOCAL_PATH = path.join(process.cwd(), 'store-data.json');

function isOrderAlreadyProcessed(keys) {
  const paths = [TMP_PATH, LOCAL_PATH];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data && Array.isArray(data.processedOrders)) {
          if (keys.some(k => k && data.processedOrders.includes(k))) {
            return true;
          }
        }
      }
    } catch (e) {}
  }
  return false;
}

function markOrderProcessed(keys) {
  const validKeys = keys.filter(Boolean);
  if (validKeys.length === 0) return;
  let store = null;
  try {
    if (fs.existsSync(TMP_PATH)) {
      store = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
    }
  } catch (e) {}
  if (!store) {
    try {
      if (fs.existsSync(LOCAL_PATH)) {
        store = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
      }
    } catch (e) {}
  }
  if (!store) return;
  if (!Array.isArray(store.processedOrders)) store.processedOrders = [];
  for (const k of validKeys) {
    if (!store.processedOrders.includes(k)) {
      store.processedOrders.push(k);
    }
  }
  if (store.processedOrders.length > 500) {
    store.processedOrders = store.processedOrders.slice(-500);
  }
  try { fs.writeFileSync(TMP_PATH, JSON.stringify(store, null, 2), 'utf8'); } catch (e) {}
  try { fs.writeFileSync(LOCAL_PATH, JSON.stringify(store, null, 2), 'utf8'); } catch (e) {}
}

async function getRawBody(req) {
  if (req.rawBody) return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length > 0) {
      return Buffer.concat(chunks).toString('utf8');
    }
  } catch (e) {}

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return '';
}

function verifySignature(rawBody, bodyObj, signingSecret, signatureHeader, timestampHeader) {
  if (!signatureHeader || !timestampHeader) return false;

  const candidates = [];
  if (rawBody && typeof rawBody === 'string') {
    candidates.push(rawBody);
    candidates.push(rawBody.trim());
  }
  if (bodyObj && typeof bodyObj === 'object') {
    try {
      candidates.push(JSON.stringify(bodyObj));
    } catch (e) {}
  }

  const cleanSig = String(signatureHeader).trim().toLowerCase();

  for (const c of candidates) {
    if (!c) continue;
    const computed = crypto
      .createHmac('sha256', signingSecret)
      .update(`${timestampHeader}.${c}`)
      .digest('hex')
      .toLowerCase();
    if (computed === cleanSig) {
      return true;
    }
  }
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature, X-Timestamp, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'RollyPay Webhook Bridge',
      terminal: '1ecd2e72-0287-4430-90ac-3f72b336c495',
      status: 'active'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const rawBody = await getRawBody(req);
    const signatureHeader = req.headers['x-signature'] || req.headers['X-Signature'] || '';
    const timestampHeader = req.headers['x-timestamp'] || req.headers['X-Timestamp'] || '';
    const signingSecret = process.env.ROLLYPAY_SIGNING_SECRET || '4SKTgwc3_ghT6pD9NPpDU6UCxSjOl0YNq8aDpQKC5YA';
    const apiKey = process.env.ROLLYPAY_API_KEY || 'uXPh603dgcneP4lZ6lQcdiICifPJ4wyYx1OCCHhbFI8';

    // Parse payload
    let payload = {};
    if (req.body && typeof req.body === 'object') {
      payload = req.body;
    } else if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (e) {
        return res.status(400).send('INVALID JSON BODY');
      }
    }

    console.log('[ROLLYPAY WEBHOOK RECEIVED]:', {
      timestamp: timestampHeader,
      signature: signatureHeader ? `${signatureHeader.slice(0, 10)}...` : 'NONE',
      hasPayload: Boolean(payload)
    });

    // 1. Verify HMAC-SHA256 Signature
    const isSigValid = verifySignature(rawBody, payload, signingSecret, signatureHeader, timestampHeader);

    if (!isSigValid) {
      console.warn('[ROLLYPAY WEBHOOK]: Signature mismatch or missing headers', {
        receivedSig: signatureHeader,
        timestamp: timestampHeader
      });
      return res.status(400).send('BAD SIGNATURE');
    }

    const eventType = payload.event_type || payload.event || '';
    const paymentId = payload.payment_id || payload.id || payload.data?.payment_id || '';
    const orderId = payload.order_id || payload.data?.order_id || `ROLLY-${paymentId}`;
    const status = payload.status || payload.data?.status || '';
    const amount = Number(payload.amount || payload.data?.amount || 0);

    // Only process successful payments
    const isPaid = (
      eventType === 'payment.paid' ||
      status === 'paid' ||
      status === 'succeeded' ||
      status === 'completed'
    );

    if (!isPaid) {
      console.log(`[ROLLYPAY WEBHOOK]: Acknowledging non-paid event: ${eventType || status}`);
      return res.status(200).json({ status: 'acknowledged', event: eventType || status });
    }

    // 2. Deduplicate to ensure 100% idempotent delivery (never grant items twice)
    const orderKeys = [orderId, paymentId, `ROLLY-${orderId}`, `ROLLY-${paymentId}`].filter(Boolean);
    if (isOrderAlreadyProcessed(orderKeys)) {
      console.log(`[ROLLYPAY WEBHOOK]: Order ${orderId} (${paymentId}) already processed. Skipping duplicate execution.`);
      return res.status(200).json({ status: 'already_processed', order_id: orderId });
    }

    // 3. Extract metadata (either directly from payload or fetch from RollyPay API)
    let meta = payload.metadata || payload.data?.metadata || payload.payment?.metadata || {};

    if ((!meta || !meta.player) && paymentId) {
      try {
        const fetchResp = await fetch(`https://api.rollypay.io/api/v1/payments/${paymentId}`, {
          headers: { 'X-API-Key': apiKey }
        });
        if (fetchResp.ok) {
          const detail = await fetchResp.json();
          if (detail && detail.metadata) {
            meta = detail.metadata;
          }
        }
      } catch (fErr) {
        console.error('[ROLLYPAY WEBHOOK]: Failed to fetch payment detail fallback:', fErr.message);
      }
    }

    const player = String(meta.player || payload.customer_id || '').trim();
    const itemId = String(meta.item_id || 'warrior').trim();
    const quantity = Math.max(1, Math.min(99, parseInt(meta.quantity, 10) || 1));
    const promoCode = String(meta.promo || '').trim().toUpperCase();
    const isUpgrade = meta.is_upgrade === true || meta.is_upgrade === 'true';
    const upgradeFrom = String(meta.upgrade_from || '').trim();

    if (!player || !/^[a-zA-Z0-9_]{3,16}$/.test(player)) {
      console.error('[ROLLYPAY WEBHOOK]: Invalid player nickname in metadata:', player);
      return res.status(400).send('INVALID PLAYER NICKNAME');
    }

    // Whitelisted Minecraft commands mapping
    const commandTemplates = {
      // Ranks (DeluxeMenus hierarchy)
      warrior: ["lp user {player} parent add voin"],
      berserk: ["lp user {player} parent add berserk"],
      spartan: ["lp user {player} parent add spartanec"],
      knight: ["lp user {player} parent add rytsart"],
      lord: ["lp user {player} parent add lord"],
      vladyka: ["lp user {player} parent add vladika"],
      emperor: ["lp user {player} parent add imperator"],

      // Cases
      case_donate_1: ["florycase give {player} 1 donate"],
      case_donate_3: ["florycase give {player} 3 donate"],
      case_donate_10: ["florycase give {player} 10 donate"],
      case_tokens_1: ["florycase give {player} 1 tokens"],
      case_tokens_5: ["florycase give {player} 5 tokens"],
      case_tokens_15: ["florycase give {player} 15 tokens"],

      // Currency
      tokens_50: ["p give {player} 50"],
      tokens_100: ["p give {player} 100"],
      tokens_500: ["p give {player} 500"],
      tokens_1000: ["p give {player} 1000"],
      tokens_5000: ["p give {player} 5000"],
      tokens_10000: ["p give {player} 10000"],

      // Services
      srv_unban: ["unban {player}", "pardon {player}", "unbanip {player}"],
      srv_unmute: ["unmute {player}"]
    };

    const rawCommands = commandTemplates[itemId];
    if (!rawCommands) {
      console.error('[ROLLYPAY WEBHOOK]: Disallowed itemId:', itemId);
      return res.status(400).send('INVALID ITEM');
    }

    // Mark as processed immediately before dispatching to block race conditions
    markOrderProcessed(orderKeys);

    // Build repeated command list for multi-item quantities (e.g. 5x cases or tokens)
    const unitCommands = rawCommands.map(cmd => cmd.replace(/\{player\}/g, player));
    const isMultiUnit = itemId.startsWith('case_') || itemId.startsWith('tokens_');
    const repeatCount = isMultiUnit ? quantity : 1;
    const commands = [];
    for (let i = 0; i < repeatCount; i++) {
      commands.push(...unitCommands);
    }

    const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
    const port = process.env.MINECRAFT_PORT || '25933';
    const donateSecretKey = process.env.DONATE_SECRET_KEY || 'CHANGE_ME_SECRET_KEY';

    const pluginPayload = {
      transaction_id: orderId,
      player: player,
      item_id: itemId,
      item_name: meta.item_name || itemId,
      quantity: quantity,
      require_online: false,
      commands: commands,
      price: amount,
      is_upgrade: isUpgrade,
      upgrade_from: upgradeFrom,
      gateway: 'rollypay',
      payment_id: paymentId,
      timestamp: new Date().toISOString()
    };

    // Deliver to FloryAutoDonate plugin on Minecraft Server
    const targetUrl = `http://${host}:${port}/api/donate`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': donateSecretKey,
          'Authorization': `Bearer ${donateSecretKey}`
        },
        body: JSON.stringify(pluginPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const respText = await response.text().catch(() => '');
      console.log('[ROLLYPAY -> PLUGIN OK]:', response.status, respText);
    } catch (plugErr) {
      console.error('[ROLLYPAY -> PLUGIN ERROR]:', plugErr.message);
    }

    // Human-readable item name dictionary
    const itemNames = {
      warrior: "Воин",
      berserk: "Берсерк",
      spartan: "Спартанец",
      knight: "Рыцарь",
      lord: "Лорд",
      vladyka: "Владыка",
      emperor: "Император",
      case_donate_1: "Донат-Кейс (1 шт)",
      case_donate_3: "Донат-Кейс (3 шт)",
      case_donate_10: "Донат-Кейс (10 шт)",
      case_tokens_1: "Кейс с токенами (1 шт)",
      case_tokens_5: "Кейс с токенами (5 шт)",
      case_tokens_15: "Кейс с токенами (15 шт)",
      tokens_50: "50 Токенов",
      tokens_100: "100 Токенов",
      tokens_500: "500 Токенов",
      tokens_1000: "1,000 Токенов",
      tokens_5000: "5,000 Токенов",
      tokens_10000: "10,000 Токенов",
      srv_unban: "Разбан игрока",
      srv_unmute: "Размут игрока"
    };

    const cleanItemName = (meta.item_name || itemNames[itemId] || itemId) + (quantity > 1 ? ` x${quantity}` : '');

    // Record to recent purchases live ticker
    try {
      const siteUrl = 'https://florymine.fun';
      fetch(`${siteUrl}/api/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nick: player,
          item: cleanItemName,
          price: amount,
          promo: promoCode,
          order_id: orderId,
          is_upgrade: isUpgrade,
          from_rank: upgradeFrom,
          time: 'только что'
        })
      }).catch(() => {});
    } catch (e) {}

    // RollyPay requires 2xx response within 10s to acknowledge receipt
    return res.status(200).json({
      status: 'ok',
      order_id: orderId,
      player: player,
      item: cleanItemName
    });

  } catch (err) {
    console.error('[ROLLYPAY WEBHOOK FATAL ERROR]:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}
