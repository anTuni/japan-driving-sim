import * as THREE from 'three';
import { NODES, DIRS, LEFT_OF, RIGHT_OF, OPP, AXIS, HALF_ROAD, STOP_LINE, leftVec, neighbor, quantizeHeading, headingOf } from './config.js';

// ───────── 신호 제어 ─────────
const PLAIN = [
  { NS: g(), EW: r(), dur: 11 }, { NS: y(), EW: r(), dur: 3 }, { NS: r(), EW: r(), dur: 2 },
  { NS: r(), EW: g(), dur: 11 }, { NS: r(), EW: y(), dur: 3 }, { NS: r(), EW: r(), dur: 2 },
];
const ARROW = [
  { NS: g(), EW: r(), dur: 9 }, { NS: y(), EW: r(), dur: 3 }, { NS: r('L', 'S'), EW: r(), dur: 5 }, { NS: r('R'), EW: r(), dur: 5 }, { NS: y(), EW: r(), dur: 2 }, { NS: r(), EW: r(), dur: 1.5 },
  { NS: r(), EW: g(), dur: 9 }, { NS: r(), EW: y(), dur: 3 }, { NS: r(), EW: r('L', 'S'), dur: 5 }, { NS: r(), EW: r('R'), dur: 5 }, { NS: r(), EW: y(), dur: 2 }, { NS: r(), EW: r(), dur: 1.5 },
];
function g() { return { color: 'green', arrows: new Set() }; }
function y() { return { color: 'yellow', arrows: new Set() }; }
function r(...a) { return { color: 'red', arrows: new Set(a) }; }

export class Signals {
  constructor() {
    this.nodes = NODES.filter(n => n.type === 'signal');
    for (const n of this.nodes) { n.phases = n.arrows ? ARROW : PLAIN; n.phaseIdx = 0; n.phaseT = Math.random() * 8; n.cycle = n.phases.reduce((s, p) => s + p.dur, 0); }
  }
  update(dt) {
    for (const n of this.nodes) {
      n.phaseT += dt;
      while (n.phaseT >= n.phases[n.phaseIdx].dur) { n.phaseT -= n.phases[n.phaseIdx].dur; n.phaseIdx = (n.phaseIdx + 1) % n.phases.length; }
      const ph = n.phases[n.phaseIdx];
      for (const d of ['N', 'E', 'S', 'W']) {
        const st = ph[AXIS[d]], L = n.lights[d];
        L.g.material.color.setHex(st.color === 'green' ? 0x1fe3a0 : 0x0c3b2a);
        L.y.material.color.setHex(st.color === 'yellow' ? 0xffd23c : 0x4a3c0a);
        L.r.material.color.setHex(st.color === 'red' ? 0xff2d2d : 0x3f0c0c);
        for (const k in L.arrows) L.arrows[k].visible = st.arrows.has(k);
      }
    }
  }
  // 노드에 heading d로 접근하는 차량이 보는 신호
  stateFor(node, d) {
    if (node.type !== 'signal') return null;
    return node.phases[node.phaseIdx][AXIS[d]];
  }
}

// ───────── 횡단보도 사각형 ─────────
// side: 교차로 기준 횡단보도가 있는 쪽 (N = 북쪽 횡단보도, 남북도로를 건넘)
export function crosswalkRect(node, side) {
  const dir = DIRS[side];
  const cx = node.x + dir.x * 5.25, cz = node.z + dir.z * 5.25;
  if (dir.x !== 0) return { minX: cx - 1.5, maxX: cx + 1.5, minZ: cz - HALF_ROAD, maxZ: cz + HALF_ROAD, node, side };
  return { minX: cx - HALF_ROAD, maxX: cx + HALF_ROAD, minZ: cz - 1.5, maxZ: cz + 1.5, node, side };
}
export function inRect(x, z, r, pad = 0) { return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad; }

// ───────── 2차 베지어 샘플 ─────────
function bezier(p0, p1, p2, n) {
  const pts = [];
  for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z }); }
  return pts;
}
function lineIntersect(p, d, q, e) {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-6) return { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
  const t = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  return { x: p.x + d.x * t, z: p.z + d.z * t };
}

