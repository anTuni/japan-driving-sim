import * as THREE from 'three';

const WHEELBASE = 3.0;
const MAX_FWD = 60 / 3.6;   // 60 km/h
const MAX_REV = 15 / 3.6;

function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export class PlayerCar {
  constructor(scene) {
    this.x = 0; this.z = 0; this.phi = 0; this.v = 0; this.steer = 0;
    this.gear = 'P';
    this.signal = null; this.signalPhi0 = 0; this.wiper = false; this.wiperT = 0;
    this.time = 0; this.odometer = 0;
    this.length = 4.9; this.width = 1.85;
    this.mesh = this.buildMesh();
    scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0.3, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x27343f, metalness: 0.6, roughness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.8 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.3 });
    const interior = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.9 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x4b4238, roughness: 0.95 });
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // 차체 (알파드 풍 미니밴)
    mk(B(1.85, 0.78, 4.9), body, 0, 0.74, 0);
    mk(B(1.78, 0.9, 3.75), glass, 0, 1.55, 0.3);          // 캐빈(유리)
    mk(B(1.72, 0.08, 3.55), body, 0, 2.0, 0.3);           // 루프
    mk(B(1.86, 0.16, 0.6), body, 0, 1.2, -1.55);          // 카울(윈드실드 하단)
    mk(B(1.8, 0.36, 0.12), dark, 0, 0.55, -2.46);          // 그릴
    mk(B(1.9, 0.12, 0.2), dark, 0, 0.42, 2.45);            // 리어 범퍼
    // 헤드라이트 / 테일램프
    for (const s of [-1, 1]) {
      mk(B(0.38, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6d5 }), s * 0.66, 0.95, -2.47);
      mk(B(0.3, 0.3, 0.06), new THREE.MeshBasicMaterial({ color: 0xc8202a }), s * 0.7, 1.05, 2.47);
    }
    // 방향지시등 (앞·뒤·측면)
    this.lampMats = { L: [], R: [] };
    for (const [key, s] of [['L', -1], ['R', 1]]) {
      for (const [x, y, z, w, d] of [[s * 0.88, 0.95, -2.44, 0.14, 0.1], [s * 0.88, 1.05, 2.45, 0.14, 0.1], [s * 0.94, 1.0, -1.1, 0.04, 0.3]]) {
        const m = new THREE.MeshBasicMaterial({ color: 0x6b4a1a });
        mk(B(w, 0.12, d), m, x, y, z); this.lampMats[key].push(m);
      }
    }
    // 바퀴 (조향 그룹 → 회전 그룹 → 실린더)
    this.wheels = [];
    for (const [x, z, front] of [[-0.86, -1.5, true], [0.86, -1.5, true], [-0.86, 1.5, false], [0.86, 1.5, false]]) {
      const steerG = new THREE.Group(); steerG.position.set(x, 0.35, z);
      const spinG = new THREE.Group(); steerG.add(spinG);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 18), tire); t.rotation.z = Math.PI / 2; t.castShadow = true; spinG.add(t);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 8), rim); r.rotation.z = Math.PI / 2; spinG.add(r);
      g.add(steerG); this.wheels.push({ steerG, spinG, front });
    }
    // 실내: 대시보드, 좌석(운전석 = 오른쪽), A필러, 룸미러
    mk(B(1.76, 0.36, 0.7), interior, 0, 1.0, -1.3);
    mk(B(0.55, 0.55, 0.55), seat, 0.45, 0.78, -0.25); mk(B(0.5, 0.6, 0.2), seat, 0.45, 1.3, 0.05);
    mk(B(0.55, 0.55, 0.55), seat, -0.45, 0.78, -0.25); mk(B(0.5, 0.6, 0.2), seat, -0.45, 1.3, 0.05);
    mk(B(0.5, 0.6, 0.18), seat, -0.45, 1.3, 1.1); mk(B(0.5, 0.6, 0.18), seat, 0.45, 1.3, 1.1);
    for (const s of [-1, 1]) { const p = mk(B(0.06, 0.95, 0.06), interior, s * 0.87, 1.58, -1.28); p.rotation.x = 0.63; }
    mk(B(0.26, 0.07, 0.04), dark, 0, 1.78, -1.15);
    // 스티어링 휠 (운전석 오른쪽)
    this.wheelGroup = new THREE.Group(); this.wheelGroup.position.set(0.45, 1.15, -0.9); this.wheelGroup.rotation.x = 0.5;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 10, 28), dark); this.wheelGroup.add(torus);
    for (const a of [0, 2.1, -2.1]) { const sp = new THREE.Mesh(B(0.03, 0.18, 0.02), dark); sp.position.set(Math.sin(a) * 0.09, Math.cos(a) * 0.09, 0); sp.rotation.z = -a; this.wheelGroup.add(sp); }
    g.add(this.wheelGroup);
    // 와이퍼 2개
    this.wipers = [];
    for (const x of [-0.55, 0.35]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 1.16, -1.62); pivot.rotation.x = -0.55;
      const blade = new THREE.Mesh(B(0.025, 0.65, 0.02), dark); blade.position.set(0, 0.32, 0); pivot.add(blade);
      g.add(pivot); this.wipers.push(pivot);
    }
    return g;
  }

  reset(x, z, phi) {
    this.x = x; this.z = z; this.phi = phi; this.v = 0; this.steer = 0; this.gear = 'P'; this.signal = null; this.wiper = false;
    this.syncMesh();
  }

  setGear(g) {
    if (g === this.gear) return { ok: true };
    if (g !== 'N' && Math.abs(this.v) > 0.8) return { ok: false, msg: '정차 후 기어를 바꾸세요 (브레이크 S)' };
    this.gear = g; return { ok: true };
  }

  setSignal(dir) {
    this.signal = (this.signal === dir) ? null : dir;
    this.signalPhi0 = this.phi;
  }
  get signalOn() { return this.signal && (this.time % 0.8) < 0.42; }

  // 차체 로컬 좌표 → 월드
  local(lx, lz) {
    const c = Math.cos(this.phi), s = Math.sin(this.phi);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }
  get forward() { return { x: -Math.sin(this.phi), z: -Math.cos(this.phi) }; }
  get speedKmh() { return Math.abs(this.v) * 3.6; }

  update(dt, input, colliders, otherCars) {
    this.time += dt;
    const events = [];
    const drive = input.throttle ? (this.gear === 'D' ? 1 : this.gear === 'R' ? -1 : 0) : 0;
    const maxV = this.gear === 'R' ? MAX_REV : MAX_FWD;
    let a = 0;
    if (drive) a += drive * 5.6 * Math.max(0.2, 1 - Math.abs(this.v) / maxV);
    const sgn = Math.sign(this.v);
    if (sgn !== 0) {
      let decel = 0.6 + 0.012 * this.v * this.v;           // 구름/공기 저항
      if (input.brake) decel += 9.0;
      if (this.gear === 'P') decel += 20;
      a -= sgn * decel;
    }
    let nv = this.v + a * dt;
    if (sgn !== 0 && Math.sign(nv) !== sgn && !drive) nv = 0; // 감속 중 부호 반전 방지
    if (drive === 0 && Math.abs(nv) < 0.03) nv = 0;
    this.v = nv;

    // 조향: 속도에 따라 최대 조향각 감소
    const maxSteer = 0.62 / (1 + Math.pow(Math.abs(this.v) / 11, 2)) + 0.08;
    const target = input.steer * maxSteer;
    const rate = (target === 0 ? 3.2 : 2.6) * dt;
    this.steer += THREE.MathUtils.clamp(target - this.steer, -rate, rate);

    // 기구학적 자전거 모델
    const px = this.x, pz = this.z, pphi = this.phi;
    this.phi += (this.v / WHEELBASE) * Math.tan(this.steer) * dt;
    this.phi = wrapAngle(this.phi);
    const f = this.forward;
    this.x += f.x * this.v * dt; this.z += f.z * this.v * dt;
    this.odometer += Math.abs(this.v) * dt;

    // 충돌: 차체 샘플 포인트 vs 건물 AABB
    const samples = [[-0.92, -2.45, 'left'], [0.92, -2.45, 'right'], [-0.92, 2.45, 'left'], [0.92, 2.45, 'right'], [-0.92, 0, 'left'], [0.92, 0, 'right'], [0, -2.45, 'front'], [0, 2.45, 'rear']];
    let hit = null;
    for (const [lx, lz, side] of samples) {
      const p = this.local(lx, lz);
      for (const c of colliders) if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { hit = { side, name: c.name }; break; }
      if (hit) break;
    }
    if (!hit && otherCars) {
      const fr = this.local(0, -1.3), rr = this.local(0, 1.3);
      for (const o of otherCars) {
        const of = o.local(0, -1.2), or = o.local(0, 1.2);
        for (const p of [fr, rr]) for (const q of [of, or]) {
          if (Math.hypot(p.x - q.x, p.z - q.z) < 2.25) { hit = { side: 'car', name: '다른 차량' }; break; }
        }
        if (hit) break;
      }
    }
    if (hit) {
      this.x = px; this.z = pz; this.phi = pphi;
      if (Math.abs(this.v) > 0.3) events.push({ type: 'collision', side: hit.side, name: hit.name, speed: Math.abs(this.v) });
      this.v = -this.v * 0.15;
    }

    // 방향지시등 자동 해제: 50° 이상 돌고 핸들이 중립으로 돌아오면
    if (this.signal) {
      const turned = Math.abs(wrapAngle(this.phi - this.signalPhi0));
      if (turned > 0.85 && Math.abs(this.steer) < 0.06) this.signal = null;
    }
    // 와이퍼 애니메이션
    if (this.wiper || this.wiperT > 0.01) {
      this.wiperT += dt;
      const ang = Math.abs(Math.sin(this.wiperT * 2.2)) * 1.2;
      for (const w of this.wipers) w.rotation.z = -ang;
      if (!this.wiper && ang < 0.05) this.wiperT = 0;
    }
    this.syncMesh(dt);
    return events;
  }

  syncMesh(dt = 0) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.phi;
    for (const w of this.wheels) {
      if (w.front) w.steerG.rotation.y = this.steer;
      w.spinG.rotation.x += this.v * dt / 0.35;
    }
    this.wheelGroup.rotation.z = this.steer * 6;
    const on = this.signalOn;
    for (const k of ['L', 'R']) for (const m of this.lampMats[k]) m.color.setHex((on && this.signal === k) ? 0xffb020 : 0x6b4a1a);
  }
}
