// Vercel Serverless Function: Secure Admin Authentication
import crypto from 'crypto';

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

  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ success: false, error: 'Введите пароль администратора' });
    }

    const cleanPass = String(password).trim();
    const masterPassword = (process.env.ADMIN_PASSWORD || '').trim();
    const secretJwtKey = (process.env.ADMIN_SECRET || '').trim();

    if (!masterPassword || !secretJwtKey) {
      console.error('[ADMIN AUTH ERROR]: ADMIN_PASSWORD or ADMIN_SECRET environment variable is missing.');
      return res.status(500).json({
        success: false,
        error: 'Сервер авторизации не настроен (отсутствуют переменные окружения на сервере).'
      });
    }

    // Strict timing-safe password verification
    const passBuffer = Buffer.from(cleanPass, 'utf8');
    const masterBuffer = Buffer.from(masterPassword, 'utf8');
    const isMatch = passBuffer.length === masterBuffer.length && crypto.timingSafeEqual(passBuffer, masterBuffer);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Неверный пароль администратора' });
    }

    // Generate signed secure session token with 24-hour expiration
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const tokenPayload = `${Date.now()}:${expiresAt}:admin`;
    const signature = crypto.createHmac('sha256', secretJwtKey).update(tokenPayload).digest('hex');
    const token = `${Buffer.from(tokenPayload).toString('base64')}.${signature}`;

    return res.status(200).json({
      success: true,
      token: token,
      expires_at: expiresAt,
      message: 'Авторизация успешна'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