// ───────── AI 차량 ─────────
const CAR_COLORS = [0x2f6db5, 0xc9423a, 0x4c4f55, 0xe6e4df, 0x6f8f3c, 0x1d1f23, 0xd8a53b, 0x8a6bb5];
function buildCarMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a3540, metalness: 0.5, roughness: 0.3 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151719 });
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  mk(new THREE.BoxGeometry(1.75, 0.6, 4.4), body, 0, 0.62, 0);
  mk(new THREE.BoxGeometry(1.6, 0.6, 2.4), glass, 0, 1.2, 0.2);
  for (const [x, z] of [[-0.8, -1.4], [0.8, -1.4], [-0.8, 1.4], [0.8, 1.4]]) { const w = mk(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), tire, x, 0.32, z); w.rotation.z = Math.PI / 2; }
  for (const s of [-1, 1]) {
    mk(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff6d5 }), s * 0.6, 0.75, -2.22);
    mk(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xc8202a }), s * 0.6, 0.8, 2.22);
  }
  const lamps = { L: [], R: [] };
  for (const [k, s] of [['L', -1], ['R', 1]]) for (const z of [-2.2, 2.2]) { const m = new THREE.MeshBasicMaterial({ color: 0x6b4a1a }); mk(new THREE.BoxGeometry(0.16, 0.12, 0.06), m, s * 0.84, 0.78, z); lamps[k].push(m); }
  g.userData.lamps = lamps;
  return g;
}

