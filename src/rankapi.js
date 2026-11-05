// 랭킹 저장소: 서버(VITE_RANK_API 또는 localStorage 'jds.rankApi')가 있으면 공유, 없으면 이 기기 localStorage
export const DIFF_KEYS = ['easy', 'normal', 'hard'];
export const RANK_API = (localStorage.getItem('jds.rankApi') || import.meta.env.VITE_RANK_API || '').replace(/\/$/, '');
export const online = () => !!RANK_API;
export const TOP = 5;

const LKEY = (d) => 'jds.rank.' + d;
export function loadLocal(d) { try { return JSON.parse(localStorage.getItem(LKEY(d)) || '[]'); } catch { return []; } }
function saveLocal(d, list) { localStorage.setItem(LKEY(d), JSON.stringify(list)); }
const sortList = (l) => l.sort((a, b) => a.time - b.time || a.violations - b.violations);

export async function getRank(d) {
  if (!RANK_API) return { list: loadLocal(d), source: 'local' };
  try {
    const r = await fetch(`${RANK_API}/rank?diff=${d}`, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
    return { list: (await r.json()).list, source: 'server' };
  } catch { return { list: loadLocal(d), source: 'local' }; }
}
export async function getAll() {
  if (!RANK_API) return { lists: Object.fromEntries(DIFF_KEYS.map(d => [d, loadLocal(d)])), source: 'local' };
  try {
    const r = await fetch(`${RANK_API}/rank?diff=all`, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
    const j = await r.json(); return { lists: Object.fromEntries(DIFF_KEYS.map(d => [d, j[d] || []])), source: 'server' };
  } catch { return { lists: Object.fromEntries(DIFF_KEYS.map(d => [d, loadLocal(d)])), source: 'local' }; }
}
// 등록: 로컬에도 항상 저장. 서버가 있으면 서버 응답 목록을 사용
export async function submitRank(d, entry) {
  const local = loadLocal(d); local.push(entry); saveLocal(d, sortList(local).slice(0, 20));
  localStorage.setItem('jds.me', entry.name);
  if (!RANK_API) return { list: loadLocal(d), rank: loadLocal(d).indexOf(local.find(e => e === entry)) + 1 || null, source: 'local' };
  try {
    const r = await fetch(`${RANK_API}/rank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diff: d, ...entry }) });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); return { list: j.list, rank: j.rank, source: 'server' };
  } catch { return { list: loadLocal(d), rank: null, source: 'local' }; }
}
export const myName = () => localStorage.getItem('jds.me') || '';
