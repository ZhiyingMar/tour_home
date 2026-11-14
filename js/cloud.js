// Supabase 的最小客户端：只用 fetch 调 REST，不依赖任何库。
// 这里的 publishable key 本来就是给浏览器用的公开密钥；真正的访问控制靠
// 数据库的行级安全（见 supabase/memories.sql）和登录后的 token。
const BASE = 'https://yiicfopcudcmegnisdsn.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_dQxOa1Ff_rW5z7lCxde2wQ_oeRZx4nN';
const SESSION_KEY = 'starhome.cloud.v1';

let sess = null; // { access, refresh, exp, email }
try { sess = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* 没有登录过 */ }
function persist() {
  try { sess ? localStorage.setItem(SESSION_KEY, JSON.stringify(sess)) : localStorage.removeItem(SESSION_KEY); } catch { /* 存不下就留在内存里 */ }
}

const fail = (status, body) => Object.assign(new Error(body?.error_description || body?.msg || body?.message || `请求失败（${status}）`), { status });

async function auth(path, payload) {
  const r = await fetch(`${BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(r.status, body);
  return body;
}
function adopt(body, email) {
  sess = { access: body.access_token, refresh: body.refresh_token, exp: Date.now() + (body.expires_in || 3600) * 1000, email: body.user?.email || email };
  persist();
}

let refreshing = null;
async function fresh() {
  if (!sess) throw fail(401, { message: '还没登录' });
  if (sess.exp - Date.now() > 60e3) return sess.access;
  refreshing ??= auth('token?grant_type=refresh_token', { refresh_token: sess.refresh })
    .then((b) => adopt(b, sess.email))
    .catch((e) => { if (e.status === 400 || e.status === 401) { sess = null; persist(); } throw e; }) // 断网不算登录失效
    .finally(() => { refreshing = null; });
  await refreshing;
  return sess.access;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${await fresh()}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${BASE}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body) });
  if (!r.ok) throw fail(r.status, await r.json().catch(() => ({})));
  return method === 'GET' ? r.json() : null;
}

const chunks = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const cloud = {
  signedIn: () => !!sess,
  email: () => (sess ? sess.email : ''),

  async signIn(email, password) {
    adopt(await auth('token?grant_type=password', { email, password }), email);
  },
  signOut() { sess = null; persist(); },

  // 最近 limit 条，新的在前
  list: (limit) => rest(`memories?select=id,at,type,period,note&order=at.desc&limit=${limit}`),
  async insert(rows) {
    for (const part of chunks(rows, 500)) await rest('memories?on_conflict=id', { method: 'POST', body: part, prefer: 'resolution=ignore-duplicates,return=minimal' });
  },
  async removeIds(ids) {
    for (const part of chunks(ids, 100)) await rest(`memories?id=in.(${part.map((i) => `"${i}"`).join(',')})`, { method: 'DELETE' });
  },
  removeAll: () => rest('memories?id=not.is.null', { method: 'DELETE' }),
};