export class AICar {
  constructor(scene, color) {
    this.mesh = buildCarMesh(color); scene.add(this.mesh);
    this.x = 0; this.z = 0; this.phi = 0; this.v = 0; this.signal = null; this.time = Math.random() * 10;
    this.state = 'road'; this.leg = null; this.stopTimer = 0; this.isAI = true;
  }
  local(lx, lz) { const c = Math.cos(this.phi), s = Math.sin(this.phi); return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c }; }
  get forward() { return { x: -Math.sin(this.phi), z: -Math.cos(this.phi) }; }
  get heading() { return this.leg ? this.leg.dir : quantizeHeading(this.phi); }

  // fromNode에서 dir 방향으로 distAlong 지점에 배치
  startOn(fromNode, dir, distAlong) {
    const d = DIRS[dir], l = leftVec(dir);
    this.x = fromNode.x + d.x * distAlong + l.x * 1.6; this.z = fromNode.z + d.z * distAlong + l.z * 1.6;
    this.phi = headingOf(dir); this.v = 6; this.state = 'road';
    this.leg = this.makeLeg(fromNode, dir);
  }
  chooseTurn(B, dir) {
    const opts = [];
    for (const [t, nd] of [['S', dir], ['L', LEFT_OF[dir]], ['R', RIGHT_OF[dir]]]) { const nb = neighbor(B, nd); if (nb && !nb.end) opts.push({ t, nd, w: t === 'S' ? 0.5 : 0.25 }); }
    if (!opts.length) return { t: 'U', nd: OPP[dir] };
    let s = opts.reduce((a, o) => a + o.w, 0), rr = Math.random() * s;
    for (const o of opts) { rr -= o.w; if (rr <= 0) return o; }
    return opts[0];
  }
  makeLeg(from, dir) {
    const B = neighbor(from, dir);
    const d = DIRS[dir], l = leftVec(dir);
    const { t, nd } = this.chooseTurn(B, dir);
    const d2 = DIRS[nd], l2 = leftVec(nd);
    const E = { x: B.x - d.x * HALF_ROAD + l.x * 1.6, z: B.z - d.z * HALF_ROAD + l.z * 1.6 };
    const SL = { x: B.x - d.x * STOP_LINE + l.x * 1.6, z: B.z - d.z * STOP_LINE + l.z * 1.6 };
    const X = { x: B.x + d2.x * HALF_ROAD + l2.x * 1.6, z: B.z + d2.z * HALF_ROAD + l2.z * 1.6 };
    let curve;
    if (t === 'S') curve = bezier(E, { x: (E.x + X.x) / 2, z: (E.z + X.z) / 2 }, X, 4);
    else if (t === 'U') curve = bezier(E, { x: B.x + d.x * 2, z: B.z + d.z * 2 }, X, 14);
    else curve = bezier(E, lineIntersect(E, d, X, d2), X, 14);
    return { B, dir, turn: t, nextDir: nd, E, SL, curve, exitCW: crosswalkRect(B, nd), approachCW: crosswalkRect(B, OPP[dir]), stopped: false };
  }

  update(dt, ctx) {
    this.time += dt;
    const leg = this.leg; if (!leg) return;
    const d = DIRS[leg.dir], l = leftVec(leg.dir);
    let target = 8;
    const ahead = (p) => (p.x - this.x) * d.x + (p.z - this.z) * d.z;

    if (this.state === 'road') {
      const dSL = ahead(leg.SL), dE = ahead(leg.E);
      if (leg.turn !== 'S' && dE < 18) { target = 4; if (!this.signal) this.signal = leg.turn === 'L' ? 'L' : 'R'; }
      // 정지 판단 (정지선 전)
      let mustStop = false;
      if (dSL > -0.2) {
        const st = ctx.signals.stateFor(leg.B, leg.dir);
        if (st) {
          if (st.color === 'red' && !st.arrows.has(leg.turn)) mustStop = true;
          if (st.color === 'yellow' && dSL > this.v * this.v / 7 + 1) mustStop = true;
        }
        if (leg.B.stopDirs.includes(leg.dir) && !leg.stopped) {
          mustStop = true;
          if (dSL < 1.0 && this.v < 0.15) { this.stopTimer += dt; if (this.stopTimer > 1.3) { leg.stopped = true; this.stopTimer = 0; mustStop = false; } }
        }
        if (ctx.pedInRect(leg.approachCW, 0.6)) mustStop = true;
        if (mustStop) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 3.5 * (dSL - 0.4))));
      }
      target = Math.min(target, this.gapSpeed(ctx, d, l));
      this.v += THREE.MathUtils.clamp(target - this.v, -7 * dt, 3 * dt);
      if (this.v < 0.02 && target < 0.05) this.v = 0;
      this.x += d.x * this.v * dt; this.z += d.z * this.v * dt;
      this.phi = headingOf(leg.dir);
      if (dE <= 0) { this.state = 'turn'; this.idx = 0; }
    } else { // turn
      const p = leg.curve[this.idx];
      const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
      target = leg.turn === 'S' ? 8 : 4;
      // 우회전: 중앙 근처에서 맞은편 직진 차량에 양보
      if (leg.turn === 'R' && this.idx <= 4 && this.idx >= 3 && ctx.oncomingBlocked(leg.B, leg.dir, this)) target = 0;
      // 출구 횡단보도 보행자
      if (this.idx >= leg.curve.length - 3 && ctx.pedInRect(leg.exitCW, 0.6)) target = 0;
      target = Math.min(target, this.gapSpeed(ctx, { x: dx / (dist || 1), z: dz / (dist || 1) }, null));
      this.v += THREE.MathUtils.clamp(target - this.v, -7 * dt, 3 * dt);
      if (this.v < 0.02 && target < 0.05) this.v = 0;
      if (dist > 0.01) {
        const step = Math.min(dist, this.v * dt);
        this.x += dx / dist * step; this.z += dz / dist * step;
        if (this.v > 0.1) { const tphi = Math.atan2(-dx, -dz); let da = tphi - this.phi; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; this.phi += da * Math.min(1, 8 * dt); }
      }
      if (dist < 0.35) { this.idx++; if (this.idx >= leg.curve.length) { this.leg = this.makeLeg(leg.B, leg.nextDir); this.state = 'road'; this.signal = null; this.stopTimer = 0; } }
    }
    this.sync();
  }
  // 앞차·보행자와의 간격에 따른 속도 제한
  gapSpeed(ctx, d, l) {
    let t = Infinity;
    const lv = l || { x: -d.z, z: d.x };
    for (const o of ctx.allCars) {
      if (o === this) continue;
      const rx = o.x - this.x, rz = o.z - this.z;
      const a = rx * d.x + rz * d.z, lat = Math.abs(rx * lv.x + rz * lv.z);
      if (a > 0 && a < 18 && lat < 2.3) t = Math.min(t, Math.max(0, (a - 8) * 1.1));
    }
    for (const p of ctx.peds) {
      const rx = p.x - this.x, rz = p.z - this.z;
      const a = rx * d.x + rz * d.z, lat = Math.abs(rx * lv.x + rz * lv.z);
      if (a > 0 && a < 9 && lat < 2.2) t = 0;
    }
    return t;
  }
  sync() {
    this.mesh.position.set(this.x, 0, this.z); this.mesh.rotation.y = this.phi;
    const on = this.signal && (this.time % 0.8) < 0.42;
    for (const k of ['L', 'R']) for (const m of this.mesh.userData.lamps[k]) m.color.setHex(on && this.signal === k ? 0xffb020 : 0x6b4a1a);
  }
}

