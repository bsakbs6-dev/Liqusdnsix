// Vercel Serverless Function: ЮKassa Webhook Handler -> FloryAutoDonate Plugin & Live Purchases Ticker

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    const data = req.body || {};
    console.log('[YOOKASSA WEBHOOK RECEIVED]:', JSON.stringify(data));

    // Handle payment.succeeded event
    if (data.event === 'payment.succeeded' || data.event === 'payment.waiting_for_capture') {
      const payment = data.object || {};
      const metadata = payment.metadata || {};

      const player = metadata.player;
      const itemId = metadata.item_id || 'warrior';
      const itemName = metadata.item_name || itemId;
      const quantity = Number(metadata.quantity) || 1;
      const amount = payment.amount?.value ? Number(payment.amount.value) : 0;
      const paymentId = payment.id || `YOO-${Date.now()}`;

      if (!player) {
        console.warn('[YOOKASSA WEBHOOK]: No player nickname in metadata', payment.id);
        return res.status(200).send('OK');
      }

      // Minecraft Server details (devilfade | Овца -> d15.aurorix.net:25933)
      const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
      const port = process.env.MINECRAFT_PORT || '25933';
      const secretKey = process.env.DONATE_SECRET_KEY || 'CHANGE_ME_SECRET_KEY';

      const commandTemplates = {
        // Ranks (DeluxeMenus hierarchy)
        warrior: ["lp user {player} parent set voin"],
        berserk: ["lp user {player} parent set berserk"],
        spartan: ["lp user {player} parent set spartanec"],
        knight: ["lp user {player} parent set rytsart"],
        lord: ["lp user {player} parent set lord"],
        vladyka: ["lp user {player} parent set vladika"],
        emperor: ["lp user {player} parent set imperator"],

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

      const rawCommands = commandTemplates[itemId] || [`lp user {player} parent set ${itemId}`];
      const commands = rawCommands.map(cmd => cmd.replace(/\{player\}/g, player));

      const pluginPayload = {
        transaction_id: `YOO-${paymentId}`,
        player: player,
        item_id: itemId,
        item_name: itemName,
        quantity: quantity,
        commands: commands,
        price: amount,
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
        console.log('[YOOKASSA -> PLUGIN OK]:', response.status, respText);
      } catch (plugErr) {
        console.error('[YOOKASSA -> PLUGIN ERROR]:', plugErr.message);
      }

      // Record to recent purchases live ticker & increment promo usage
      try {
        const siteUrl = 'https://www.florymine.fun';
        const promoCode = metadata.promo || '';
        const orderId = metadata.order_id || paymentId || `YOO-${Date.now()}`;
        fetch(`${siteUrl}/api/purchases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nick: player, item: itemName, price: amount, promo: promoCode, order_id: orderId, time: 'только что' })
        }).catch(() => {});
      } catch (e) {}
    }

    // Always respond HTTP 200 to ЮKassa
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[YOOKASSA WEBHOOK HANDLER ERROR]:', err);
    return res.status(200).send('OK');
  }
}
