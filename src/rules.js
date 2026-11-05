import { NODES, DIRS, LEFT_OF, RIGHT_OF, OPP, HALF_ROAD, STOP_LINE, ZONES, KONBINI_ENTRY, leftVec, onRoad, anyZone, inZone, quantizeHeading } from './config.js';
import { inRect } from './traffic.js';

export const CHECKLIST = [
  { id: 'lane', title: '좌측통행 유지', desc: '중앙선 왼쪽 차로로 250m 무위반 주행' },
  { id: 'signal', title: '깜빡이는 오른쪽 레버', desc: '회전 전에 방향지시등(Q/E) 켜기' },
  { id: 'leftSmall', title: '좌회전은 작게', desc: '교차로 좌회전 후 바로 왼쪽 차로로' },
  { id: 'rightBig', title: '우회전은 크게', desc: '교차로 중앙까지 진출 → 맞은편 보내고 회전' },
  { id: 'redAll', title: '빨간불 = 좌·우·직진 전부 정지', desc: '빨간불에 정지선 앞 정지 후 초록불 출발' },
  { id: 'arrow', title: '화살표 신호 이해', desc: '빨간불+화살표: 화살표 방향만 통과 (중앙 교차로)' },
  { id: 'stopSign', title: '止まれ 완전 정지', desc: '정지선 앞 완전 정지(0km/h) 후 출발 (모서리 교차로)' },
  { id: 'ped', title: '보행자 우선', desc: '횡단보도 보행자에게 정지해서 양보' },
  { id: 'gap', title: '앞차 거리 유지', desc: '편의점 앞 갑자기 멈춘 차 뒤에서 안전 정지' },
  { id: 'shopRight', title: '우측 가게 진입', desc: '깜빡이 + 반대차선 확인 후 중앙선 넘어 편의점 진입' },
  { id: 'park', title: '지정 주차장 이용', desc: '주차장(P 표지) 안에서 P 기어' },
  { id: 'uturn', title: '유턴은 초록불에서', desc: '초록불 교차로에서 유턴 (유턴금지 표지 교차로 제외)' },
];

export class Rules {
  constructor(traffic, ui) {
    this.traffic = traffic; this.ui = ui;
    this.score = 100; this.done = new Set(); this.cool = new Map();
    this.track = null; this.wrongLaneT = 0; this.cleanDist = 0; this.offRoadT = 0; this.parkT = 0; this.stillT = 0;
    this.pedEpisodes = new Set(); this.gapDone = false; this.shopArmed = true; this.shopPending = 0; this.parkedZone = null;
    this.violations = 0;
  }
  cooled(key, sec) { const t = performance.now() / 1000; if ((this.cool.get(key) || -1e9) + sec > t) return false; this.cool.set(key, t); return true; }
  bad(key, msg, pts, sec = 4) { if (!this.cooled(key, sec)) return; this.score = Math.max(0, this.score - pts); this.violations++; this.ui.toast(msg, 'bad', pts ? `−${pts}` : ''); if (this.onViolation) this.onViolation(key, msg, pts); }
  good(id, msg, key = id, sec = 3) {
    if (!this.cooled('g:' + key, sec)) return;
    if (id && !this.done.has(id)) { this.done.add(id); this.ui.checkDone(id); this.ui.toast(msg, 'good', '✔'); }
    else this.ui.toast(msg, 'good', '');
  }
  info(key, msg, sec = 5) { if (this.cooled('i:' + key, sec)) this.ui.toast(msg, 'info', ''); }

  update(dt, car, events) {
    const h = quantizeHeading(car.phi);
    const d = DIRS[h], l = leftVec(h);
    const speed = Math.abs(car.v);
    for (const e of events) this.onEvent(e, car);
    this.intersection(dt, car, h, d, l, speed);
    this.lane(dt, car, h, speed);
    this.pedestrians(dt, car, d, l, speed);
    this.parking(dt, car, speed);
    this.gap(dt, car);
  }

  onEvent(e, car) {
    if (e.type !== 'collision') return;
    const k = this.traffic.konbini;
    if (e.side === 'car' && k && k.mode === 'cruise' && k.signal === 'R' && Math.abs(car.x - k.x) < 10) this.bad('col', '앞차와 거리 유지! 일본은 앞차가 갑자기 멈춰 깜빡이 켜고 우회전 대기할 수 있어요', 10, 4);
    else if (e.side === 'car') this.bad('col', '차량 충돌! 교차로에서는 차량 방향을 한두 번 더 확인하세요', 10, 4);
    else if (e.side === 'left') this.bad('col', `왼쪽 차폭감 주의! 왼쪽이 긁혔어요 (${e.name}) — 운전석이 오른쪽이라 왼쪽 거리감이 다릅니다`, 5, 4);
    else this.bad('col', `충돌 (${e.name})`, 5, 4);
  }

