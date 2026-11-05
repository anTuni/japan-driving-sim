// 공유 랭킹 API — Cloudflare Worker + KV
// GET  /rank?diff=easy|normal|hard|all   → { list } 또는 { easy, normal, hard }
// POST /rank { diff, name, time, violations } → { list, rank }
const DIFFS = ['easy', 'normal', 'hard'];
const KEEP = 20;   // 난이도별 보관 개수
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname !== '/rank') return json({ error: 'not found' }, 404);
    const load = async (d) => (await env.RANK.get('rank:' + d, 'json')) || [];

    if (req.method === 'GET') {
      const d = url.searchParams.get('diff') || 'all';
      if (d === 'all') { const out = {}; for (const k of DIFFS) out[k] = await load(k); return json(out); }
      if (!DIFFS.includes(d)) return json({ error: 'bad diff' }, 400);
      return json({ list: await load(d) });
    }
    if (req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const diff = b.diff, name = String(b.name || '').toUpperCase(), time = Number(b.time), violations = Number(b.violations);
      if (!DIFFS.includes(diff)) return json({ error: 'bad diff' }, 400);
      if (!/^[A-Z]{3}$/.test(name)) return json({ error: 'name must be 3 letters' }, 400);
      if (!(time >= 5 && time <= 7200)) return json({ error: 'bad time' }, 400);
      if (!(Number.isInteger(violations) && violations >= 0 && violations <= 50)) return json({ error: 'bad violations' }, 400);
      const entry = { name, time: Math.round(time * 10) / 10, violations, date: new Date().toISOString().slice(0, 10) };
      const list = await load(diff);
      list.push(entry); list.sort((a, c) => a.time - c.time || a.violations - c.violations);
      const kept = list.slice(0, KEEP);
      await env.RANK.put('rank:' + diff, JSON.stringify(kept));
      return json({ list: kept, rank: kept.indexOf(entry) + 1 });
    }
    return json({ error: 'method' }, 405);
  },
};
