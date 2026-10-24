// Vercel Serverless Function: Admin Minecraft Command Console Dispatcher
import crypto from 'crypto';

function verifyAdminToken(req) {
  const token = req.headers['x-admin-token'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : '');
  if (!token) return false;

  const secretJwtKey = (process.env.ADMIN_SECRET || '').trim();
  if (!secretJwtKey) return false;

  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return false;

    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', secretJwtKey).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return false;
    }

    // Expiration check: timestamp:expiresAt:role
    const parts = payload.split(':');
    if (parts.length >= 3) {
      const expiresAt = parseInt(parts[1], 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyAdminToken(req)) {
    return res.status(403).json({ success: false, error: 'Доступ запрещен. Недействительный или истекший токен.' });
  }

  try {
    const { command, player } = req.body || {};

    if (!command && !player) {
      return res.status(400).json({ success: false, error: 'Укажите команду или ник игрока' });
    }

    const rawCmd = (command || '').trim();
    if (!rawCmd) {
      return res.status(400).json({ success: false, error: 'Команда не может быть пустой' });
    }

    // Blacklist dangerous server teardown commands
    const forbiddenPatterns = [/^\/?stop\b/i, /^\/?restart\b/i, /^\/?reload\b/i, /^\/?rl\b/i];
    if (forbiddenPatterns.some(p => p.test(rawCmd))) {
      return res.status(403).json({ success: false, error: 'Выполнение системных команд остановки/перезагрузки запрещено через веб-консоль' });
    }

    const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
    const port = process.env.MINECRAFT_PORT || '25933';
    const secretKey = (process.env.DONATE_SECRET_KEY || '').trim();

    const targetPlayer = player ? String(player).trim() : 'Server';
    const formattedCmd = rawCmd.replace(/\{player\}/g, targetPlayer);

    const payload = {
      transaction_id: `ADM-${Date.now()}`,
      player: targetPlayer,
      item_id: 'admin_command',
      item_name: 'Команда из Админки',
      quantity: 1,
      commands: [formattedCmd],
      price: 0,
      timestamp: new Date().toISOString()
    };

    const targetUrl = `http://${host}:${port}/api/donate`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret-Key': secretKey,
        'Authorization': `Bearer ${secretKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const result = await response.json().catch(() => ({}));

    return res.status(200).json({
      success: true,
      message: `Команда [${formattedCmd}] успешно отправлена на сервер!`,
      server_response: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Ошибка отправки на сервер (${err.message})`
    });
  }
}
