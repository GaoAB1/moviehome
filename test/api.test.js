import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moviehome-test-'));
const port = 3127;
const env = { ...process.env, PORT: String(port), DATA_DIR: tempDir, COOKIE_SECURE: 'false', PASSWORD_PEPPER: 'test-pepper' };
const server = spawn(process.execPath, ['server/server.js'], { cwd: path.resolve(import.meta.dirname, '..'), env, stdio: 'pipe' });
let output = '';
server.stdout.on('data', chunk => { output += chunk.toString(); });
server.stderr.on('data', chunk => { output += chunk.toString(); });

async function request(url, options = {}, cookie = '') {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...options, headers: { ...(options.headers || {}), ...(cookie ? { cookie } : {}) } });
  const data = await response.json().catch(() => null);
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

await (async () => {
  for (let i = 0; i < 40; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error(`server did not start: ${output}`);
})();

test('authentication, setup, authorization and isolation flow', async () => {
  const setupStatus = await request('/api/setup-status');
  assert.equal(setupStatus.response.status, 200);
  assert.equal(setupStatus.data.needsAdmin, true);

  const setup = await request('/api/setup/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin-pass-123' }) });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.data.user.role, 'admin');
  assert.ok(setup.cookie);
  const adminCookie = setup.cookie;

  const created = await request('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice-pass-123' }) }, adminCookie);
  assert.equal(created.response.status, 201);
  assert.equal(created.data.user.username, 'alice');

  const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'alice-pass-123' }) });
  assert.equal(login.response.status, 200);
  const userCookie = login.cookie;
  const list = await request('/api/watchlist', {}, userCookie);
  assert.equal(list.response.status, 200);
  assert.deepEqual(list.data, []);

  const unauthenticatedHome = await request('/api/home');
  assert.equal(unauthenticatedHome.response.status, 401);

  const forbiddenUsers = await request('/api/users', {}, userCookie);
  assert.equal(forbiddenUsers.response.status, 403);
  const adminUsers = await request('/api/users', {}, adminCookie);
  assert.equal(adminUsers.response.status, 200);
  assert.equal(adminUsers.data.length, 2);
});

test.after(() => {
  server.kill('SIGTERM');
  fs.rmSync(tempDir, { recursive: true, force: true });
});
