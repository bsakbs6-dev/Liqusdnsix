// Vercel Serverless Function: Fetch player rank and status from FloryAutoDonate plugin

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
      return res.status(200).json(data);
    } else {
      return res.status(200).json({
        status: 'default',
        player: name,
        group: 'default',
        rank_display: 'Игрок',
        online: false
      });
    }
  } catch (err) {
    // If plugin is not yet listening or connection timeout
    return res.status(200).json({
      status: 'fallback',
      player: name,
      group: 'default',
      rank_display: 'Игрок',
      online: false
    });
  }
}