  // ── 교차로: 정지선 · 신호 · 회전 궤적 · 깜빡이 ──
  intersection(dt, car, h, d, l, speed) {
    // 전방 노드 찾기
    let node = null, along = Infinity;
    for (const n of NODES) {
      const rx = n.x - car.x, rz = n.z - car.z;
      const a = rx * d.x + rz * d.z, lat = Math.abs(rx * l.x + rz * l.z);
      if (lat < 5 && a > -4 && a < along) { along = a; node = n; }
    }
    const t = this.track;
    const inBox = (n) => Math.abs(car.x - n.x) < HALF_ROAD && Math.abs(car.z - n.z) < HALF_ROAD;
    if (t && t.entered) {
      // 교차로 안 → 밖으로 (횡단보도 너머 6.5m 지점)로 나가면 평가
      const dx = Math.abs(car.x - t.node.x), dz = Math.abs(car.z - t.node.z);
      t.minCenter = Math.min(t.minCenter, Math.hypot(car.x - t.node.x, car.z - t.node.z));
      if (dx > 6.5 || dz > 6.5) { this.evaluateExit(car, t, quantizeHeading(car.phi)); this.track = null; }
      return;
    }
    if (!node) { this.track = null; return; }
    const frontAlong = along - 2.45;
    if (!t || t.node !== node || t.dir !== h) {
      if (frontAlong > STOP_LINE && frontAlong < 18) this.track = { node, dir: h, minSpeed: Infinity, signalBefore: car.signal, crossed: false, entered: false, minCenter: Infinity, stoppedAtRed: false, light: null };
      else this.track = null;
      return;
    }
    if (!t.crossed) {
      if (frontAlong > 18) { this.track = null; return; }
      t.minSpeed = Math.min(t.minSpeed, speed);
      if (car.signal) t.signalBefore = car.signal;
      const st = this.traffic.signals.stateFor(node, h);
      if (st && st.color === 'red' && speed < 0.3 && frontAlong < 13) t.stoppedAtRed = true;
      if (frontAlong <= STOP_LINE) {
        t.crossed = true; t.light = st ? { color: st.color, arrows: new Set(st.arrows) } : null;
        const stopSign = node.stopDirs.includes(h);
        if (stopSign) {
          if (t.minSpeed > 0.3) this.bad('stop', '止まれ! 정지선 앞에서 완전히(0km/h) 멈춘 뒤 출발하세요', 10);
          else this.good('stopSign', '止まれ 완전 정지 OK — 좌우 확인 후 출발');
        }
        if (st) {
          if (st.color === 'red' && st.arrows.size === 0) this.bad('red', '빨간불 통과! 일본은 빨간불이면 좌회전·우회전·직진 전부 금지', 15);
          else if (st.color === 'yellow' && t.minSpeed > 2) this.info('yellow', '황색 신호: 안전하게 정지할 수 있으면 정지선에 멈추세요');
          else if (st.color === 'green' && t.stoppedAtRed) this.good('redAll', '빨간불 정지 → 초록불 출발 OK (초록불엔 좌·우·직진 모두 가능)');
        }
      }
    } else if (inBox(node)) { t.entered = true; t.minCenter = Math.hypot(car.x - node.x, car.z - node.z); }
    else if (frontAlong > STOP_LINE + 2) this.track = null; // 후진으로 되돌아감
  }
  evaluateExit(car, t, outDir) {
    const n = t.node, dir = t.dir;
    const mv = outDir === dir ? 'S' : outDir === LEFT_OF[dir] ? 'L' : outDir === RIGHT_OF[dir] ? 'R' : 'U';
    const sig = t.signalBefore;
    // 깜빡이
    if (mv === 'L' || mv === 'R' || mv === 'U') {
      const need = mv === 'L' ? 'L' : 'R';
      if (sig !== need) this.bad('sig', `깜빡이 미사용! ${mv === 'L' ? '좌' : '우'}회전 30m 전에 방향지시등(${need === 'L' ? 'Q' : 'E'})을 켜세요 — 일본차는 오른쪽 레버`, 5);
      else this.good('signal', '회전 전 깜빡이 OK');
    }
    // 신호
    const L = t.light;
    if (L) {
      if (L.color === 'red') {
        if (L.arrows.size && L.arrows.has(mv)) this.good('arrow', `화살표 신호 통과 OK — 화살표 방향(${mv === 'L' ? '좌' : mv === 'R' ? '우' : '직진'})만 허용`);
        else if (L.arrows.size) this.bad('arrow', `화살표 신호 위반! 빨간불+화살표는 화살표 방향만 진행 가능 (${[...L.arrows].map(a => ({ L: '좌', S: '직진', R: '우' })[a]).join('·')})`, 15);
      } else if (L.color === 'green') {
        if (mv === 'U') { if (n.noUturn) this.bad('uturn', '유턴 금지 교차로! 유턴금지 표지가 있는 곳에선 불가', 10); else this.good('uturn', '초록불 유턴 OK (유턴금지 표지 없는 곳)'); }
      }
    } else if (mv === 'U' && n.noUturn) this.bad('uturn', '유턴 금지 교차로!', 10);
    // 회전 궤적
    const exitOff = (outDir === 'N' || outDir === 'S') ? car.x - n.x : car.z - n.z;
    const correctSide = (outDir === 'N' || outDir === 'E') ? exitOff < 0 : exitOff > 0;
    if (mv === 'L') {
      if (!correctSide) this.bad('leftWide', '좌회전은 작게! 크게 돌아 반대 차로로 나갔어요 — 왼쪽 차로로 바로 붙으세요', 5);
      else this.good('leftSmall', '좌회전 작게 OK');
    } else if (mv === 'R') {
      if (!correctSide) this.bad('rightWrong', '우회전 후 반대 차로! 왼쪽 차로로 진입하세요', 10);
      else if (t.minCenter > 3.4) this.bad('rightCut', '우회전은 크게! 교차로 중앙까지 진출한 뒤 맞은편 차량 보내고 회전', 5);
      else this.good('rightBig', '우회전 크게 OK — 중앙 진출 후 회전');
    } else if (mv === 'S' && !correctSide) this.bad('lane', '교차로 통과 후 반대 차로! 왼쪽 차로 유지', 10);
  }

