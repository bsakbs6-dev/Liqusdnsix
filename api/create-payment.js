// Vercel Serverless Function: Robokassa Payment Gateway
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_PRICES = {
  warrior: 79,
  berserk: 159,
  spartan: 359,
  knight: 579,
  lord: 899,
  vladyka: 1249,
  emperor: 1799,
  case_donate_1: 69,
  case_donate_3: 179,
  case_donate_10: 549,
  case_tokens_1: 39,
  case_tokens_5: 175,
  case_tokens_15: 459,
  tokens_50: 25,
  tokens_100: 45,
  tokens_500: 199,
  tokens_1000: 369,
  tokens_5000: 1499,
  tokens_10000: 2499,
  srv_unban: 199,
  srv_unmute: 59
};

const RANK_LEVELS = {
  warrior: { level: 1, price: 79, names: ['воин', 'warrior', 'voin'] },
  berserk: { level: 2, price: 159, names: ['берсерк', 'berserk'] },
  spartan: { level: 3, price: 359, names: ['спартанец', 'spartan', 'spartanec'] },
  knight: { level: 4, price: 579, names: ['рыцарь', 'knight', 'rytsart'] },
  lord: { level: 5, price: 899, names: ['лорд', 'lord'] },
  vladyka: { level: 6, price: 1249, names: ['владыка', 'vladyka', 'vladika'] },
  emperor: { level: 7, price: 1799, names: ['император', 'emperor', 'imperator'] }
};

