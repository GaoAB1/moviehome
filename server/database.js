import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'moviehome.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disabled INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id INTEGER NOT NULL,
    media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'tv')),
    title TEXT NOT NULL,
    original_title TEXT,
    overview TEXT,
    poster TEXT,
    backdrop TEXT,
    year TEXT,
    rating TEXT,
    genres_json TEXT NOT NULL DEFAULT '[]',
    progress INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT '待观看',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tmdb_id, media_type)
  );
`);

const seedWatchlist = [
  { id: 872585, mediaType: 'movie', title: '奥本海默', originalTitle: 'Oppenheimer', poster: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg', year: '2023', progress: 1, total: 1, genres: ['剧情', '历史'], status: '已完成' },
  { id: 1399, mediaType: 'tv', title: '权力的游戏', originalTitle: 'Game of Thrones', poster: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZl1O1d9Y.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/suopoADq0k8YZr4dQXcU6p8bD4x.jpg', year: '2011', progress: 4, total: 73, genres: ['剧情', '奇幻', '冒险'], status: '追更中' },
  { id: 1396, mediaType: 'tv', title: '绝命毒师', originalTitle: 'Breaking Bad', poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlCFEAo2d8T0H3fRzZ7sT.jpg', backdrop: 'https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg', year: '2008', progress: 62, total: 62, genres: ['剧情', '犯罪'], status: '已完成' }
];

const hashPassword = password => crypto.scryptSync(password, process.env.PASSWORD_PEPPER || 'moviehome-local-pepper', 64).toString('hex');
const verifyPassword = (password, hash) => crypto.timingSafeEqual(Buffer.from(hashPassword(password), 'hex'), Buffer.from(hash, 'hex'));
const normalizeUser = row => row && ({ id: row.id, username: row.username, role: row.role, createdAt: row.created_at, disabled: Boolean(row.disabled) });
const normalizeWatchlist = row => ({ id: row.tmdb_id, mediaType: row.media_type, title: row.title, originalTitle: row.original_title, overview: row.overview, poster: row.poster, backdrop: row.backdrop, year: row.year, rating: row.rating, genres: JSON.parse(row.genres_json || '[]'), progress: row.progress, total: row.total, status: row.status });

export function hasAdmin() { return Boolean(db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()); }
export function countUsers() { return db.prepare('SELECT COUNT(*) AS count FROM users').get().count; }
export function createUser({ username, password, role = 'user' }) {
  const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hashPassword(password), role);
  return normalizeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid));
}
export function authenticate(username, password) {
  const row = db.prepare('SELECT * FROM users WHERE username = ? AND disabled = 0').get(username);
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return normalizeUser(row);
}
export function getUserById(id) { return normalizeUser(db.prepare('SELECT * FROM users WHERE id = ? AND disabled = 0').get(id)); }
export function listUsers() { return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(normalizeUser); }
export function setUserDisabled(id, disabled) { db.prepare('UPDATE users SET disabled = ? WHERE id = ? AND role != \'admin\'').run(disabled ? 1 : 0, id); return getUserById(id); }
export function deleteUser(id) { db.prepare("DELETE FROM users WHERE id = ? AND role != 'admin'").run(id); }
export function createSession(userId, ttlMs = 1000 * 60 * 60 * 24 * 14) {
  const id = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, Date.now() + ttlMs);
  return id;
}
export function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ? AND users.disabled = 0').get(sessionId, Date.now());
  return normalizeUser(row);
}
export function deleteSession(sessionId) { if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId); }

const listQuery = db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY updated_at DESC, id DESC');
export function getWatchlist(userId) { return listQuery.all(userId).map(normalizeWatchlist); }
export function addWatchlist(userId, item) {
  const existing = db.prepare('SELECT * FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').get(userId, item.id, item.mediaType);
  if (existing) return getWatchlist(userId);
  db.prepare(`INSERT INTO watchlist (user_id, tmdb_id, media_type, title, original_title, overview, poster, backdrop, year, rating, genres_json, progress, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, item.id, item.mediaType === 'tv' ? 'tv' : 'movie', item.title, item.originalTitle || '', item.overview || '', item.poster || '', item.backdrop || '', item.year || '', item.rating || '', JSON.stringify(item.genres || []), Number(item.progress || 0), Math.max(Number(item.total || 1), 1), item.status || '待观看');
  return getWatchlist(userId);
}
export function updateWatchProgress(userId, tmdbId, progress) {
  const row = db.prepare('SELECT total FROM watchlist WHERE user_id = ? AND tmdb_id = ?').get(userId, tmdbId);
  if (!row) return getWatchlist(userId);
  const safeProgress = Math.max(0, Math.min(Number(progress) || 0, Number(row.total || 1)));
  db.prepare("UPDATE watchlist SET progress = ?, status = CASE WHEN progress >= total THEN '已完成' ELSE '追更中' END, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND tmdb_id = ?").run(safeProgress, userId, tmdbId);
  return getWatchlist(userId);
}
export function removeWatchlist(userId, tmdbId) { db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ?').run(userId, tmdbId); return getWatchlist(userId); }
export function seedUserWatchlist(userId) { seedWatchlist.forEach(item => addWatchlist(userId, item)); }
export function closeDatabase() { db.close(); }
