// 도로망 · 치수 상수 (단위: m). 좌표계: x = 동, z = 남, y = 위.
export const GRID = [-90, 0, 90];      // 남북/동서 도로 중심선 위치
export const ROAD_END = 150;           // 도로 끝 (막다른 길)
export const HALF_ROAD = 3.25;         // 도로 반폭 (편도 1차로 × 2)
export const LANE = 1.6;               // 차로 중심의 중앙선 기준 오프셋
export const SIDEWALK_W = 2.5;
export const CROSSWALK_NEAR = 3.75;    // 교차로 중심에서 횡단보도 시작
export const CROSSWALK_FAR = 6.75;     // 횡단보도 끝
export const STOP_LINE = 7.5;          // 정지선 위치

export const DIRS = { N: { x: 0, z: -1 }, E: { x: 1, z: 0 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 } };
export const LEFT_OF = { N: 'W', E: 'N', S: 'E', W: 'S' };
export const RIGHT_OF = { N: 'E', E: 'S', S: 'W', W: 'N' };
export const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const AXIS = { N: 'NS', S: 'NS', E: 'EW', W: 'EW' };

// 진행방향 기준 왼쪽 단위벡터
export function leftVec(d) { return DIRS[LEFT_OF[d]]; }

// 교차로 노드 정의
export const NODES = [];
const nodeMap = new Map();
for (let iz = 0; iz < 3; iz++) {
  for (let ix = 0; ix < 3; ix++) {
    const x = GRID[ix], z = GRID[iz];
    const n = { id: `${ix},${iz}`, x, z, ix, iz, type: 'signal', arrows: false, stopDirs: [], noUturn: false, end: false };
    if (ix === 1 && iz === 1) n.arrows = true;                 // 도심형 화살표 신호
    const corner = (ix !== 1 && iz !== 1);
    if (corner) {
      n.type = 'stop';
      // 止まれ 표지가 있는 접근 방향 (차량 진행 방향 기준)
      n.stopDirs = ((ix === 0 && iz === 0) || (ix === 2 && iz === 2)) ? ['N', 'S'] : ['E', 'W'];
    }
    if (ix === 2 && iz === 1) n.noUturn = true;
    NODES.push(n); nodeMap.set(n.id, n);
  }
}
// 막다른 끝 노드 (AI는 가지 않음)
export const END_NODES = [];
for (const g of GRID) {
  for (const [x, z, id] of [[g, -ROAD_END, `x${g}:N`], [g, ROAD_END, `x${g}:S`], [-ROAD_END, g, `z${g}:W`], [ROAD_END, g, `z${g}:E`]]) {
    const n = { id, x, z, type: 'end', end: true, stopDirs: [], arrows: false, noUturn: false };
    END_NODES.push(n); nodeMap.set(id, n);
  }
}
export const ALL_NODES = [...NODES, ...END_NODES];

// 노드에서 방향 d로 갔을 때 다음 노드
export function neighbor(node, d) {
  const dir = DIRS[d];
  let best = null, bestDist = Infinity;
  for (const n of ALL_NODES) {
    if (n === node) continue;
    const dx = n.x - node.x, dz = n.z - node.z;
    if (dir.x !== 0 && dz === 0 && Math.sign(dx) === dir.x) { const dd = Math.abs(dx); if (dd < bestDist) { bestDist = dd; best = n; } }
    if (dir.z !== 0 && dx === 0 && Math.sign(dz) === dir.z) { const dd = Math.abs(dz); if (dd < bestDist) { bestDist = dd; best = n; } }
  }
  return best;
}

// 주차 가능 구역 / 노면 외 허용 구역 (AABB)
export const ZONES = {
  konbini: { name: '편의점 주차장', minX: 36, maxX: 54, minZ: HALF_ROAD, maxZ: 16, parking: true },
  parking: { name: '지정 주차장', minX: HALF_ROAD, maxX: 26, minZ: 26, maxZ: 56, parking: true },
};
// 우측 가게 진입 허용 구간 (중앙선 횡단 허용) — 동쪽으로 달리는 z=0 도로, 편의점 앞
export const KONBINI_ENTRY = { road: 'z0', minX: 28, maxX: 54 };

// 점 (x,z)가 도로 위인지
export function onRoad(x, z) {
  for (const g of GRID) {
    if (Math.abs(x - g) <= HALF_ROAD && Math.abs(z) <= ROAD_END) return true;
    if (Math.abs(z - g) <= HALF_ROAD && Math.abs(x) <= ROAD_END) return true;
  }
  return false;
}
export function inZone(x, z, zone) { return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ; }
export function anyZone(x, z) { for (const k in ZONES) if (inZone(x, z, ZONES[k])) return ZONES[k]; return null; }

// 헤딩(φ, 좌회전 양수, 0 = 북) → 4방향 양자화
export function quantizeHeading(phi) {
  const fx = -Math.sin(phi), fz = -Math.cos(phi);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 'E' : 'W';
  return fz < 0 ? 'N' : 'S';
}
export function headingOf(d) { return { N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 }[d]; }
