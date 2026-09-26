// Vercel Serverless Function: Robokassa Payment Gateway
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
    const { player, item_id, item_name, price, quantity, promo, is_upgrade, upgrade_from } = req.body || {};

    if (!player || !item_id || !price) {
      return res.status(400).json({ error: 'Missing required parameters (player, item_id, price)' });
    }

    const merchantLogin = process.env.ROBOKASSA_LOGIN || 'florymine';
    const password1 = process.env.ROBOKASSA_PASSWORD_1 || 'Nm47TwghTc4jigSAd44T';
    const isTest = process.env.ROBOKASSA_IS_TEST !== 'false'; // Enabled during shop activation

    const amount = Number(price);
    const qty = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
    const formattedAmount = amount.toFixed(2);
    const itemName = item_name || item_id;
    const isUpgr = is_upgrade === true || is_upgrade === 'true';
    const upgrFrom = upgrade_from || '';

    // Robokassa InvId: positive integer (up to 2147483647)
    const invId = Math.floor(Date.now() / 1000) % 2147483647;
    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    let description = isUpgr
      ? `Докупка ${itemName}${upgrFrom ? ' (с ' + upgrFrom + ')' : ''} для ${player}`
      : `Покупка ${itemName}${qty > 1 ? ' (x' + qty + ')' : ''} для ${player}`;
    description = description.substring(0, 100);

    // Custom Shp_ parameters for Robokassa (must be sorted alphabetically by param name)
    const shpParams = {
      'Shp_item': String(item_id),
      'Shp_order': String(orderId),
      'Shp_player': String(player),
      'Shp_qty': String(qty)
    };
    if (promo) shpParams['Shp_promo'] = String(promo);
    if (isUpgr) {
      shpParams['Shp_upgr'] = '1';
      if (upgrFrom) shpParams['Shp_upfrom'] = String(upgrFrom);
    }

    // Sort Shp_ params alphabetically
    const sortedShpKeys = Object.keys(shpParams).sort();
    const shpString = sortedShpKeys.map(k => `${k}=${shpParams[k]}`).join(':');

    // Signature formula: MerchantLogin:OutSum:InvId:Password#1:Shp_...
    const rawSignature = `${merchantLogin}:${formattedAmount}:${invId}:${password1}` + (shpString ? `:${shpString}` : '');
    const signature = crypto.createHash('md5').update(rawSignature).digest('hex');

    // Build Robokassa payment redirect URL
    const robokassaParams = new URLSearchParams({
      MerchantLogin: merchantLogin,
      OutSum: formattedAmount,
      InvId: String(invId),
      Description: description,
      SignatureValue: signature
    });

    if (isTest) {
      robokassaParams.append('IsTest', '1');
    }

    // Append Shp_ parameters
    for (const key of sortedShpKeys) {
      robokassaParams.append(key, shpParams[key]);
    }

    const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${robokassaParams.toString()}`;

    return res.status(200).json({
      success: true,
      order_id: orderId,
      inv_id: invId,
      amount: amount,
      payment_url: paymentUrl
    });
  } catch (err) {
    console.error('[ROBOKASSA CREATE-PAYMENT ERROR]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
