// Vercel Serverless Function: Daily Bonus Endpoint for FloryMine
// Limits: 1 claim per 24 hours per nickname, 1 claim per IP, requires player to be online on server.

const claimsByNick = new Map();
const claimsByIP = new Map();

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Метод не поддерживается' });
  }

  const body = req.body || {};
  const nickname = (body.nickname || body.nick || '').trim();

  if (!nickname || nickname.length < 3 || nickname.length > 16 || !/^[a-zA-Z0-9_]+$/.test(nickname)) {
    return res.status(400).json({ ok: false, error: 'Укажите корректный игровой никнейм (3-16 символов)' });
  }

  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress) || '127.0.0.1';
  const now = Date.now();
  const lowerNick = nickname.toLowerCase();

  // 1. Check IP restriction: 1 IP = 1 Nickname per 24h
  const ipRecord = claimsByIP.get(ip);
  if (ipRecord && (now - ipRecord.timestamp < COOLDOWN_MS)) {
    if (ipRecord.nick !== lowerNick) {
      const remainingMs = COOLDOWN_MS - (now - ipRecord.timestamp);
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(400).json({
        ok: false,
        error: 'С вашего IP уже был получен бонус для игрока ' + ipRecord.nick + '. Повторно можно через ' + remainingHours + ' ч.'
      });
    }
  }

  // 2. Check Nickname restriction: 24h cooldown
  const nickRecord = claimsByNick.get(lowerNick);
  if (nickRecord && (now - nickRecord.timestamp < COOLDOWN_MS)) {
    const remainingMs = COOLDOWN_MS - (now - nickRecord.timestamp);
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return res.status(400).json({
      ok: false,
      error: 'Вы уже забирали бонус сегодня! Следующая награда через ' + remainingHours + ' ч. ' + remainingMinutes + ' мин.'
    });
  }

  // 3. Verify if player is currently ONLINE on the Minecraft server
  const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
  const port = process.env.MINECRAFT_PORT || '25933';
  const secret = process.env.DONATE_SECRET_KEY || 'CHANGE_ME_SECRET_KEY';

  let isPlayerOnline = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const checkUrl = `http://${host}:${port}/api/player?name=${encodeURIComponent(nickname)}`;
    const checkResp = await fetch(checkUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (checkResp.ok) {
      const checkData = await checkResp.json();
      isPlayerOnline = checkData.online === true;
    }
  } catch (e) {
    isPlayerOnline = false;
  }

  if (!isPlayerOnline) {
    return res.status(400).json({
      ok: false,
      error: `Игрок ${nickname} не найден в сети! Зайдите на сервер mc.florymine.fun и нажмите кнопку снова.`
    });
  }

  // 4. Dispatch Reward Commands to FloryAutoDonate Server Plugin
  const rewardCommands = [
    `eco give ${nickname} 5000`,
    `give ${nickname} golden_apple 3`,
    `give ${nickname} cooked_beef 16`,
    `msg ${nickname} &6&l[FloryMine] &aВам успешно начислен ежедневный бонус с сайта!`
  ];

  const transactionId = `BONUS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  try {
    const donateUrl = `http://${host}:${port}/api/donate`;
    const donateResp = await fetch(donateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret-Key': secret,
        'Authorization': `Bearer ${secret}`
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        player: nickname,
        ip: ip,
        type: 'bonus',
        item_id: 'daily_bonus',
        item_name: 'Ежедневный Бонус',
        require_online: true
      })
    });

    const donateData = await donateResp.json().catch(() => ({}));

    if (!donateResp.ok) {
      return res.status(donateResp.status || 400).json({
        ok: false,
        error: donateData.message || 'Ошибка сервера при проверке бонуса'
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: 'Не удалось связаться с игровым сервером для выдачи награды.'
    });
  }

  claimsByNick.set(lowerNick, { timestamp: now, ip });
  claimsByIP.set(ip, { timestamp: now, nick: lowerNick });

  return res.status(200).json({
    ok: true,
    message: '🎉 Ежедневный бонус успешно начислен игроку ' + nickname + ' на сервере!'
  });
}