// 편의점 앞에서 갑자기 멈추고 우회전 진입하는 시나리오 차량
export class KonbiniCar extends AICar {
  constructor(scene) { super(scene, 0xd8a53b); this.mode = 'cruise'; this.waitT = 0; this.respawn(); }
  respawn() {
    const start = { x: -150, z: 0 }; // z=0 도로 서쪽 끝
    this.x = -112; this.z = -1.6; this.phi = headingOf('E'); this.v = 5; this.mode = 'cruise'; this.signal = null; this.state = 'road';
    this.leg = this.makeLeg({ x: -150, z: 0, end: true }, 'E');
    this.mesh.visible = true;
  }
  chooseTurn(B, dir) { return this.mode === 'cruise' ? { t: 'S', nd: dir } : super.chooseTurn(B, dir); }
  update(dt, ctx) {
    this.time += dt;
    if (this.mode === 'cruise') {
      // 편의점 구간(z=0 도로, x 0→90 동진)
      if (this.leg && this.leg.dir === 'E' && this.leg.B.x === 90 && this.x > 20) {
        if (this.x > 26) this.signal = 'R';
        const dStop = 40 - this.x;
        if (dStop < 12) {
          let target = Math.sqrt(Math.max(0, 2 * 3.5 * (dStop - 0.3)));
          target = Math.min(target, this.gapSpeed(ctx, DIRS.E, leftVec('E')));
          this.v += THREE.MathUtils.clamp(target - this.v, -7 * dt, 3 * dt);
          if (this.v < 0.02 && target < 0.05) this.v = 0;
          this.x += this.v * dt; this.sync();
          if (dStop < 0.6 && this.v < 0.05) {
            // 맞은편(서행 차로 z=+1.6, x 40~75) 차량 없으면 진입
            const blocked = ctx.allCars.some(o => o !== this && o.z > 0 && o.z < 3.5 && o.x > 38 && o.x < 75 && (o.isAI ? true : Math.abs(o.v) > 0.3 || o.x < 60));
            if (!blocked) { this.mode = 'enter'; this.curve = bezier({ x: 40, z: -1.6 }, { x: 46, z: 0.5 }, { x: 46, z: 7 }, 10).concat([{ x: 46, z: 12.5 }]); this.idx = 0; }
          }
          return;
        }
      }
      super.update(dt, ctx);
      return;
    }
    if (this.mode === 'enter') {
      const p = this.curve[this.idx];
      const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
      let target = 3.5;
      this.v += THREE.MathUtils.clamp(target - this.v, -7 * dt, 2.5 * dt);
      const step = Math.min(dist, this.v * dt);
      if (dist > 0.01) { this.x += dx / dist * step; this.z += dz / dist * step; const tphi = Math.atan2(-dx, -dz); let da = tphi - this.phi; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; this.phi += da * Math.min(1, 8 * dt); }
      if (dist < 0.3) { this.idx++; if (this.idx >= this.curve.length) { this.mode = 'parked'; this.v = 0; this.signal = null; this.waitT = 0; } }
      this.sync();
      return;
    }
    if (this.mode === 'parked') {
      this.waitT += dt; this.sync();
      if (this.waitT > 6) { this.mesh.visible = false; this.mode = 'gone'; this.waitT = 0; this.x = 9999; this.z = 9999; }
      return;
    }
    if (this.mode === 'gone') { this.waitT += dt; if (this.waitT > 10) this.respawn(); }
  }
}

