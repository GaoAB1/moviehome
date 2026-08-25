import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addWatchlist,
  authenticate,
  closeDatabase,
  countUsers,
  createSession,
  createUser,
  deleteSession,
  deleteUser,
  getSessionUser,
  getWatchlist,
  hasAdmin,
  listUsers,
  removeWatchlist,
  seedUserWatchlist,
  setUserDisabled,
  updateWatchProgress
} from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const tmdbKey = process.env.TMDB_API_KEY || '';
const tmdbLanguage = process.env.TMDB_LANGUAGE || 'zh-CN';
const cookieName = 'moviehome_session';
const secureCookies = process.env.COOKIE_SECURE === 'true';
const loginAttempts = new Map();

const seedWatchlist = [
  { id: 872585, mediaType: 'movie', title: '奥本海默', originalTitle: 'Oppenheimer', poster: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg', year: '2023', progress: 1, total: 1, genres: ['剧情', '历史'], status: '已完成' },
  { id: 1399, mediaType: 'tv', title: '权力的游戏', originalTitle: 'Game of Thrones', poster: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZl1O1d9Y.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/suopoADq0k8YZr4dQXcU6p8bD4x.jpg', year: '2011', progress: 4, total: 73, genres: ['剧情', '奇幻', '冒险'], status: '追更中' },
  { id: 1396, mediaType: 'tv', title: '绝命毒师', originalTitle: 'Breaking Bad', poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlCFEAo2d8T0H3fRzZ7sT.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg', year: '2008', progress: 62, total: 62, genres: ['剧情', '犯罪'], status: '已完成' }
];

function validationError(message) { return Object.assign(new Error(message), { status: 400 }); }
function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{3,32}$/u.test(username.trim())) throw validationError('用户名需为 3-32 位字母、数字或中文');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw validationError('密码长度需为 8-128 位');
  return { username: username.trim(), password };
}
function normalizeMovie(item, mediaType = 'movie') {
  const title = item.title || item.name || item.original_title || item.original_name || '未命名';
  const date = item.release_date || item.first_air_date || '';
  return { id: item.id, mediaType, title, originalTitle: item.original_title || item.original_name || title, overview: item.overview || '暂无简介，配置 TMDB API Key 后将显示完整介绍。', poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '', backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : '', year: date.slice(0, 4) || '—', rating: Number(item.vote_average || 0).toFixed(1), voteCount: item.vote_count || 0, genres: item.genre_ids || [], status: mediaType === 'tv' ? '追更中' : '待观看' };
}
function makeFallbackCatalog() {
  return { newMovies: seedWatchlist.filter(item => item.mediaType === 'movie'), newSeries: seedWatchlist.filter(item => item.mediaType === 'tv'), trending: seedWatchlist, classics: [seedWatchlist[2], seedWatchlist[0]] };
}
async function tmdb(pathname, params = {}) {
  if (!tmdbKey) return null;
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  url.searchParams.set('api_key', tmdbKey);
  url.searchParams.set('language', tmdbLanguage);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return response.json();
}
function currentUser(req) { return getSessionUser(req.cookies[cookieName]); }
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  return next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: '仅管理员可执行此操作' });
  return next();
}
function issueSession(res, user) {
  const session = createSession(user.id);
  res.cookie(cookieName, session, { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 1000 * 60 * 60 * 24 * 14, path: '/' });
}
function clearSession(res, req) {
  deleteSession(req.cookies[cookieName]);
  res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' });
}
function rateLimitLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (record.resetAt < now) { record.count = 0; record.resetAt = now + 15 * 60 * 1000; }
  record.count += 1;
  loginAttempts.set(ip, record);
  return record.count <= 10;
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

app.get('/health', (_req, res) => res.json({ status: 'ok', tmdbConfigured: Boolean(tmdbKey), database: 'sqlite', setupRequired: !hasAdmin() }));
app.get('/api/setup-status', (req, res) => res.json({ needsAdmin: !hasAdmin(), user: currentUser(req), users: countUsers() }));

app.post('/api/setup/admin', (req, res, next) => {
  try {
    if (hasAdmin()) return res.status(409).json({ error: '管理员已经初始化' });
    const credentials = validateCredentials(req.body?.username, req.body?.password);
    const user = createUser({ ...credentials, role: 'admin' });
    seedUserWatchlist(user.id);
    issueSession(res, user);
    return res.status(201).json({ user });
  } catch (error) { return next(error); }
});

