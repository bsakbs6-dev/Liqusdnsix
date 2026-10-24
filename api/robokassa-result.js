// Vercel Serverless Function: Robokassa ResultURL Webhook Handler -> FloryAutoDonate Plugin
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Parse query and body (supporting both JSON and urlencoded strings)
    let bodyObj = {};
    if (req.body) {
      if (typeof req.body === 'string') {
        try {
          bodyObj = JSON.parse(req.body);
        } catch {
          bodyObj = Object.fromEntries(new URLSearchParams(req.body));
        }
      } else if (typeof req.body === 'object') {
        bodyObj = req.body;
      }
    }

    const params = { ...(req.query || {}), ...bodyObj };
    console.log('[ROBOKASSA RESULT RECEIVED]:', JSON.stringify(params));

    const outSum = params.OutSum || params.out_sum;
    const invId = params.InvId || params.inv_id;
    const signatureValue = params.SignatureValue || params.crc;

    if (!outSum || invId === undefined || !signatureValue) {
      console.warn('[ROBOKASSA RESULT]: Missing required parameters (OutSum, InvId, SignatureValue)');
      return res.status(400).send('BAD REQUEST');
    }

    const password2 = (process.env.ROBOKASSA_PASSWORD_2 || '').trim();
    const password1 = (process.env.ROBOKASSA_PASSWORD_1 || '').trim();

    if (!password2 && !password1) {
      console.error('[ROBOKASSA RESULT ERROR]: Missing ROBOKASSA_PASSWORD_1 or ROBOKASSA_PASSWORD_2 in environment variables');
      return res.status(500).send('SERVER_CONFIGURATION_ERROR');
    }

    // Collect all Shp_ parameters
    const shpParams = {};
    for (const key of Object.keys(params)) {
      if (key.startsWith('Shp_') || key.startsWith('shp_')) {
        shpParams[key] = params[key];
      }
    }

    // Sort Shp_ params alphabetically
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpString = sortedShpKeys.map(k => `${k}=${shpParams[k]}`).join(':');

    // Expected signature: OutSum:InvId:Password#2:Shp_... (ResultURL webhook) or OutSum:InvId:Password#1:Shp_... (SuccessURL redirect)
    const rawSig2 = `${outSum}:${invId}:${password2}` + (shpString ? `:${shpString}` : '');
    const calcSig2 = crypto.createHash('md5').update(rawSig2).digest('hex').toLowerCase();

    const rawSig1 = `${outSum}:${invId}:${password1}` + (shpString ? `:${shpString}` : '');
    const calcSig1 = crypto.createHash('md5').update(rawSig1).digest('hex').toLowerCase();

    const receivedSig = String(signatureValue).toLowerCase();

    if (receivedSig !== calcSig2 && receivedSig !== calcSig1) {
      console.error('[ROBOKASSA RESULT]: Signature mismatch!', {
        received: signatureValue,
        calculated2: calcSig2
      });
      return res.status(400).send('BAD SIGNATURE');
    }

    // Signature verified! Deliver donate to Minecraft server
    const rawPlayer = shpParams['Shp_player'] || params['Shp_player'] || '';
    const player = String(rawPlayer).trim();
    const itemId = String(shpParams['Shp_item'] || params['Shp_item'] || 'warrior').trim();
    const quantity = Math.max(1, Math.min(99, parseInt(shpParams['Shp_qty'] || params['Shp_qty'], 10) || 1));
    const amount = Number(outSum);
    const promoCode = String(shpParams['Shp_promo'] || params['Shp_promo'] || '').trim().toUpperCase();
    const orderId = String(shpParams['Shp_order'] || params['Shp_order'] || `ROBO-${invId}`).trim();
    const roboTxId = `ROBO-${invId}`;
    const isUpgrade = (shpParams['Shp_upgr'] || params['Shp_upgr']) === '1';
    const upgradeFrom = String(shpParams['Shp_upfrom'] || params['Shp_upfrom'] || '').trim();

    if (player && /^[a-zA-Z0-9_]{3,16}$/.test(player)) {
      const commandTemplates = {
        warrior: ["lp user {player} parent add voin"],
        berserk: ["lp user {player} parent add berserk"],
        spartan: ["lp user {player} parent add spartanec"],
        knight: ["lp user {player} parent add rytsart"],
        lord: ["lp user {player} parent add lord"],
        vladyka: ["lp user {player} parent add vladika"],
        emperor: ["lp user {player} parent add imperator"],

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

      const rawCommands = commandTemplates[itemId];
      if (!rawCommands) {
        console.error('[ROBOKASSA RESULT]: Disallowed itemId:', itemId);
        return res.status(400).send('INVALID ITEM');
      }

      // Deduplicate order so webhook + success redirect never grant items twice
      const alreadyDone = isOrderAlreadyProcessed([roboTxId, orderId]);
      if (alreadyDone) {
        console.log(`[ROBOKASSA RESULT]: Order ${orderId} (${roboTxId}) already processed, skipping duplicate dispatch.`);
        return res.status(200).send(`OK${invId}`);
      }
      markOrderProcessed([roboTxId, orderId]);

      const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
      const port = process.env.MINECRAFT_PORT || '25933';
      const secretKey = (process.env.DONATE_SECRET_KEY || '').trim();

      const unitCommands = rawCommands.map(cmd => cmd.replace(/\{player\}/g, player));
      const isMultiUnit = itemId.startsWith('case_') || itemId.startsWith('tokens_');
      const repeatCount = isMultiUnit ? quantity : 1;
      const commands = [];
      for (let i = 0; i < repeatCount; i++) {
        commands.push(...unitCommands);
      }

      const pluginPayload = {
        transaction_id: roboTxId,
        player: player,
        item_id: itemId,
        item_name: itemId,
        quantity: quantity,
        require_online: false,
        commands: commands,
        price: amount,
        is_upgrade: isUpgrade,
        upgrade_from: upgradeFrom,
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
            'X-Secret-Key': secretKey,
            'Authorization': `Bearer ${secretKey}`
          },
          body: JSON.stringify(pluginPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const respText = await response.text().catch(() => '');
        console.log('[ROBOKASSA -> PLUGIN OK]:', response.status, respText);
      } catch (plugErr) {
        console.error('[ROBOKASSA -> PLUGIN ERROR]:', plugErr.message);
      }

      // Human-readable item name
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
      const cleanItemName = (itemNames[itemId] || itemId) + (quantity > 1 ? ` x${quantity}` : '');

      // Record to recent purchases live ticker (using florymine.fun without www to avoid 307 redirects)
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
    }

    // Robokassa strictly requires response in format: "OK<InvId>"
    return res.status(200).send(`OK${invId}`);
  } catch (err) {
    console.error('[ROBOKASSA RESULT HANDLER ERROR]:', err);
    return res.status(500).send('ERROR');
  }
}