  // ── 좌측통행 · 중앙선 · 우측 가게 진입 ──
  lane(dt, car, h, speed) {
    const nearNode = NODES.some(n => Math.abs(car.x - n.x) < 9.5 && Math.abs(car.z - n.z) < 9.5);
    let road = null, off = 0;
    for (const g of [-90, 0, 90]) {
      if (Math.abs(car.x - g) <= HALF_ROAD && (h === 'N' || h === 'S')) { road = 'x' + g; off = car.x - g; }
      if (Math.abs(car.z - g) <= HALF_ROAD && (h === 'E' || h === 'W')) { road = 'z' + g; off = car.z - g; }
    }
    const inKonbiniEntry = road === 'z0' && car.x > KONBINI_ENTRY.minX && car.x < KONBINI_ENTRY.maxX;
    // 우측 가게(편의점) 진입: 중앙선 횡단 순간 판정
    if (inKonbiniEntry) {
      if (this.shopArmed && this.lastOff !== undefined && this.lastOff <= 0 && off > 0 && h === 'E') {
        this.shopArmed = false;
        if (car.signal !== 'R') this.bad('shopSig', '깜빡이 없이 중앙선 횡단! 우측 가게 진입은 깜빡이 켜고 반대차선 확인 후', 5);
        else {
          const oncoming = this.traffic.cars.some(o => o.z > 0 && o.z < 3.5 && o.x > car.x && o.x < car.x + 30 && o.v > 0.3 && o.heading === 'W');
          if (oncoming) this.bad('shopOnc', '반대방향 차량 확인! 맞은편 차가 지나간 뒤에 넘어가세요', 10);
          else { this.info('shopOk', '우측 가게 진입: 깜빡이 + 반대차선 확인 OK — 편의점 주차장으로'); this.shopPending = 12; }
        }
      }
      this.lastOff = off;
    } else { this.lastOff = road === 'z0' ? off : undefined; if (car.x < 20 || car.x > 60) this.shopArmed = true; }
    if (this.shopPending > 0) { this.shopPending -= dt; if (inZone(car.x, car.z, ZONES.konbini)) { this.shopPending = 0; this.good('shopRight', '편의점 진입 완료 — 우측 가게는 중앙선을 넘어 바로 진입 가능'); } }

    // 차로 위치
    if (road && !nearNode && !(inKonbiniEntry && car.signal === 'R')) {
      const correct = (h === 'N' || h === 'E') ? off < 0 : off > 0;
      if (!correct && speed > 0.5) this.wrongLaneT += dt; else this.wrongLaneT = Math.max(0, this.wrongLaneT - dt * 2);
      if (this.wrongLaneT > 2.0) { this.bad('lane', '좌측통행! 중앙선 오른쪽(반대 차로)을 달리고 있어요 — 일본은 왼쪽 차로', 10, 8); this.wrongLaneT = 0; this.cleanDist = 0; }
      if (correct) { this.cleanDist += speed * dt; if (this.cleanDist > 250) this.good('lane', '좌측통행 250m 무위반 주행 OK'); }
    }
    // 노면 이탈 (인도)
    if (!onRoad(car.x, car.z) && !anyZone(car.x, car.z)) {
      this.offRoadT += dt;
      if (this.offRoadT > 1.0 && speed > 0.5) { this.bad('off', '인도 침범! 왼쪽 차폭감에 주의하세요', 3, 6); this.offRoadT = 0; }
    } else this.offRoadT = 0;
  }

