import * as THREE from 'three';
import { GRID, ROAD_END, HALF_ROAD, SIDEWALK_W, STOP_LINE, DIRS, NODES, ZONES, leftVec, headingOf } from './config.js';
import { stopSignTexture, stopRoadTexture, noUturnTexture, konbiniSignTexture, parkingSignTexture, textBoardTexture, arrowLampTexture, noParkingTexture } from './signs.js';

const M = {
  road: new THREE.MeshLambertMaterial({ color: 0x3b3b40 }),
  pave: new THREE.MeshLambertMaterial({ color: 0xb9b6ad }),
  lot: new THREE.MeshLambertMaterial({ color: 0x8e8d8a }),
  white: new THREE.MeshBasicMaterial({ color: 0xf0f0ec }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xf2c43c }),
  pole: new THREE.MeshLambertMaterial({ color: 0x8b8f93 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2a2d31 }),
  grass: new THREE.MeshLambertMaterial({ color: 0x7ea25c }),
  barrier: new THREE.MeshLambertMaterial({ color: 0xe0b530 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2e }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x3f8a3f }),
  wall: new THREE.MeshLambertMaterial({ color: 0xd6d3cc }),
};

// 바닥에 눕힌 평면: 가로 w, 세로 l, yaw(라디안, 텍스처 위쪽이 가리키는 방향)
function flat(w, l, x, z, y, mat, yaw = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}
function box(w, h, d, x, y, z, mat, yaw = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = yaw;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function aabb(cx, cz, w, d, name = '') { return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, name }; }

