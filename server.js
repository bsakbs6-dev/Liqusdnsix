// ============================================================== //
//       FloryMine Shop — Высокопроизводительный локальный сервер  //
//       Поддерживает статику, чистые URL и Vercel API функции   //
//       Доступен локально на ПК и в локальной сети (Wi-Fi)       //
// ============================================================== //

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0'; // Слушаем все сетевые интерфейсы (локалка)

// Словарь MIME-типов
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8'
};

// Кэш динамически импортированных API-модулей
const apiModules = new Map();

async function getApiHandler(handlerName) {
  if (apiModules.has(handlerName)) {
    return apiModules.get(handlerName);
  }
  const apiFile = path.join(__dirname, 'api', `${handlerName}.js`);
  if (!fs.existsSync(apiFile)) {
    return null;
  }
  try {
    const fileUrl = pathToFileURL(apiFile).href;
    const mod = await import(fileUrl);
    const handler = mod.default || mod;
    apiModules.set(handlerName, handler);
    return handler;
  } catch (err) {
    console.error(`[API LOAD ERROR] ${handlerName}:`, err);
    return null;
  }
}

// Получение списка всех локальных IPv4 адресов в сети (Wi-Fi / Ethernet)
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${hostHeader}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Настройка базовых CORS заголовков
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret-Key, X-Admin-Token, X-Signature, X-Timestamp, X-API-Key, Authorization, Range');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Алиасы для платежных шлюзов (RollyPay /payments/callback)
  if (pathname === '/payments/callback') {
    pathname = '/api/rollypay-webhook';
  } else if (pathname === '/payments/success' || pathname === '/success') {
    pathname = '/success.html';
  } else if (pathname === '/payments/fail' || pathname === '/fail') {
    pathname = '/fail.html';
  }

  // --- ОБРАБОТКА VERCEL API ЭНДПОИНТОВ (/api/*) ---
  if (pathname.startsWith('/api/')) {
    const endpoint = pathname.replace(/^\/api\//, '').split('/')[0];
    const handler = await getApiHandler(endpoint);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: `API route /api/${endpoint} not found` }));
      return;
    }

    // Парсим Query параметры
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    // Читаем Request Body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf-8');
    req.rawBody = rawBody;
    try {
      req.body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      req.body = rawBody;
    }

    // Добавляем Vercel/Express хелперы для res
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
    res.json = function (data) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
      return res;
    };
    res.send = function (data) {
      if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data)) {
        return res.json(data);
      }
      res.end(data);
      return res;
    };

    try {
      await handler(req, res);
      console.log(`[API ${req.method}] ${pathname} -> ${res.statusCode} (${Date.now() - start}ms)`);
    } catch (err) {
      console.error(`[API RUNTIME ERROR] ${pathname}:`, err);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    }
    return;
  }

  // --- ОБРАБОТКА СТАТИЧЕСКИХ ФАЙЛОВ И ЧИСТЫХ URL ---
  if (pathname === '/') {
    pathname = '/index.html';
  }

  let filePath = path.join(__dirname, pathname);

  // Проверка выхода за пределы корневой папки
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Access Denied');
    return;
  }

  // Поддержка чистых URL без расширения (.html)
  if (!fs.existsSync(filePath) && path.extname(filePath) === '') {
    const htmlCandidate = `${filePath}.html`;
    if (fs.existsSync(htmlCandidate)) {
      filePath = htmlCandidate;
    }
  }

  // Если файл существует и это файл, отдаём его
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'no-cache');

      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // 404 Fallback
  const safePath = String(pathname)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`
    <!DOCTYPE html>
    <html lang="ru">
    <head><meta charset="UTF-8"><title>404 — Страница не найдена</title></head>
    <body style="font-family: sans-serif; background: #07090e; color: #fff; text-align: center; padding: 50px;">
      <h1>404 — Страница не найдена</h1>
      <p style="color: #94a3b8;">Запрошенный файл <code>${safePath}</code> не существует.</p>
      <a href="/" style="color: #f59e0b;">Вернуться на главную</a>
    </body>
    </html>
  `);
});

server.listen(PORT, HOST, () => {
  const localIps = getLocalIpAddresses();

  console.log('\n=============================================================');
  console.log('  🌟 FloryMine Shop — Локальный сервер успешно запущен!');
  console.log('=============================================================');
  console.log(`  💻 Локально на этом ПК:        http://localhost:${PORT}`);
  if (localIps.length > 0) {
    for (const ip of localIps) {
      console.log(`  📱 В локальной сети (Wi-Fi):   http://${ip}:${PORT}`);
    }
  } else {
    console.log(`  📱 В локальной сети (Wi-Fi):   http://127.0.0.1:${PORT}`);
  }
  console.log('-------------------------------------------------------------');
  console.log('  ⚡ Vercel Serverless API (/api/*) активны и работают!');
  console.log('  ⏹️  Для остановки сервера нажмите Ctrl + C');
  console.log('=============================================================\n');
});