  // ── 보행자 우선 ──
  pedestrians(dt, car, d, l, speed) {
    const front = car.local(0, -2.45);
    for (const p of this.traffic.peds) {
      if (!p.crossing) continue;
      const key = `${p.node.id}:${p.segs[p.idx].side}:${Math.floor(p.t)}`;
      const r = p.rect;
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      const rx = cx - car.x, rz = cz - car.z;
      const a = rx * d.x + rz * d.z, lat = Math.abs(rx * l.x + rz * l.z);
      if (inRect(front.x, front.z, r, 0.4) && speed > 0.8) {
        const ek = p.node.id + p.segs[p.idx].side + p.idx;
        if (!this.pedEpisodes.has('bad' + ek)) { this.pedEpisodes.add('bad' + ek); this.bad('ped', '보행자 우선! 횡단보도에 사람이 있으면 반드시 정지', 15, 1); }
      } else if (a > 2 && a < 13 && lat < 4 && speed < 0.3) {
        const ek = p.node.id + p.segs[p.idx].side + p.idx;
        if (!this.pedEpisodes.has('good' + ek)) { this.pedEpisodes.add('good' + ek); this.good('ped', '보행자 양보 OK — 손 인사도 잘 통해요'); }
      }
    }
    if (this.pedEpisodes.size > 200) this.pedEpisodes.clear();
  }

  // ── 주차 / 정차 ──
  parking(dt, car, speed) {
    const zone = anyZone(car.x, car.z);
    if (car.gear === 'P') {
      if (zone && zone.parking) { if (this.parkedZone !== zone) { this.parkedZone = zone; this.good('park', `${zone.name}에 주차 OK — 일본은 반드시 지정 주차장 이용`); } }
      else if (onRoad(car.x, car.z)) { this.parkT += dt; if (this.parkT > 3) { this.bad('park', '노상 주차 금지! 대로변 정차·주차 대신 지정/코인 주차장을 이용하세요', 5, 15); this.parkT = 0; } }
    } else { this.parkT = 0; if (!zone) this.parkedZone = null; }
    const nearNode = NODES.some(n => Math.abs(car.x - n.x) < 22 && Math.abs(car.z - n.z) < 22);
    if (speed < 0.1 && onRoad(car.x, car.z) && !nearNode && car.gear !== 'P') { this.stillT += dt; if (this.stillT > 25) { this.info('still', '대로변 정차는 최소한으로 — 사람만 내리고 바로 움직이세요', 30); this.stillT = 0; } }
    else this.stillT = 0;
  }

  // ── 편의점 앞 급정거 차량과의 거리 ──
  gap(dt, car) {
    const k = this.traffic.konbini; if (!k || k.mode !== 'cruise' || k.signal !== 'R') return;
    const behind = car.x < k.x - 2 && car.x > k.x - 30 && Math.abs(car.z + 1.6) < 2.5 && quantizeHeading(car.phi) === 'E';
    if (behind && k.v < 0.3 && Math.abs(car.v) < 0.3 && (k.x - car.x) > 6) this.good('gap', '앞차 급정거(우회전 대기) 뒤 안전 정지 OK — 너무 붙어 달리지 마세요');
  }
}