// 간단한 시드 난수
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function buildWorld(scene) {
  const colliders = [];
  const root = new THREE.Group(); scene.add(root);

  // 잔디 바닥
  root.add(flat(700, 700, 0, 0, -0.03, M.grass));

  // 블록 포장 (인도 포함). 도로 사이 영역 전체
  const bounds = [-160, ...GRID.flatMap(g => [g - HALF_ROAD, g + HALF_ROAD]), 160];
  for (let i = 0; i < bounds.length; i += 2) {
    for (let j = 0; j < bounds.length; j += 2) {
      const x0 = bounds[i], x1 = bounds[i + 1], z0 = bounds[j], z1 = bounds[j + 1];
      root.add(flat(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, 0.0, M.pave));
    }
  }

  // 도로면: 남북 도로는 통으로, 동서 도로는 교차로를 피해 구간별로
  for (const g of GRID) root.add(flat(HALF_ROAD * 2, ROAD_END * 2, g, 0, 0.004, M.road));
  const segs = [[-ROAD_END, GRID[0] - HALF_ROAD], [GRID[0] + HALF_ROAD, GRID[1] - HALF_ROAD], [GRID[1] + HALF_ROAD, GRID[2] - HALF_ROAD], [GRID[2] + HALF_ROAD, ROAD_END]];
  for (const g of GRID) for (const [a, b] of segs) root.add(flat(b - a, HALF_ROAD * 2, (a + b) / 2, g, 0.004, M.road));

  // 차선: 중앙선(황색 실선) + 외측선(백색), 정지선 사이 구간
  const lineRanges = [[-ROAD_END, GRID[0] - STOP_LINE], [GRID[0] + STOP_LINE, GRID[1] - STOP_LINE], [GRID[1] + STOP_LINE, GRID[2] - STOP_LINE], [GRID[2] + STOP_LINE, ROAD_END]];
  for (const g of GRID) for (const [a, b] of lineRanges) {
    const len = b - a, c = (a + b) / 2;
    root.add(flat(0.15, len, g, c, 0.012, M.yellow));
    root.add(flat(0.12, len, g - 3.05, c, 0.012, M.white));
    root.add(flat(0.12, len, g + 3.05, c, 0.012, M.white));
    root.add(flat(len, 0.15, c, g, 0.012, M.yellow));
    root.add(flat(len, 0.12, c, g - 3.05, 0.012, M.white));
    root.add(flat(len, 0.12, c, g + 3.05, 0.012, M.white));
  }

  const stopSignTex = stopSignTexture(), stopRoadTex = stopRoadTexture(), noUTex = noUturnTexture();
  const arrowTex = { L: arrowLampTexture('L'), S: arrowLampTexture('S'), R: arrowLampTexture('R') };

  // 교차로별: 횡단보도 · 정지선 · 신호등 · 표지판
  for (const n of NODES) {
    n.lights = {};
    for (const d of ['N', 'E', 'S', 'W']) {
      const dir = DIRS[d], left = leftVec(d);
      // 횡단보도 (접근 방향 기준 교차로 앞 5.25m)
      const cwx = n.x - dir.x * 5.25, cwz = n.z - dir.z * 5.25;
      for (let k = -3; k <= 3; k++) {
        const px = cwx + left.x * k * 0.93, pz = cwz + left.z * k * 0.93;
        if (dir.x !== 0) root.add(flat(3, 0.45, px, pz, 0.014, M.white));
        else root.add(flat(0.45, 3, px, pz, 0.014, M.white));
      }
      // 정지선 (접근 차로 반쪽만)
      const sx = n.x - dir.x * STOP_LINE + left.x * 1.625, sz = n.z - dir.z * STOP_LINE + left.z * 1.625;
      if (dir.x !== 0) root.add(flat(0.45, HALF_ROAD, sx, sz, 0.015, M.white));
      else root.add(flat(HALF_ROAD, 0.45, sx, sz, 0.015, M.white));

      if (n.type === 'signal') {
        // 신호등: 건너편 왼쪽 모서리 기둥 + 가로 암 + 가로형 등기구 (좌: 청, 중: 황, 우: 적)
        const cx = n.x + dir.x * (HALF_ROAD + 1.0) + left.x * (HALF_ROAD + 1.0);
        const cz = n.z + dir.z * (HALF_ROAD + 1.0) + left.z * (HALF_ROAD + 1.0);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.6, 10), M.pole);
        pole.position.set(cx, 2.8, cz); pole.castShadow = true; root.add(pole);
        const armLen = 4.6;
        root.add(box(0.12, 0.12, armLen, cx - left.x * armLen / 2, 5.4, cz - left.z * armLen / 2, M.pole, headingOf(d) + Math.PI / 2));
        const g = new THREE.Group();
        g.position.set(cx - left.x * (armLen - 0.4), 5.0, cz - left.z * (armLen - 0.4));
        g.rotation.y = headingOf(d);
        g.add(box(1.35, 0.46, 0.32, 0, 0, 0, M.dark));
        const lamp = (x, y, c) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, y, 0.165); g.add(m); return m; };
        const L = { g: lamp(-0.42, 0, 0x0c3b2a), y: lamp(0, 0, 0x4a3c0a), r: lamp(0.42, 0, 0x3f0c0c), arrows: {} };
        if (n.arrows) {
          g.add(box(1.35, 0.4, 0.32, 0, -0.44, 0, M.dark));
          for (const [k, x] of [['L', -0.42], ['S', 0], ['R', 0.42]]) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: arrowTex[k], transparent: true }));
            m.position.set(x, -0.44, 0.165); m.visible = false; g.add(m); L.arrows[k] = m;
          }
        }
        // 등기구 하단 안내: 교차로명 판
        n.lights[d] = L;
        root.add(g);
        if (n.noUturn) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: noUTex, transparent: true, side: THREE.DoubleSide }));
          s.position.set(cx - left.x * 0.5, 3.4, cz - left.z * 0.5); s.rotation.y = headingOf(d); root.add(s);
        }
      }
      if (n.stopDirs.includes(d)) {
        // 止まれ 표지 (좌측 보도) + 노면 문자 + 두꺼운 정지선
        const px = n.x - dir.x * 9.5 + left.x * (HALF_ROAD + 0.7), pz = n.z - dir.z * 9.5 + left.z * (HALF_ROAD + 0.7);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), M.pole);
        pole.position.set(px, 1.3, pz); root.add(pole);
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: stopSignTex, transparent: true, side: THREE.DoubleSide }));
        s.position.set(px, 2.3, pz); s.rotation.y = headingOf(d); root.add(s);
        const t = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ map: stopRoadTex, transparent: true }));
        t.rotation.set(-Math.PI / 2, headingOf(d), 0, 'YXZ');
        t.position.set(n.x - dir.x * 11.5 + left.x * 1.6, 0.016, n.z - dir.z * 11.5 + left.z * 1.6);
        root.add(t);
      }
    }
  }

  // 도로 끝 바리케이드
  for (const g of GRID) {
    for (const [x, z, yaw] of [[g, -ROAD_END, 0], [g, ROAD_END, 0], [-ROAD_END, g, Math.PI / 2], [ROAD_END, g, Math.PI / 2]]) {
      const b = box(6.5, 1.0, 0.4, x, 0.5, z, M.barrier, yaw); root.add(b);
      colliders.push(yaw === 0 ? aabb(x, z, 6.5, 0.4, '바리케이드') : aabb(x, z, 0.4, 6.5, '바리케이드'));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ map: textBoardTexture(['行き止まり'], '#e0b530', '#222'), side: THREE.DoubleSide }));
      sign.position.set(x, 1.6, z); sign.rotation.y = yaw; root.add(sign);
    }
  }

  // 편의점 (z=0 도로 남측, x≈45) — 우측 가게 진입 연습용
  {
    const z = ZONES.konbini;
    root.add(flat(z.maxX - z.minX, z.maxZ - z.minZ, (z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2, 0.006, M.lot));
    for (let i = 0; i < 5; i++) root.add(flat(0.12, 5, 37.5 + i * 3.75, 13.4, 0.013, M.white));
    const b = box(18, 4.2, 10, 45, 2.1, 21, M.wall); root.add(b); colliders.push(aabb(45, 21, 18, 10, '편의점 건물'));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: konbiniSignTexture() }));
    sign.position.set(45, 5.2, 15.9); sign.rotation.y = Math.PI; root.add(sign);
    // 진입로 양쪽 경계석
    colliders.push(aabb(37.5, 4.5, 3, 2.4, '연석'), aabb(52.5, 4.5, 3, 2.4, '연석'));
    root.add(box(3, 0.25, 2.4, 37.5, 0.12, 4.5, M.pave), box(3, 0.25, 2.4, 52.5, 0.12, 4.5, M.pave));
  }
  // 지정 주차장 (x=0 도로 동측, z 26..56)
  {
    const z = ZONES.parking;
    root.add(flat(z.maxX - z.minX, z.maxZ - z.minZ, (z.minX + z.maxX) / 2, (z.minZ + z.maxZ) / 2, 0.006, M.lot));
    for (let i = 0; i <= 8; i++) root.add(flat(5, 0.12, 21.5, 28 + i * 3.2, 0.013, M.white));
    // 담장 (입구 z 34..48 제외)
    const walls = [
      [14.6, 26.2, 22.7, 0.4], [14.6, 55.8, 22.7, 0.4], [25.8, 41, 0.4, 30],
      [3.6, 30, 0.4, 8], [3.6, 52, 0.4, 8],
    ];
    for (const [x, zz, w, d] of walls) { root.add(box(w, 0.7, d, x, 0.35, zz, M.wall)); colliders.push(aabb(x, zz, w, d, '주차장 담장')); }
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8), M.pole); sp.position.set(4.2, 1.6, 33); root.add(sp);
    const ps = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshBasicMaterial({ map: parkingSignTexture(), side: THREE.DoubleSide }));
    ps.position.set(4.2, 3.0, 33); ps.rotation.y = -Math.PI / 2; root.add(ps);
  }
  // 노상 주정차 금지 표지 몇 개 (z=0 도로 북측 · x=0 도로 서측)
  {
    const npTex = noParkingTexture();
    for (const [x, z, yaw] of [[-40, -4.2, 0], [-4.2, -45, Math.PI / 2], [120, -4.2, 0]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), M.pole); p.position.set(x, 1.4, z); root.add(p);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: npTex, side: THREE.DoubleSide }));
      s.position.set(x, 2.5, z); s.rotation.y = yaw; root.add(s);
    }
  }

  // 건물 생성 (블록별 셀 분할, 시드 난수)
  const rand = rng(20261105);
  const palette = [0xcfc8bd, 0xe4ded3, 0xa8b5bf, 0xd9b8a1, 0xbfc9b0, 0x9aa3ad, 0xe8d9c3, 0xc2b3a6];
  const excl = [{ minX: 32, maxX: 58, minZ: 3, maxZ: 30 }, { minX: 3, maxX: 30, minZ: 22, maxZ: 60 }];
  const bx = [[-160, GRID[0] - HALF_ROAD], [GRID[0] + HALF_ROAD, GRID[1] - HALF_ROAD], [GRID[1] + HALF_ROAD, GRID[2] - HALF_ROAD], [GRID[2] + HALF_ROAD, 160]];
  for (const [x0, x1] of bx) for (const [z0, z1] of bx) {
    const ix0 = x0 + SIDEWALK_W + 1, ix1 = x1 - SIDEWALK_W - 1, iz0 = z0 + SIDEWALK_W + 1, iz1 = z1 - SIDEWALK_W - 1;
    const cols = Math.max(1, Math.floor((ix1 - ix0) / 15)), rows = Math.max(1, Math.floor((iz1 - iz0) / 15));
    const cw = (ix1 - ix0) / cols, ch = (iz1 - iz0) / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const cx = ix0 + (c + 0.5) * cw, cz = iz0 + (r + 0.5) * ch;
      if (Math.abs(cx) > 150 || Math.abs(cz) > 150) continue;
      if (excl.some(e => cx > e.minX && cx < e.maxX && cz > e.minZ && cz < e.maxZ)) continue;
      const p = rand();
      if (p < 0.2) { // 나무
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.2, 6), M.trunk); t.position.set(cx, 1.1, cz); root.add(t);
        const l = new THREE.Mesh(new THREE.SphereGeometry(1.8 + rand(), 8, 6), M.leaf); l.position.set(cx, 3.4, cz); l.castShadow = true; root.add(l);
        continue;
      }
      if (p < 0.32) continue; // 공터
      const w = Math.min(cw - 3, 7 + rand() * 6), d = Math.min(ch - 3, 7 + rand() * 6);
      const h = 3.5 + rand() * (p > 0.85 ? 16 : 7);
      const mat = new THREE.MeshLambertMaterial({ color: palette[Math.floor(rand() * palette.length)] });
      root.add(box(w, h, d, cx, h / 2, cz, mat));
      colliders.push(aabb(cx, cz, w, d, '건물'));
      if (h > 6) { const roof = box(w * 0.6, 0.8, d * 0.6, cx, h + 0.4, cz, M.dark); root.add(roof); }
    }
  }
  return { colliders, root };
}