app.post('/api/auth/login', (req, res, next) => {
  try {
    if (!rateLimitLogin(req.ip)) return res.status(429).json({ error: '登录尝试过于频繁，请 15 分钟后再试' });
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = authenticate(username, password);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });
    issueSession(res, user);
    return res.json({ user });
  } catch (error) { return next(error); }
});
app.post('/api/auth/logout', (req, res) => { clearSession(res, req); res.json({ ok: true }); });
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.get('/api/users', requireAuth, requireAdmin, (_req, res) => res.json(listUsers()));
app.post('/api/users', requireAuth, requireAdmin, (req, res, next) => {
  try { const credentials = validateCredentials(req.body?.username, req.body?.password); return res.status(201).json({ user: createUser(credentials) }); } catch (error) { return next(error); }
});
app.patch('/api/users/:id', requireAuth, requireAdmin, (req, res) => res.json({ user: setUserDisabled(Number(req.params.id), Boolean(req.body?.disabled)) }));
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => { deleteUser(Number(req.params.id)); res.json({ users: listUsers() }); });

app.get('/api/home', requireAuth, async (_req, res) => {
  try {
    if (!tmdbKey) return res.json({ ...makeFallbackCatalog(), source: 'demo' });
    const [newMovies, newSeries, trending, classics] = await Promise.all([
      tmdb('/discover/movie', { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': new Date().toISOString().slice(0, 10), page: 1 }),
      tmdb('/discover/tv', { sort_by: 'first_air_date.desc', page: 1 }),
      tmdb('/trending/all/week'),
      tmdb('/movie/top_rated', { page: 1 })
    ]);
    return res.json({ newMovies: (newMovies?.results || []).slice(0, 8).map(item => normalizeMovie(item)), newSeries: (newSeries?.results || []).slice(0, 8).map(item => normalizeMovie(item, 'tv')), trending: (trending?.results || []).slice(0, 8).map(item => normalizeMovie(item, item.media_type || 'movie')), classics: (classics?.results || []).slice(0, 8).map(item => normalizeMovie(item)), source: 'tmdb' });
  } catch (error) { return res.status(502).json({ error: 'TMDB 暂时不可用' }); }
});

app.get('/api/title/:mediaType/:id', requireAuth, async (req, res) => {
  const { mediaType, id } = req.params;
  try {
    if (!tmdbKey) {
      const local = [...seedWatchlist, ...makeFallbackCatalog().classics].find(item => String(item.id) === String(id));
      return res.json({ ...(local || seedWatchlist[0]), ratings: { douban: '8.9', rottenTomatoes: '93%', popcorn: '91%', tmdb: local?.rating || '8.6' }, source: 'demo' });
    }
    const detail = await tmdb(`/${mediaType}/${id}`, { append_to_response: 'credits,videos,external_ids' });
    const item = normalizeMovie(detail, mediaType);
    return res.json({ ...item, runtime: detail.runtime || detail.episode_run_time?.[0] || 0, cast: (detail.credits?.cast || []).slice(0, 6).map(person => person.name), ratings: { douban: '—', rottenTomatoes: '—', popcorn: '—', tmdb: item.rating }, source: 'tmdb' });
  } catch (error) { return res.status(502).json({ error: '详情获取失败' }); }
});

app.get('/api/watchlist', requireAuth, (req, res) => res.json(getWatchlist(req.user.id)));
app.post('/api/watchlist', requireAuth, (req, res, next) => {
  try { if (!req.body?.id || !req.body?.title) throw validationError('缺少影视信息'); return res.status(201).json(addWatchlist(req.user.id, req.body)); } catch (error) { return next(error); }
});
app.patch('/api/watchlist/:id', requireAuth, (req, res) => res.json(updateWatchProgress(req.user.id, Number(req.params.id), req.body?.progress)));
app.delete('/api/watchlist/:id', requireAuth, (req, res) => res.json(removeWatchlist(req.user.id, Number(req.params.id))));

app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500);
  const message = status >= 500 ? '服务器内部错误' : error.message;
  if (status >= 500) console.error(JSON.stringify({ level: 'error', message: error.message, stack: error.stack }));
  res.status(status).json({ error: message });
});
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const server = app.listen(port, () => console.log(JSON.stringify({ level: 'info', message: 'MovieHome server started', port, tmdbConfigured: Boolean(tmdbKey), setupRequired: !hasAdmin() })));
function shutdown() { server.close(() => { closeDatabase(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
