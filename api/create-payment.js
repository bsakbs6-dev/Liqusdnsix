// Vercel Serverless Function: ЮKassa Payment Gateway (API v3)
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { player, item_id, item_name, price, quantity, promo, method, is_upgrade, upgrade_from, upgrade_to } = req.body || {};

    if (!player || !item_id || !price) {
      return res.status(400).json({ error: 'Missing required parameters (player, item_id, price)' });
    }

    const shopId = process.env.YOOKASSA_SHOP_ID || '1470048';
    const secretKey = process.env.YOOKASSA_SECRET_KEY || 'test_ZJY4_fYM_0i5vlcCf_95ICzT_QcM5xpTTFBU3cV_qTU';

    const amount = Number(price);
    const qty = Number(quantity) || 1;
    const formattedAmount = amount.toFixed(2);
    const itemName = item_name || item_id;
    const isUpgr = is_upgrade === true || is_upgrade === 'true';
    const upgrFrom = upgrade_from || '';
    
    let description = isUpgr
      ? `Докуп ${itemName}${upgrFrom ? ' (с ' + upgrFrom + ')' : ''} для игрока ${player} (FloryMine)`
      : `Покупка ${itemName}${qty > 1 ? ' (x' + qty + ')' : ''} для игрока ${player} (FloryMine)`;

    // Idempotence key for YooKassa
    const idempotenceKey = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const authHeader = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const returnUrl = `https://www.florymine.fun/?payment_check=1&order_id=${encodeURIComponent(idempotenceKey)}`;

    const paymentPayload = {
      amount: {
        value: formattedAmount,
        currency: 'RUB'
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: returnUrl
      },
      description: description.substring(0, 128),
      metadata: {
        player: player,
        item_id: item_id,
        item_name: itemName,
        quantity: String(qty),
        promo: promo || '',
        price: String(amount),
        order_id: idempotenceKey,
        is_upgrade: isUpgr ? 'true' : 'false',
        upgrade_from: upgrFrom,
        upgrade_to: upgrade_to || itemName
      }
    };

    // Call YooKassa official API v3
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        'Authorization': authHeader
      },
      body: JSON.stringify(paymentPayload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || !data.confirmation) {
      console.error('[YOOKASSA ERROR]:', response.status, data);
      return res.status(response.status || 500).json({
        success: false,
        error: data?.description || 'Не удалось создать платеж в ЮKassa'
      });
    }

    return res.status(200).json({
      success: true,
      order_id: data.id,
      idempotence_key: idempotenceKey,
      amount: amount,
      payment_url: data.confirmation.confirmation_url
    });
  } catch (err) {
    console.error('[CREATE-PAYMENT ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
