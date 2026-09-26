// Vercel Serverless Function: Fetch player rank and status from FloryAutoDonate plugin

const RANK_MAP = {
  default: { id: 'default', name: 'Игрок', level: 0, price: 0, purchasable: false },
  player: { id: 'default', name: 'Игрок', level: 0, price: 0, purchasable: false },
  voin: { id: 'warrior', name: 'Воин', level: 1, price: 79, purchasable: true },
  warrior: { id: 'warrior', name: 'Воин', level: 1, price: 79, purchasable: true },
  berserk: { id: 'berserk', name: 'Берсерк', level: 2, price: 159, purchasable: true },
  spartanec: { id: 'spartan', name: 'Спартанец', level: 3, price: 359, purchasable: true },
  spartan: { id: 'spartan', name: 'Спартанец', level: 3, price: 359, purchasable: true },
  rytsart: { id: 'knight', name: 'Рыцарь', level: 4, price: 579, purchasable: true },
  knight: { id: 'knight', name: 'Рыцарь', level: 4, price: 579, purchasable: true },
  lord: { id: 'lord', name: 'Лорд', level: 5, price: 899, purchasable: true },
  vladika: { id: 'vladyka', name: 'Владыка', level: 6, price: 1249, purchasable: true },
  vladyka: { id: 'vladyka', name: 'Владыка', level: 6, price: 1249, purchasable: true },
  imperator: { id: 'emperor', name: 'Император', level: 7, price: 1799, purchasable: true },
  emperor: { id: 'emperor', name: 'Император', level: 7, price: 1799, purchasable: true },
  // Staff & Admin Ranks (level > 7, unpurchasable)
  youtube: { id: 'youtube', name: 'YouTube', level: 10, price: 0, purchasable: false },
  yt: { id: 'youtube', name: 'YouTube', level: 10, price: 0, purchasable: false },
  media: { id: 'youtube', name: 'YouTube', level: 10, price: 0, purchasable: false },
  helper: { id: 'helper', name: 'Хелпер', level: 20, price: 0, purchasable: false },
  help: { id: 'helper', name: 'Хелпер', level: 20, price: 0, purchasable: false },
  moder: { id: 'moder', name: 'Модератор', level: 30, price: 0, purchasable: false },
  moderator: { id: 'moder', name: 'Модератор', level: 30, price: 0, purchasable: false },
  stmoder: { id: 'moder', name: 'Старший Модератор', level: 35, price: 0, purchasable: false },
  admin: { id: 'admin', name: 'Администратор', level: 40, price: 0, purchasable: false },
  administrator: { id: 'admin', name: 'Администратор', level: 40, price: 0, purchasable: false },
  gladmin: { id: 'admin', name: 'Главный Администратор', level: 45, price: 0, purchasable: false },
  developer: { id: 'developer', name: 'Разработчик', level: 50, price: 0, purchasable: false },
  dev: { id: 'developer', name: 'Разработчик', level: 50, price: 0, purchasable: false },
  coder: { id: 'developer', name: 'Разработчик', level: 50, price: 0, purchasable: false },
  owner: { id: 'owner', name: 'Создатель', level: 100, price: 0, purchasable: false },
  glava: { id: 'owner', name: 'Создатель', level: 100, price: 0, purchasable: false },
  osnovatel: { id: 'owner', name: 'Создатель', level: 100, price: 0, purchasable: false }
};

function enrichRankInfo(data) {
  const rawGroup = (data?.group || 'default').toLowerCase().trim();
  const info = RANK_MAP[rawGroup] || {
    id: rawGroup,
    name: data?.rank_display || rawGroup.charAt(0).toUpperCase() + rawGroup.slice(1),
    level: (rawGroup === 'default' || rawGroup === 'player') ? 0 : 100,
    price: 0,
    purchasable: false
  };

  const level = typeof data?.rank_level === 'number' ? data.rank_level : info.level;
  const price = typeof data?.rank_price === 'number' ? data.rank_price : info.price;

  return {
    ...data,
    group: rawGroup,
    group_id: info.id,
    rank_display: data?.rank_display || info.name,
    rank_level: level,
    rank_price: price,
    is_staff_or_highest: level > 7,
    can_buy_privileges: level < 7
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const name = req.query.name || req.query.player || req.query.nick;
  if (!name) {
    return res.status(400).json({ error: 'Player name is required' });
  }

  const host = process.env.MINECRAFT_HOST || 'd15.aurorix.net';
  const port = process.env.MINECRAFT_PORT || '25933';
  const targetUrl = `http://${host}:${port}/api/player?name=${encodeURIComponent(name)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return res.status(200).json(enrichRankInfo(data));
    } else {
      return res.status(200).json(enrichRankInfo({
        status: 'default',
        player: name,
        group: 'default',
        rank_display: 'Игрок',
        online: false
      }));
    }
  } catch (err) {
    // If plugin is not yet listening or connection timeout
    return res.status(200).json(enrichRankInfo({
      status: 'fallback',
      player: name,
      group: 'default',
      rank_display: 'Игрок',
      online: false
    }));
  }
}
