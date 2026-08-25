const app = document.querySelector('#app');
const modalBackdrop = document.querySelector('#modalBackdrop');
const detailContent = document.querySelector('#detailContent');
const toast = document.querySelector('#toast');
let homeData = null;
let watchlist = [];
let currentPage = 'home';
let sessionUser = null;
let setupRequired = false;

const demoPoster = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=700&q=85';
const poster = item => item.poster || demoPoster;
const progressPercent = item => Math.round((Number(item.progress || 0) / Math.max(Number(item.total || 1), 1)) * 100);
const esc = value => String(value ?? '').replace(/[&<>\'\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

async function getJSON(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
function showToast(message) { toast.textContent = message; toast.classList.add('show'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600); }
function authMarkup(title, description, formId, buttonText, extra = '') {
  return `<section class="auth-shell"><div class="auth-card"><div class="auth-brand"><span class="brand-mark"><i class="ri-play-fill"></i></span><span>MovieHome</span></div><p class="eyebrow"><i class="ri-shield-check-line"></i> SECURE MEDIA LIBRARY</p><h1>${title}</h1><p class="auth-description">${description}</p><form id="${formId}" class="auth-form"><label>用户名<input name="username" autocomplete="username" minlength="3" maxlength="32" required placeholder="请输入用户名" /></label><label>密码<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="至少 8 位密码" /></label><button class="primary-button" type="submit"><i class="ri-arrow-right-line"></i> ${buttonText}</button><p class="form-error" id="${formId}Error"></p></form>${extra}</div></section>`;
}
function setupMarkup() { return authMarkup('创建管理员账户', '这是第一次启动 MovieHome。请创建唯一的管理员账户，完成后即可进入影视空间。', 'setupForm', '完成初始化', '<p class="auth-footnote"><i class="ri-lock-line"></i> 密码只以加密摘要形式存储在 SQLite 中。</p>'); }
function loginMarkup() { return authMarkup('欢迎回来', '登录后管理你的追剧列表，继续记录每一集故事。', 'loginForm', '登录', '<p class="auth-footnote"><i class="ri-information-line"></i> 如果忘记密码，请由管理员创建新的账户。</p>'); }
function setFormError(formId, message) { const node = document.querySelector(`#${formId}Error`); if (node) node.textContent = message; }

function navMarkup() {
  document.querySelectorAll('.nav-link, .brand').forEach(button => {
    button.classList.toggle('active', button.dataset.page === currentPage);
    button.onclick = () => { currentPage = button.dataset.page; render(); };
  });
  const accountButton = document.querySelector('#accountButton');
  if (accountButton) accountButton.onclick = () => { currentPage = sessionUser?.role === 'admin' ? 'admin' : 'account'; render(); };
  const logoutButton = document.querySelector('#logoutButton');
  if (logoutButton) logoutButton.onclick = logout;
}
function movieCard(item) { return `<article class="poster-card" data-id="${esc(item.id)}" data-type="${esc(item.mediaType || 'movie')}"><div class="poster-wrap"><img src="${esc(poster(item))}" alt="${esc(item.title)}" loading="lazy" /><div class="poster-gradient"></div><span class="poster-rating"><i class="ri-star-fill"></i> ${esc(item.rating || '8.6')}</span><span class="poster-type">${item.mediaType === 'tv' ? '剧集' : '电影'}</span></div><div class="poster-info"><h3>${esc(item.title)}</h3><p>${esc(item.year || '—')} · ${esc((item.genres || []).slice(0, 2).join(' / ') || '剧情')}</p></div></article>`; }
function sectionMarkup(title, kicker, items, description = '') { return `<section class="section"><div class="section-head"><div><p class="section-kicker">${kicker}</p><h2>${title}</h2>${description ? `<p class="section-description">${description}</p>` : ''}</div><button class="text-button" data-page="discover">查看全部 <i class="ri-arrow-right-line"></i></button></div><div class="card-grid">${items.map(movieCard).join('')}</div></section>`; }
function continueMarkup(items) { if (!items.length) return ''; return `<section class="section"><div class="section-head"><div><p class="section-kicker">CONTINUE WATCHING</p><h2>接着看</h2></div><button class="text-button" data-page="watchlist">管理追剧 <i class="ri-arrow-right-line"></i></button></div><div class="card-grid">${items.slice(0, 4).map(item => `<article class="continue-card" data-id="${esc(item.id)}" data-type="${esc(item.mediaType)}"><img src="${esc(poster(item))}" alt="${esc(item.title)}" loading="lazy" /><div class="continue-info"><h3>${esc(item.title)}</h3><p>${esc(item.status)} · ${esc(item.progress || 0)} / ${esc(item.total || 1)} ${item.mediaType === 'tv' ? '集' : ''}</p><div class="progress-row"><span>观看进度</span><b>${progressPercent(item)}%</b></div><div class="progress-track"><div class="progress-value" style="width:${progressPercent(item)}%"></div></div></div></article>`).join('')}</div></section>`; }
function homeMarkup() { const featured = homeData.trending?.[0] || watchlist[0]; return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><i class="ri-sparkling-2-line"></i> YOUR NEXT FAVORITE</span><h1>今晚，<br /><em>看点好的。</em></h1><p>把新片、经典与正在追的故事，收进一个安静而有序的影视空间。</p><div class="hero-meta"><span>${esc(featured?.year || '2024')}</span><span>剧情 / 科幻</span><span><i class="ri-star-fill"></i> ${esc(featured?.rating || '8.6')}</span></div><button class="primary-button" data-id="${esc(featured?.id || 872585)}" data-type="${esc(featured?.mediaType || 'movie')}"><i class="ri-play-fill"></i> 查看精选</button></div><div class="hero-visual"><div class="hero-orb"></div><img class="hero-poster" src="${esc(poster(featured || {}))}" alt="精选影片" /><div class="hero-note"><i class="ri-sparkling-line"></i> 你的片单，正在变得更好</div></div></section>${continueMarkup(watchlist.filter(item => progressPercent(item) > 0 && progressPercent(item) < 100))}${sectionMarkup('新上电影', 'NEW RELEASES', homeData.newMovies || [], '刚刚登陆大银幕与流媒体的新故事')}${sectionMarkup('新上剧集', 'NEW SERIES', homeData.newSeries || [], '每周更新，跟上你关心的世界')}${sectionMarkup('正在热门', 'TRENDING NOW', homeData.trending || [], '大家此刻正在讨论的作品')}${sectionMarkup('值得重温', 'TIMELESS PICKS', homeData.classics || [], '有些故事，值得被再次看见')}`; }
function watchlistMarkup() { return `<section class="hero compact-hero"><div class="hero-copy"><span class="eyebrow"><i class="ri-bookmark-3-line"></i> YOUR WATCHLIST</span><h1>把故事，<br /><em>留在这里。</em></h1><p>记录每一次暂停，也记住每一个准备继续的瞬间。</p></div><div class="hero-visual"><div class="hero-orb"></div><div class="hero-note"><i class="ri-time-line"></i> ${watchlist.length} 部正在收藏</div></div></section><div class="watchlist-toolbar"><div><p class="section-kicker">MY LIBRARY</p><h2>我的追剧</h2></div><div class="segmented"><button class="active" data-filter="all">全部</button><button data-filter="watching">追更中</button><button data-filter="done">已完成</button></div></div><div class="watchlist-grid">${watchlist.length ? watchlist.map(watchItemMarkup).join('') : `<div class="empty-state"><i class="ri-bookmark-3-line"></i><p>还没有收藏内容，去首页挑一部喜欢的吧。</p></div>`}</div>`; }
function watchItemMarkup(item) { return `<article class="watch-item" data-status="${progressPercent(item) >= 100 ? 'done' : 'watching'}"><img src="${esc(poster(item))}" alt="${esc(item.title)}" /><div><p class="section-kicker">${item.mediaType === 'tv' ? 'SERIES' : 'MOVIE'} · ${esc(item.status)}</p><h3>${esc(item.title)}</h3><p class="sub">${esc(item.year || '—')} · ${esc((item.genres || []).join(' / ') || '剧情')}</p><div class="progress-row"><span>已看 ${esc(item.progress || 0)} / ${esc(item.total || 1)}${item.mediaType === 'tv' ? ' 集' : ''}</span><b>${progressPercent(item)}%</b></div><div class="progress-track"><div class="progress-value" style="width:${progressPercent(item)}%"></div></div><div class="watch-controls"><input class="number-input" type="number" min="0" max="${esc(item.total || 1)}" value="${esc(item.progress || 0)}" aria-label="${esc(item.title)} 已看进度" data-progress-id="${esc(item.id)}" /><button class="small-button" data-save-id="${esc(item.id)}"><i class="ri-check-line"></i> 保存进度</button><button class="small-button danger" data-delete-id="${esc(item.id)}"><i class="ri-delete-bin-line"></i></button></div></div></article>`; }
function discoverMarkup() { const all = [...(homeData.trending || []), ...(homeData.classics || [])].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index); return `<section class="section" style="margin-top:0"><div class="section-head"><div><p class="section-kicker">DISCOVER</p><h2>发现更多故事</h2><p class="section-description">按热度、口碑与时间，找到下一部想看的作品。</p></div></div><div class="card-grid">${all.map(movieCard).join('')}</div></section>`; }
function adminMarkup(users) { return `<section class="section admin-section" style="margin-top:0"><div class="section-head"><div><p class="section-kicker">ADMIN CONSOLE</p><h2>用户管理</h2><p class="section-description">管理 MovieHome 的账户访问权限。</p></div><button class="secondary-button" id="logoutButton"><i class="ri-logout-box-r-line"></i> 退出登录</button></div><div class="admin-card"><form id="createUserForm" class="inline-user-form"><input name="username" placeholder="新用户名" minlength="3" maxlength="32" required /><input name="password" type="password" placeholder="初始密码（至少 8 位）" minlength="8" maxlength="128" required /><button class="primary-button" type="submit"><i class="ri-user-add-line"></i> 创建用户</button></form><p class="form-error" id="createUserError"></p><div class="user-table">${users.map(user => `<div class="user-row"><div><strong>${esc(user.username)}</strong><span>${user.role === 'admin' ? '管理员' : '普通用户'} · ${user.disabled ? '已禁用' : '正常'}</span></div><div class="user-actions">${user.role !== 'admin' ? `<button class="small-button" data-toggle-user="${user.id}" data-disabled="${user.disabled}">${user.disabled ? '启用' : '禁用'}</button><button class="small-button danger" data-delete-user="${user.id}">删除</button>` : '<span class="admin-badge">当前管理员</span>'}</div></div>`).join('')}</div></div></section>`; }
function accountMarkup() { return `<section class="section account-section" style="margin-top:0"><div class="account-card"><div class="account-icon"><i class="ri-user-smile-line"></i></div><p class="section-kicker">YOUR ACCOUNT</p><h2>${esc(sessionUser.username)}</h2><p class="section-description">${sessionUser.role === 'admin' ? '管理员账户' : '普通用户'} · 数据保存在本机 SQLite 数据库。</p><button class="secondary-button" id="logoutButton"><i class="ri-logout-box-r-line"></i> 退出登录</button></div></section>`; }

async function render() {
  if (setupRequired) { app.innerHTML = setupMarkup(); bindAuthForms(); return; }
  if (!sessionUser) { app.innerHTML = loginMarkup(); bindAuthForms(); return; }
  app.innerHTML = `<div class="empty-state"><i class="ri-loader-4-line"></i><p>正在整理你的影视空间…</p></div>`;
  try {
    if (currentPage === 'admin') { app.innerHTML = adminMarkup(await getJSON('/api/users')); navMarkup(); bindAdmin(); return; }
    if (currentPage === 'account') { app.innerHTML = accountMarkup(); navMarkup(); return; }
    if (!homeData) homeData = await getJSON('/api/home');
    watchlist = await getJSON('/api/watchlist');
    app.innerHTML = currentPage === 'watchlist' ? watchlistMarkup() : currentPage === 'discover' ? discoverMarkup() : homeMarkup();
    navMarkup(); bindInteractions();
  } catch (error) { app.innerHTML = `<div class="empty-state"><i class="ri-error-warning-line"></i><p>${esc(error.message)}</p></div>`; }
}
function bindAuthForms() {
  const setupForm = document.querySelector('#setupForm');
  if (setupForm) setupForm.onsubmit = async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(setupForm)); try { const data = await getJSON('/api/setup/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); sessionUser = data.user; setupRequired = false; showToast('管理员创建成功'); render(); } catch (error) { setFormError('setupForm', error.message); } };
  const loginForm = document.querySelector('#loginForm');
  if (loginForm) loginForm.onsubmit = async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(loginForm)); try { const data = await getJSON('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); sessionUser = data.user; showToast('登录成功'); render(); } catch (error) { setFormError('loginForm', error.message); } };
}
function bindInteractions() {
  document.querySelectorAll('[data-id]').forEach(element => element.onclick = event => { if (!event.target.closest('button, input')) openDetail(element.dataset.id, element.dataset.type || 'movie'); });
  document.querySelectorAll('[data-page]').forEach(element => element.onclick = () => { currentPage = element.dataset.page; render(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { document.querySelectorAll('[data-filter]').forEach(item => item.classList.remove('active')); button.classList.add('active'); document.querySelectorAll('.watch-item').forEach(item => item.style.display = button.dataset.filter === 'all' || item.dataset.status === button.dataset.filter ? '' : 'none'); });
  document.querySelectorAll('[data-save-id]').forEach(button => button.onclick = async () => { const id = button.dataset.saveId; const input = document.querySelector(`[data-progress-id="${id}"]`); try { await getJSON(`/api/watchlist/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress: Number(input.value) }) }); showToast('观看进度已更新'); render(); } catch (error) { showToast(error.message); } });
  document.querySelectorAll('[data-delete-id]').forEach(button => button.onclick = async () => { try { await getJSON(`/api/watchlist/${button.dataset.deleteId}`, { method: 'DELETE' }); showToast('已从追剧中移除'); render(); } catch (error) { showToast(error.message); } });
}
function bindAdmin() {
  navMarkup();
  document.querySelector('#createUserForm').onsubmit = async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(event.target)); try { await getJSON('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); showToast('用户创建成功'); render(); } catch (error) { document.querySelector('#createUserError').textContent = error.message; } };
  document.querySelectorAll('[data-toggle-user]').forEach(button => button.onclick = async () => { try { await getJSON(`/api/users/${button.dataset.toggleUser}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: button.dataset.disabled !== 'true' }) }); render(); } catch (error) { showToast(error.message); } });
  document.querySelectorAll('[data-delete-user]').forEach(button => button.onclick = async () => { if (!window.confirm('确定删除这个用户及其追剧数据吗？')) return; try { await getJSON(`/api/users/${button.dataset.deleteUser}`, { method: 'DELETE' }); showToast('用户已删除'); render(); } catch (error) { showToast(error.message); } });
}
async function logout() { await getJSON('/api/auth/logout', { method: 'POST' }); sessionUser = null; homeData = null; watchlist = []; currentPage = 'home'; showToast('已退出登录'); render(); }
async function openDetail(id, type) {
  detailContent.innerHTML = `<div class="empty-state"><i class="ri-loader-4-line"></i><p>正在加载详情…</p></div>`; modalBackdrop.classList.add('open'); modalBackdrop.setAttribute('aria-hidden', 'false');
  try { const item = await getJSON(`/api/title/${type}/${id}`); detailContent.innerHTML = `<div class="detail-hero" style="--detail-backdrop:url('${esc(item.backdrop || poster(item))}')"><div class="detail-layout"><img class="detail-poster" src="${esc(poster(item))}" alt="${esc(item.title)}" /><div class="detail-copy"><div class="detail-tags"><span>${esc(item.year || '—')}</span><span>${type === 'tv' ? '剧集' : '电影'}</span><span><i class="ri-star-fill"></i> ${esc(item.rating || item.ratings?.tmdb || '—')}</span></div><h2 id="detailTitle">${esc(item.title)}</h2><p class="original">${esc(item.originalTitle || '')}</p><button class="primary-button" id="addWatchlist"><i class="ri-bookmark-3-line"></i> 加入追剧</button></div></div></div><div class="detail-body"><p>${esc(item.overview || '暂无简介')}</p><div class="rating-grid"><div class="rating-box"><span>豆瓣</span><strong>${esc(item.ratings?.douban || '—')}</strong></div><div class="rating-box"><span>烂番茄</span><strong>${esc(item.ratings?.rottenTomatoes || '—')}</strong></div><div class="rating-box"><span>爆米花</span><strong>${esc(item.ratings?.popcorn || '—')}</strong></div><div class="rating-box"><span>TMDB</span><strong>${esc(item.ratings?.tmdb || '—')}</strong></div></div><p class="section-description">评分来源采用适配器设计：TMDB 已接入，豆瓣、烂番茄与爆米花预留独立数据源接口，可按需补充授权 API 或合规数据服务。</p></div>`; document.querySelector('#addWatchlist').onclick = async () => { try { await getJSON('/api/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, total: type === 'tv' ? 10 : 1, progress: 0 }) }); showToast('已加入追剧'); } catch (error) { showToast(error.message); } }; } catch (error) { detailContent.innerHTML = `<div class="empty-state"><i class="ri-error-warning-line"></i><p>${esc(error.message)}</p></div>`; }
}

function setupHeader() {
  const header = document.querySelector('.topbar');
  if (!sessionUser || setupRequired) { header.style.display = 'none'; return; }
  header.style.display = '';
  const avatar = document.querySelector('#accountButton');
  if (avatar) avatar.textContent = sessionUser.username.slice(0, 1).toUpperCase();
  const adminNav = document.querySelector('#adminNav');
  if (adminNav) adminNav.style.display = sessionUser.role === 'admin' ? '' : 'none';
}

document.querySelector('#modalClose').onclick = () => { modalBackdrop.classList.remove('open'); modalBackdrop.setAttribute('aria-hidden', 'true'); };
modalBackdrop.onclick = event => { if (event.target === modalBackdrop) document.querySelector('#modalClose').click(); };
document.querySelector('#themeToggle').onclick = () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('moviehome-theme', next); document.querySelector('#themeToggle i').className = next === 'dark' ? 'ri-sun-line' : 'ri-moon-line'; };
const savedTheme = localStorage.getItem('moviehome-theme'); if (savedTheme) document.documentElement.dataset.theme = savedTheme;

async function bootstrap() { try { const status = await getJSON('/api/setup-status'); setupRequired = status.needsAdmin; sessionUser = status.user; setupHeader(); await render(); setupHeader(); } catch (error) { app.innerHTML = `<div class="empty-state"><i class="ri-error-warning-line"></i><p>${esc(error.message)}</p></div>`; } }
bootstrap();
