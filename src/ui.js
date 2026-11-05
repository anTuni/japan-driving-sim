import { GRID, ROAD_END, NODES, ZONES } from './config.js';
import { rankTable, DIFFS } from './mission.js';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor(handlers, checklist) {
    this.h = handlers;
    this.speedEl = $('#speed-val'); this.gearEl = $('#gear-val');
    this.sigL = $('#sig-l'); this.sigR = $('#sig-r'); this.wiperEl = $('#wiper-ind');
    this.scoreEl = $('#score-val'); this.camEl = $('#cam-btn'); this.toasts = $('#toasts');
    this.wheelEl = $('#wheel-icon'); this.rulesPanel = $('#rules-panel'); this.checkPanel = $('#checklist');
    this.overlay = $('#overlay'); this.mini = $('#minimap'); this.mctx = this.mini.getContext('2d');
    this.lightEl = $('#light-ind');
    // 기어봉
    document.querySelectorAll('#shifter button').forEach(b => b.addEventListener('click', () => handlers.onGear(b.dataset.gear)));
    $('#cam-btn').addEventListener('click', () => handlers.onCamera());
    $('#reset-btn').addEventListener('click', () => handlers.onReset());
    $('#help-btn').addEventListener('click', () => this.toggleRules());
    $('#start-btn').addEventListener('click', () => this.hideOverlay());
    document.querySelectorAll('.diff-btn').forEach(b => b.addEventListener('click', () => { this.overlay.classList.add('hidden'); handlers.onMission(b.dataset.diff); }));
    this.dest = null; this.renderRankings();
    $('#rules-close').addEventListener('click', () => this.toggleRules());
    $('#sig-l').addEventListener('click', () => handlers.onSignal('L'));
    $('#sig-r').addEventListener('click', () => handlers.onSignal('R'));
    $('#wiper-btn').addEventListener('click', () => handlers.onWiper());
    // 체크리스트
    const ul = $('#check-list');
    for (const c of checklist) {
      const li = document.createElement('li'); li.id = 'chk-' + c.id;
      li.innerHTML = `<span class="box"></span><div><b>${c.title}</b><small>${c.desc}</small></div>`;
      ul.appendChild(li);
    }
    this.checkCount = $('#check-count'); this.total = checklist.length; this.doneN = 0;
  }
  get paused() { return !this.overlay.classList.contains('hidden') || !this.rulesPanel.classList.contains('hidden') || !document.querySelector('#mission-overlay').classList.contains('hidden'); }
  showOverlay() { this.renderRankings(); this.overlay.classList.remove('hidden'); }
  renderRankings() { $('#rankings').innerHTML = Object.keys(DIFFS).map(d => `<div><h3>${DIFFS[d].name} TOP 5</h3>${rankTable(d)}</div>`).join(''); }
  hideOverlay() { this.overlay.classList.add('hidden'); this.h.onStart && this.h.onStart(); }
  toggleRules() { this.rulesPanel.classList.toggle('hidden'); }
  toggleChecklist() { if (document.body.classList.contains('is-touch')) this.checkPanel.classList.toggle('open'); else this.checkPanel.classList.toggle('collapsed'); }
  checkDone(id) { const li = document.getElementById('chk-' + id); if (li && !li.classList.contains('done')) { li.classList.add('done'); this.doneN++; this.checkCount.textContent = `${this.doneN}/${this.total}`; } }
  setGear(g) { document.querySelectorAll('#shifter button').forEach(b => b.classList.toggle('active', b.dataset.gear === g)); this.gearEl.textContent = g; }

  toast(msg, type = 'info', badge = '') {
    const el = document.createElement('div'); el.className = 'toast ' + type;
    el.innerHTML = `${badge ? `<span class="badge">${badge}</span>` : ''}<span>${msg}</span>`;
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, type === 'bad' ? 6500 : 4500);
  }

  update(car, traffic, rules, camMode, lightInfo) {
    this.speedEl.textContent = Math.round(car.speedKmh);
    this.setGear(car.gear);
    const on = car.signalOn;
    this.sigL.classList.toggle('on', on && car.signal === 'L'); this.sigR.classList.toggle('on', on && car.signal === 'R');
    this.sigL.classList.toggle('armed', car.signal === 'L'); this.sigR.classList.toggle('armed', car.signal === 'R');
    this.wiperEl.classList.toggle('hidden', !car.wiper);
    this.scoreEl.textContent = rules.score;
    this.camEl.textContent = camMode === 'first' ? '1인칭 (C)' : '3인칭 (C)';
    this.wheelEl.style.transform = `rotate(${-car.steer * 6 * 57.3}deg)`;
    if (this.touch) { this.touch.setGear(car.gear); this.touch.setSignal(car.signal, on); }
    // 전방 신호 표시
    if (lightInfo) {
      const { color, arrows, dist } = lightInfo;
      const ar = [...arrows].map(a => ({ L: '←', S: '↑', R: '→' })[a]).join(' ');
      this.lightEl.className = 'light ' + color; this.lightEl.textContent = `${{ green: '초록', yellow: '황색', red: '빨강' }[color]}${ar ? ' + ' + ar : ''} · ${Math.round(dist)}m`;
    } else { this.lightEl.className = 'light none'; this.lightEl.textContent = '전방 신호 없음'; }
    this.drawMinimap(car, traffic);
  }

  drawMinimap(car, traffic) {
    const c = this.mctx, W = this.mini.width, S = W / 340;
    const X = (x) => (x + 170) * S, Z = (z) => (z + 170) * S;
    c.fillStyle = '#263226'; c.fillRect(0, 0, W, W);
    c.strokeStyle = '#4a4d52'; c.lineWidth = 6.5 * S; c.lineCap = 'butt';
    for (const g of GRID) { c.beginPath(); c.moveTo(X(g), Z(-ROAD_END)); c.lineTo(X(g), Z(ROAD_END)); c.stroke(); c.beginPath(); c.moveTo(X(-ROAD_END), Z(g)); c.lineTo(X(ROAD_END), Z(g)); c.stroke(); }
    for (const k in ZONES) { const z = ZONES[k]; c.fillStyle = k === 'konbini' ? '#2d8a5a' : '#2f5fb5'; c.fillRect(X(z.minX), Z(z.minZ), (z.maxX - z.minX) * S, (z.maxZ - z.minZ) * S); }
    c.font = `${9 * S / 0.6}px sans-serif`; c.fillStyle = '#fff'; c.fillText('P', X(12), Z(44)); c.fillText('コンビニ', X(36), Z(24));
    for (const n of NODES) {
      if (n.type === 'signal') {
        const ph = n.phases[n.phaseIdx];
        const col = (s) => s.color === 'green' ? '#1fe3a0' : s.color === 'yellow' ? '#ffd23c' : '#ff2d2d';
        c.fillStyle = col(ph.NS); c.fillRect(X(n.x) - 2 * S, Z(n.z) - 6 * S, 4 * S, 4 * S);
        c.fillStyle = col(ph.EW); c.fillRect(X(n.x) + 3 * S, Z(n.z) - 2 * S, 4 * S, 4 * S);
      } else { c.fillStyle = '#d9281c'; c.beginPath(); c.moveTo(X(n.x) - 4 * S, Z(n.z) - 4 * S); c.lineTo(X(n.x) + 4 * S, Z(n.z) - 4 * S); c.lineTo(X(n.x), Z(n.z) + 4 * S); c.closePath(); c.fill(); }
      if (n.noUturn) { c.strokeStyle = '#ff6a3d'; c.lineWidth = 2; c.beginPath(); c.arc(X(n.x), Z(n.z), 7 * S, 0, Math.PI * 2); c.stroke(); }
    }
    c.fillStyle = '#e8c15a';
    for (const o of traffic.cars) { if (o.x > 1000) continue; c.beginPath(); c.arc(X(o.x), Z(o.z), 2.2 * S, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ff9bd0';
    for (const p of traffic.peds) c.fillRect(X(p.x) - 1, Z(p.z) - 1, 2, 2);
    // 목적지
    if (this.dest) {
      const t = performance.now() / 1000;
      c.strokeStyle = '#3fa9ff'; c.lineWidth = 2.5; c.beginPath(); c.arc(X(this.dest.x), Z(this.dest.z), (6 + 3 * Math.sin(t * 4)) * S, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#3fa9ff'; c.beginPath(); c.arc(X(this.dest.x), Z(this.dest.z), 3 * S, 0, Math.PI * 2); c.fill();
      c.font = `bold ${11 * S / 0.6}px sans-serif`; c.fillText('🏁', X(this.dest.x) + 5 * S, Z(this.dest.z) - 4 * S);
    }
    // 플레이어
    c.save(); c.translate(X(car.x), Z(car.z)); c.rotate(-car.phi);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, -5 * S); c.lineTo(3.5 * S, 4 * S); c.lineTo(-3.5 * S, 4 * S); c.closePath(); c.fill(); c.restore();
  }
}
