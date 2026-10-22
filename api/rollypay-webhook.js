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

function verifySignature(payload, signingSecret, signatureHeader, timestampHeader) {
  if (!signatureHeader || !timestampHeader || !signingSecret) return true;

  const cleanSig = String(signatureHeader).trim().toLowerCase();
  const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const candidates = [
    rawString,
    rawString.trim(),
    JSON.stringify(payload)
  ];

  for (const c of candidates) {
    const computed = crypto
      .createHmac('sha256', signingSecret)
      .update(timestampHeader + '.' + c)
      .digest('hex')
      .toLowerCase();
    if (computed === cleanSig) return true;
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
    const signatureHeader = req.headers['x-signature'] || req.headers['X-Signature'] || '';
    const timestampHeader = req.headers['x-timestamp'] || req.headers['X-Timestamp'] || '';
    const signingSecret = process.env.ROLLYPAY_SIGNING_SECRET || '4SKTgwc3_ghT6pD9NPpDU6UCxSjOl0YNq8aDpQKC5YA';

    // Parse payload safely
    let payload = {};
    if (typeof req.body === 'string') {
      try { payload = JSON.parse(req.body); } catch (e) { payload = {}; }
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    }

    console.log('[ROLLYPAY WEBHOOK RECEIVED]:', {
      timestamp: timestampHeader,
      signature: signatureHeader ? signatureHeader.slice(0, 8) + '...' : 'NONE'
    });

    // Verify signature
    if (signatureHeader && timestampHeader) {
      const valid = verifySignature(payload, signingSecret, signatureHeader, timestampHeader);
      if (!valid) {
        console.warn('[ROLLYPAY WEBHOOK]: Signature mismatch');
        return res.status(400).send('BAD SIGNATURE');
      }
    }

    const eventType = payload.event_type || payload.event || '';
    const paymentId = payload.payment_id || payload.id || payload.data?.payment_id || '';
    const orderId = payload.order_id || payload.data?.order_id || ('ROLLY-' + paymentId);
    const status = payload.status || payload.data?.status || '';
    const amount = Number(payload.amount || payload.data?.amount || 0);

    const isPaid = (
      eventType === 'payment.paid' ||
      status === 'paid' ||
      status === 'succeeded' ||
      status === 'completed'
    );

    if (!isPaid) {
      console.log('[ROLLYPAY WEBHOOK]: Acknowledging non-paid event:', eventType || status);
      return res.status(200).json({ status: 'ignored', event: eventType || status });
    }

    // Metadata extraction
    const meta = payload.metadata || payload.data?.metadata || {};
    const player = meta.player || payload.customer_id || '';
    const itemId = meta.item_id || '';
    const quantity = Math.max(1, parseInt(meta.quantity, 10) || 1);
    const promoCode = meta.promo || '';
    const isUpgrade = meta.is_upgrade === true || meta.is_upgrade === 'true';
    const upgradeFrom = meta.upgrade_from || '';

    if (!player || !itemId) {
      console.error('[ROLLYPAY WEBHOOK]: Missing player or itemId:', { player, itemId });
      return res.status(400).send('MISSING REQUIRED METADATA');
    }

    // Idempotency check
    const orderKeys = [orderId, paymentId].filter(Boolean);
    if (isOrderAlreadyProcessed(orderKeys)) {
      console.log('[ROLLYPAY WEBHOOK]: Order already processed (Idempotency Hit):', orderKeys);
      return res.status(200).json({ status: 'already_processed', order_id: orderId });
    }

    // Minecraft Command Dictionary
    const commandTemplates = {
      warrior: ['lp user {player} parent set warrior'],
      berserk: ['lp user {player} parent set berserk'],
      spartan: ['lp user {player} parent set spartan'],
      knight: ['lp user {player} parent set knight'],
      lord: ['lp user {player} parent set lord'],
      vladyka: ['lp user {player} parent set vladyka'],
      emperor: ['lp user {player} parent set emperor'],
      case_donate_1: ['dc give {player} donate 1'],
      case_donate_3: ['dc give {player} donate 3'],
      case_donate_10: ['dc give {player} donate 10'],
      case_tokens_1: ['dc give {player} tokens 1'],
      case_tokens_5: ['dc give {player} tokens 5'],
      case_tokens_15: ['dc give {player} tokens 15'],
      tokens_50: ['p give {player} 50'],
      tokens_100: ['p give {player} 100'],
      tokens_500: ['p give {player} 500'],
      tokens_1000: ['p give {player} 1000'],
      tokens_5000: ['p give {player} 5000'],
      tokens_10000: ['p give {player} 10000'],
      srv_unban: ['unban {player}', 'pardon {player}', 'unbanip {player}'],
      srv_unmute: ['unmute {player}']
    };

    const rawCommands = commandTemplates[itemId];
    if (!rawCommands) {
      console.error('[ROLLYPAY WEBHOOK]: Disallowed itemId:', itemId);
      return res.status(400).send('INVALID ITEM');
    }

    markOrderProcessed(orderKeys);

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

    // Deliver to FloryAutoDonate plugin
    const targetUrl = 'http://' + host + ':' + port + '/api/donate';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': donateSecretKey,
          'Authorization': 'Bearer ' + donateSecretKey
        },
        body: JSON.stringify(pluginPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const text = await resp.text().catch(() => '');
      console.log('[ROLLYPAY -> PLUGIN OK]:', resp.status, text);
    } catch (plugErr) {
      console.error('[ROLLYPAY -> PLUGIN ERROR]:', plugErr.message);
    }

    // Human-readable item name dictionary
    const itemNames = {
      warrior: 'Воин',
      berserk: 'Берсерк',
      spartan: 'Спартанец',
      knight: 'Рыцарь',
      lord: 'Лорд',
      vladyka: 'Владыка',
      emperor: 'Император',
      case_donate_1: 'Донат-Кейс (1 шт)',
      case_donate_3: 'Донат-Кейс (3 шт)',
      case_donate_10: 'Донат-Кейс (10 шт)',
      case_tokens_1: 'Кейс с токенами (1 шт)',
      case_tokens_5: 'Кейс с токенами (5 шт)',
      case_tokens_15: 'Кейс с токенами (15 шт)',
      tokens_50: '50 Токенов',
      tokens_100: '100 Токенов',
      tokens_500: '500 Токенов',
      tokens_1000: '1,000 Токенов',
      tokens_5000: '5,000 Токенов',
      tokens_10000: '10,000 Токенов',
      srv_unban: 'Разбан игрока',
      srv_unmute: 'Размут игрока'
    };

    const cleanItemName = (meta.item_name || itemNames[itemId] || itemId) + (quantity > 1 ? ' x' + quantity : '');

    try {
      fetch('https://florymine.fun/api/purchases', {
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

    return res.status(200).json({
      status: 'ok',
      order_id: orderId,
      player: player,
      item: cleanItemName
    });
  } catch (err) {
    console.error('[ROLLYPAY WEBHOOK ERROR]:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}