// ───────── 보행자 ─────────
const PED_COLORS = [0xd94f4f, 0x3f7fd9, 0x3fa65b, 0xe0a030, 0x8b5fc9, 0x333333];
export class Pedestrian {
  constructor(scene, node, startCorner, signals) {
    this.node = node; this.signals = signals;
    const o = 5.25;
    this.corners = [{ x: node.x - o, z: node.z - o }, { x: node.x + o, z: node.z - o }, { x: node.x + o, z: node.z + o }, { x: node.x - o, z: node.z + o }];
    // 구간 i: corners[i] → corners[i+1]; 건너는 횡단보도 side 와 보행 평행 축
    this.segs = [{ side: 'N', axis: 'EW' }, { side: 'E', axis: 'NS' }, { side: 'S', axis: 'EW' }, { side: 'W', axis: 'NS' }];
    this.idx = startCorner % 4; this.x = this.corners[this.idx].x; this.z = this.corners[this.idx].z;
    this.state = 'wait'; this.wait = 1 + Math.random() * 4; this.speed = 1.1 + Math.random() * 0.5; this.t = Math.random() * 10;
    this.mesh = new THREE.Group();
    const col = PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.9, 10), new THREE.MeshLambertMaterial({ color: col })); body.position.y = 0.85; body.castShadow = true;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.45, 8), new THREE.MeshLambertMaterial({ color: 0x2c3340 })); legs.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshLambertMaterial({ color: 0xf1c9a5 })); head.position.y = 1.46;
    this.mesh.add(body, legs, head); scene.add(this.mesh);
    this.rect = crosswalkRect(node, this.segs[this.idx].side);
  }
  canCross() {
    const seg = this.segs[this.idx];
    if (this.node.type !== 'signal') return true;
    const st = this.signals.stateFor(this.node, seg.axis === 'NS' ? 'N' : 'E');
    const ph = this.node.phases[this.node.phaseIdx];
    return st.color === 'green' && (ph.dur - this.node.phaseT) > 4;
  }
  update(dt) {
    this.t += dt;
    if (this.state === 'wait') {
      this.wait -= dt;
      if (this.wait <= 0 && this.canCross()) { this.state = 'walk'; this.rect = crosswalkRect(this.node, this.segs[this.idx].side); }
    } else {
      const tgt = this.corners[(this.idx + 1) % 4];
      const dx = tgt.x - this.x, dz = tgt.z - this.z, dist = Math.hypot(dx, dz);
      const step = Math.min(dist, this.speed * dt);
      if (dist > 0.01) { this.x += dx / dist * step; this.z += dz / dist * step; this.mesh.rotation.y = Math.atan2(-dx, -dz); }
      if (dist < 0.05) { this.idx = (this.idx + 1) % 4; this.state = 'wait'; this.wait = 2 + Math.random() * 6; }
    }
    this.mesh.position.set(this.x, this.state === 'walk' ? Math.abs(Math.sin(this.t * 7)) * 0.04 : 0, this.z);
  }
  get crossing() { return this.state === 'walk' && inRect(this.x, this.z, this.rect, 0.3); }
}

// ───────── 통합 관리 ─────────
export class Traffic {
  constructor(scene) {
    this.signals = new Signals();
    this.cars = []; this.peds = [];
    const N = (ix, iz) => NODES[iz * 3 + ix];
    const spawns = [
      [N(0, 1), 'E', 20], [N(1, 1), 'S', 30], [N(2, 2), 'W', 15], [N(0, 0), 'S', 40], [N(2, 0), 'S', 10], [N(1, 2), 'N', 25], [N(2, 1), 'N', 45], [N(0, 2), 'E', 50],
    ];
    spawns.forEach(([n, d, dist], i) => { const c = new AICar(scene, CAR_COLORS[i % CAR_COLORS.length]); c.startOn(n, d, dist); this.cars.push(c); });
    this.konbini = new KonbiniCar(scene); this.cars.push(this.konbini);
    for (const n of NODES) { const cnt = n.type === 'signal' ? 2 : 1; for (let i = 0; i < cnt; i++) this.peds.push(new Pedestrian(scene, n, Math.floor(Math.random() * 4), this.signals)); }
  }
  update(dt, player) {
    this.signals.update(dt);
    const allCars = [...this.cars, player];
    const ctx = {
      signals: this.signals, allCars, peds: this.peds,
      pedInRect: (rect, pad) => this.peds.some(p => inRect(p.x, p.z, rect, pad)),
      oncomingBlocked: (B, dir, self) => this.oncomingBlocked(B, dir, self, allCars),
    };
    for (const p of this.peds) p.update(dt);
    for (const c of this.cars) c.update(dt, ctx);
  }
  // 노드 B에 heading dir로 우회전 중인 차량에게 맞은편 직진 차량이 있는지
  oncomingBlocked(B, dir, self, allCars) {
    const od = OPP[dir], d = DIRS[od];
    for (const o of allCars) {
      if (o === self) continue;
      if (o.isAI && o.state === 'turn' && o.leg && o.leg.turn === 'R') continue; // 맞은편 우회전 차량은 서로 통과
      const h = o.isAI ? o.heading : quantizeHeading(o.phi);
      if (h !== od) continue;
      const rx = o.x - B.x, rz = o.z - B.z;
      const along = -(rx * d.x + rz * d.z);           // 양수 = B 앞쪽(접근 중)
      const lat = Math.abs(rx * d.z - rz * d.x);
      if (lat < 4 && along > -4 && along < 30 && (Math.abs(o.v) > 0.3 || along < 6)) return true;
    }
    return false;
  }
  pedInRect(rect, pad = 0.3) { return this.peds.some(p => inRect(p.x, p.z, rect, pad)); }
}
