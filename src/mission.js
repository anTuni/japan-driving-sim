import * as THREE from 'three';
import { textBoardTexture } from './signs.js';

export const DIFFS = {
  easy: { name: '초급', limit: 5, desc: '위반 5회까지 허용' },
  normal: { name: '중급', limit: 3, desc: '위반 3회까지 허용' },
  hard: { name: '상급', limit: 0, desc: '위반 1회면 실패' },
};
// 고정 코스 (모든 난이도 동일 → 기록 비교 가능)
export const COURSE = [
  { name: '편의점', x: 46, z: 11, hint: '출발 도로를 동쪽으로 → 오른쪽 가게. 깜빡이 켜고 반대차선 확인 후 진입' },
  { name: '지정 주차장 (P)', x: 16, z: 41, hint: '중앙 교차로에서 남쪽으로 → 왼쪽 P 표지 입구로' },
  { name: '공항 터미널', x: 91.6, z: 124, hint: '동쪽 도로(유턴금지 교차로 지나) 남쪽 끝' },
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`;

export function loadRank(diff) { try { return JSON.parse(localStorage.getItem('jds.rank.' + diff) || '[]'); } catch { return []; } }
function saveRank(diff, list) { localStorage.setItem('jds.rank.' + diff, JSON.stringify(list)); }

export class Mission {
  constructor(scene, car, rules, ui, startPose) {
    this.scene = scene; this.car = car; this.rules = rules; this.ui = ui; this.startPose = startPose;
    this.state = 'idle'; this.diff = 'normal'; this.time = 0; this.violations = 0; this.idx = 0; this.log = [];
    this.hud = document.querySelector('#mission-hud');
    this.overlay = document.querySelector('#mission-overlay');
    // 목적지 비콘
    this.beacons = COURSE.map(c => {
      const g = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      cyl.position.y = 7; g.add(cyl);
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textBoardTexture(['🏁 ' + c.name], '#1b4fbf', '#fff', 512, 128), transparent: true }));
      label.scale.set(10, 2.5, 1); label.position.y = 15; g.add(label);
      g.position.set(c.x, 0, c.z); g.visible = false; scene.add(g);
      return g;
    });
    rules.onViolation = (key, msg) => this.onViolation(key, msg);
  }
  get running() { return this.state === 'running'; }
  get current() { return this.running ? COURSE[this.idx] : null; }

  start(diff) {
    this.diff = diff; this.state = 'running'; this.time = 0; this.violations = 0; this.idx = 0; this.log = [];
    this.car.reset(this.startPose.x, this.startPose.z, this.startPose.phi); this.car.gear = 'D';
    this.rules.track = null; this.rules.cool.clear();
    document.querySelector('#toasts').innerHTML = '';
    this.beacons.forEach((b, i) => b.visible = i === 0);
    this.hud.classList.remove('hidden'); this.overlay.classList.add('hidden');
    this.ui.dest = COURSE[0];
    this.ui.toast(`미션 시작 [${DIFFS[diff].name}] — 1/${COURSE.length} 목적지: ${COURSE[0].name}. ${COURSE[0].hint}`, 'info');
  }
  stop() { this.state = 'idle'; this.hud.classList.add('hidden'); this.beacons.forEach(b => b.visible = false); this.ui.dest = null; }

  onViolation(key, msg) {
    if (!this.running) return;
    this.violations++; this.log.push(msg);
    const limit = DIFFS[this.diff].limit;
    if (this.violations > limit) this.fail(msg);
  }

  update(dt) {
    if (!this.running) return;
    this.time += dt;
    const c = COURSE[this.idx], car = this.car;
    const dx = c.x - car.x, dz = c.z - car.z, dist = Math.hypot(dx, dz);
    const b = this.beacons[this.idx]; b.children[1].rotation.z += dt; b.children[0].material.opacity = 0.18 + 0.08 * Math.sin(this.time * 3);
    if (dist < 6 && Math.abs(car.v) < 0.3) {
      b.visible = false; this.idx++;
      if (this.idx >= COURSE.length) return this.success();
      this.beacons[this.idx].visible = true; this.ui.dest = COURSE[this.idx];
      this.ui.toast(`✔ ${c.name} 도착! 다음 ${this.idx + 1}/${COURSE.length}: ${COURSE[this.idx].name}. ${COURSE[this.idx].hint}`, 'good');
      return;
    }
    // HUD: 목적지 방향 화살표 (차량 heading 기준)
    const ang = Math.atan2(dx, -dz) + car.phi;  // 0 = 정면
    this.hud.querySelector('.m-arrow').style.transform = `rotate(${ang * 57.3}deg)`;
    this.hud.querySelector('.m-dest').textContent = `${this.idx + 1}/${COURSE.length} ${c.name}`;
    this.hud.querySelector('.m-dist').textContent = `${Math.round(dist)}m`;
    this.hud.querySelector('.m-time').textContent = fmt(this.time);
    const limit = DIFFS[this.diff].limit;
    const v = this.hud.querySelector('.m-viol'); v.textContent = `위반 ${this.violations}/${limit}`; v.classList.toggle('warn', this.violations >= limit);
  }

  fail(reason) {
    this.state = 'failed'; this.hud.classList.add('hidden'); this.beacons.forEach(b => b.visible = false); this.ui.dest = null;
    this.showOverlay(`
      <h1>미션 실패</h1>
      <div class="sub">[${DIFFS[this.diff].name}] 위반 허용 ${DIFFS[this.diff].limit}회 초과 · 기록 ${fmt(this.time)} · 목적지 ${this.idx}/${COURSE.length} 도달</div>
      <h2>위반 내역</h2>
      <ol class="viol-list">${this.log.map(m => `<li>${m}</li>`).join('')}</ol>
      <div class="btn-row big">
        <button data-act="retry">다시 도전 (Enter)</button>
        <button data-act="menu">난이도 변경</button>
        <button data-act="free">자유 주행</button>
      </div>`);
  }

  success() {
    this.state = 'success'; this.hud.classList.add('hidden'); this.ui.dest = null;
    const list = loadRank(this.diff);
    const qualifies = list.length < 5 || this.time < list[list.length - 1].time;
    const base = `<h1>미션 완료! 🎉</h1>
      <div class="sub">[${DIFFS[this.diff].name}] 기록 <b class="big-time">${fmt(this.time)}</b> · 위반 ${this.violations}회</div>`;
    if (!qualifies) {
      this.showOverlay(base + `<p class="muted">TOP 5에 들지 못했어요. 현재 5위 기록: ${fmt(list[4].time)}</p>${rankTable(this.diff)}
        <div class="btn-row big"><button data-act="retry">다시 도전 (Enter)</button><button data-act="menu">난이도 변경</button><button data-act="free">자유 주행</button></div>`);
      return;
    }
    this.initials = [0, 0, 0]; this.slot = 0;
    this.showOverlay(base + `<h2>TOP 5 진입! 이니셜을 등록하세요 (←→ 칸 이동, ↑↓ 글자, Enter 등록)</h2>
      <div class="initials">${[0, 1, 2].map(i => `<div class="slot" data-slot="${i}"><button data-up="${i}">▲</button><div class="letter">A</div><button data-down="${i}">▼</button></div>`).join('')}</div>
      <div class="btn-row big"><button data-act="register">등록 (Enter)</button></div>`);
    this.renderInitials();
  }
  renderInitials() {
    this.overlay.querySelectorAll('.slot').forEach((s, i) => { s.querySelector('.letter').textContent = LETTERS[this.initials[i]]; s.classList.toggle('active', i === this.slot); });
  }
  register() {
    if (!this.initials) return;
    const name = this.initials.map(i => LETTERS[i]).join('');
    this.initials = null;
    const list = loadRank(this.diff);
    list.push({ name, time: this.time, violations: this.violations, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => a.time - b.time); saveRank(this.diff, list.slice(0, 5));
    this.showOverlay(`<h1>랭킹 등록 완료</h1><div class="sub">${name} · ${fmt(this.time)}</div>${rankTable(this.diff, name, this.time)}
      <div class="btn-row big"><button data-act="retry">다시 도전 (Enter)</button><button data-act="menu">난이도 변경</button><button data-act="free">자유 주행</button></div>`);
    this.ui.renderRankings();
  }

  showOverlay(html) {
    this.overlay.innerHTML = `<div class="card">${html}</div>`; this.overlay.classList.remove('hidden');
    this.overlay.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act)));
    this.overlay.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.up; this.slot = i; this.initials[i] = (this.initials[i] + 25) % 26; this.renderInitials(); }));
    this.overlay.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.down; this.slot = i; this.initials[i] = (this.initials[i] + 1) % 26; this.renderInitials(); }));
  }
  act(a) {
    this.overlay.classList.add('hidden');
    if (a === 'retry') this.start(this.diff);
    else if (a === 'menu') { this.stop(); this.ui.showOverlay(); }
    else if (a === 'free') { this.stop(); this.car.reset(this.startPose.x, this.startPose.z, this.startPose.phi); }
    else if (a === 'register') this.register();
  }
  // 오버레이가 떠 있을 때 키 처리. true 반환 시 소비됨
  handleKey(k) {
    if (this.overlay.classList.contains('hidden')) return false;
    if (this.state === 'success' && this.initials) {
      if (k === 'ArrowLeft') this.slot = (this.slot + 2) % 3;
      else if (k === 'ArrowRight') this.slot = (this.slot + 1) % 3;
      else if (k === 'ArrowUp') this.initials[this.slot] = (this.initials[this.slot] + 25) % 26;
      else if (k === 'ArrowDown') this.initials[this.slot] = (this.initials[this.slot] + 1) % 26;
      else if (k.length === 1 && /[a-z]/.test(k)) { this.initials[this.slot] = LETTERS.indexOf(k.toUpperCase()); this.slot = Math.min(2, this.slot + 1); }
      else if (k === 'Enter') { this.act('register'); return true; }
      this.renderInitials(); return true;
    }
    if (k === 'Enter') { this.act('retry'); return true; }
    return true;
  }
}

export function rankTable(diff, hlName, hlTime) {
  const list = loadRank(diff);
  if (!list.length) return `<p class="muted">아직 기록 없음</p>`;
  return `<table class="rank"><thead><tr><th>#</th><th>이니셜</th><th>기록</th><th>위반</th><th>날짜</th></tr></thead><tbody>${list.map((r, i) =>
    `<tr class="${r.name === hlName && r.time === hlTime ? 'me' : ''}"><td>${i + 1}</td><td>${r.name}</td><td>${fmt(r.time)}</td><td>${r.violations}</td><td>${r.date}</td></tr>`).join('')}</tbody></table>`;
}