function loadStoreSnapshot() {
  const tmpPath = '/tmp/store-data.json';
  const localPath = path.join(process.cwd(), 'store-data.json');
  try {
    if (fs.existsSync(tmpPath)) {
      return JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    }
  } catch (e) {}
  try {
    if (fs.existsSync(localPath)) {
      return JSON.parse(fs.readFileSync(localPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

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

    if (!player || !item_id || price === undefined || price === null) {
      return res.status(400).json({ error: 'Missing required parameters (player, item_id, price)' });
    }

    const cleanPlayer = String(player).trim();
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(cleanPlayer)) {
      return res.status(400).json({ error: 'Некорректный игровой никнейм (разрешены 3-16 символов: латиница, цифры, _)' });
    }

    const cleanItemId = String(item_id).trim();
    const store = loadStoreSnapshot();

    // Lookup official catalog unit price
    let unitPrice = DEFAULT_PRICES[cleanItemId];
    if (store && store.products) {
      for (const list of Object.values(store.products)) {
        if (Array.isArray(list)) {
          const found = list.find(p => p && p.id === cleanItemId);
          if (found && Number(found.price) > 0) {
            unitPrice = Number(found.price);
            break;
          }
        }
      }
    }

    if (!unitPrice || unitPrice <= 0) {
      return res.status(400).json({ error: `Неизвестный товар: ${cleanItemId}` });
    }

    const isMultiItem = cleanItemId.startsWith('case_') || cleanItemId.startsWith('tokens_') || cleanItemId.startsWith('coins_');
    const qty = isMultiItem ? Math.max(1, Math.min(99, parseInt(quantity, 10) || 1)) : 1;
    const isUpgr = (is_upgrade === true || is_upgrade === 'true') && Boolean(RANK_LEVELS[cleanItemId]);
    const upgrFrom = upgrade_from ? String(upgrade_from).trim() : '';

    // Calculate legitimate base price (supporting rank upgrade difference)
    let baseUnitPrice = unitPrice;
    if (isUpgr && upgrFrom) {
      const targetRank = RANK_LEVELS[cleanItemId];
      const normalizedFrom = upgrFrom.toLowerCase();
      const fromEntry = Object.values(RANK_LEVELS).find(r => r.names.includes(normalizedFrom));
      if (fromEntry && targetRank && fromEntry.level < targetRank.level) {
        baseUnitPrice = Math.max(1, unitPrice - fromEntry.price);
      }
    }

    let expectedTotal = baseUnitPrice * qty;

    // Validate promo code discount if provided
    const cleanPromo = promo ? String(promo).trim().toUpperCase() : '';
    let maxAllowedDiscount = 0;
    if (cleanPromo) {
      const defaultPromos = { FLORY2026: 20, START: 15, DONATE: 10, VIP: 25, FLORY: 15 };
      if (defaultPromos[cleanPromo]) {
        maxAllowedDiscount = defaultPromos[cleanPromo] / 100;
      }
      if (store && Array.isArray(store.promoCodes)) {
        const foundPromo = store.promoCodes.find(
          p => p && p.code && String(p.code).trim().toUpperCase() === cleanPromo && p.active !== false
        );
        if (foundPromo) {
          const disc = Math.min(99, Math.max(1, Number(foundPromo.discount) || 0));
          maxAllowedDiscount = Math.max(maxAllowedDiscount, disc / 100);
        }
      }
    }

    const minLegitimatePrice = Math.max(1, Math.floor(expectedTotal * (1 - maxAllowedDiscount)));
    const clientAmount = Number(price);

    // Prevent price tampering: use at least minLegitimatePrice
    if (!Number.isFinite(clientAmount) || clientAmount < minLegitimatePrice - 1) {
      return res.status(400).json({
        error: `Некорректная сумма заказа (${clientAmount} ₽). Минимальная стоимость: ${minLegitimatePrice} ₽`
      });
    }

    const amount = Math.max(minLegitimatePrice, Math.round(clientAmount));
    const formattedAmount = amount.toFixed(2);
    const itemName = item_name || cleanItemId;
    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

    let description = isUpgr
      ? `Докупка ${itemName}${upgrFrom ? ' (с ' + upgrFrom + ')' : ''} для ${cleanPlayer}`
      : `Покупка ${itemName}${qty > 1 ? ' (x' + qty + ')' : ''} для ${cleanPlayer}`;
    description = description.substring(0, 100);

    // 1. Primary Gateway: RollyPay (СБП, Карты, Криптовалюта, xrocket)
    const rollyTerminalId = process.env.ROLLYPAY_TERMINAL_ID || '1ecd2e72-0287-4430-90ac-3f72b336c495';
    const rollyApiKey = process.env.ROLLYPAY_API_KEY || 'uXPh603dgcneP4lZ6lQcdiICifPJ4wyYx1OCCHhbFI8';

    try {
      const rollyPayload = {
        terminal_id: rollyTerminalId,
        amount: formattedAmount,
        payment_currency: 'RUB',
        order_id: orderId,
        description: description,
        customer_id: cleanPlayer,
        success_redirect_url: 'https://florymine.fun/success.html',
        fail_redirect_url: 'https://florymine.fun/?payment=fail',
        metadata: {
          player: cleanPlayer,
          item_id: cleanItemId,
          item_name: itemName,
          price: amount,
          quantity: qty,
          promo: cleanPromo,
          is_upgrade: isUpgr,
          upgrade_from: upgrFrom
        }
      };

      const rollyResp = await fetch('https://api.rollypay.io/api/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': rollyApiKey
        },
        body: JSON.stringify(rollyPayload)
      });

      if (rollyResp.ok) {
        const rollyData = await rollyResp.json();
        if (rollyData && rollyData.pay_url) {
          console.log(`[ROLLYPAY PAYMENT CREATED]: Order=${orderId}, PaymentId=${rollyData.payment_id}`);
          return res.status(200).json({
            success: true,
            provider: 'rollypay',
            order_id: orderId,
            payment_id: rollyData.payment_id,
            amount: amount,
            payment_url: rollyData.pay_url
          });
        }
      } else {
        const errText = await rollyResp.text();
        console.warn('[ROLLYPAY CREATE NON-OK, FALLING BACK]:', rollyResp.status, errText);
      }
    } catch (rollyErr) {
      console.warn('[ROLLYPAY CREATE NETWORK ERROR]:', rollyErr.message);
    }

    // 2. Secondary Gateway Fallback: Robokassa
    const merchantLogin = process.env.ROBOKASSA_LOGIN || 'florymine';
    const password1 = process.env.ROBOKASSA_PASSWORD_1 || 'Nm47TwghTc4jigSAd44T';
    const isTest = process.env.ROBOKASSA_IS_TEST !== 'false';
    const invId = Math.floor(Date.now() / 1000) % 2147483647;

    // Custom Shp_ parameters for Robokassa (must be sorted alphabetically by param name)
    const shpParams = {
      'Shp_item': String(cleanItemId),
      'Shp_order': String(orderId),
      'Shp_player': String(cleanPlayer),
      'Shp_qty': String(qty)
    };
    if (cleanPromo) shpParams['Shp_promo'] = String(cleanPromo);
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
      provider: 'robokassa',
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
