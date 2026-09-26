// Vercel Serverless Function: Robokassa ResultURL Webhook Handler -> FloryAutoDonate Plugin
import crypto from 'crypto';

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

    const password2 = process.env.ROBOKASSA_PASSWORD_2 || 'J7FRFzI8Mdg2k9Kiy6da';

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

    // Expected signature: OutSum:InvId:Password#2:Shp_...
    const rawSignature = `${outSum}:${invId}:${password2}` + (shpString ? `:${shpString}` : '');
    const calculatedSignature = crypto.createHash('md5').update(rawSignature).digest('hex');

    if (calculatedSignature.toLowerCase() !== String(signatureValue).toLowerCase()) {
      console.error('[ROBOKASSA RESULT]: Signature mismatch!', {
        received: signatureValue,
        calculated: calculatedSignature,
        rawSignature
      });
      return res.status(400).send('BAD SIGNATURE');
    }

    // Signature verified! Deliver donate to Minecraft server
    const player = shpParams['Shp_player'] || params['Shp_player'];
    const itemId = shpParams['Shp_item'] || params['Shp_item'] || 'warrior';
    const quantity = Number(shpParams['Shp_qty'] || params['Shp_qty']) || 1;
    const amount = Number(outSum);
    const promoCode = (shpParams['Shp_promo'] || params['Shp_promo'] || '').trim().toUpperCase();
    const orderId = shpParams['Shp_order'] || params['Shp_order'] || `ROBO-${invId}`;
    const isUpgrade = (shpParams['Shp_upgr'] || params['Shp_upgr']) === '1';
    const upgradeFrom = shpParams['Shp_upfrom'] || params['Shp_upfrom'] || '';

    if (player) {
      const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
      const port = process.env.MINECRAFT_PORT || '25933';
      const secretKey = process.env.DONATE_SECRET_KEY || 'CHANGE_ME_SECRET_KEY';

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

      const rawCommands = commandTemplates[itemId] || [`lp user {player} parent add ${itemId}`];
      const commands = rawCommands.map(cmd => cmd.replace(/\{player\}/g, player));

      const pluginPayload = {
        transaction_id: `ROBO-${invId}`,
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
      const cleanItemName = itemNames[itemId] || itemId;

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
