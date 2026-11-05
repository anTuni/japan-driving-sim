import * as THREE from 'three';
import './style.css';
import { buildWorld } from './world.js';
import { PlayerCar } from './vehicle.js';
import { Input } from './input.js';
import { Traffic } from './traffic.js';
import { Rules, CHECKLIST } from './rules.js';
import { UI } from './ui.js';
import { Mission } from './mission.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { NODES, DIRS, leftVec, quantizeHeading, headingOf } from './config.js';

const canvas = document.getElementById('c');
const MOBILE = isTouchDevice();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE || window.devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfdcf5);
scene.fog = new THREE.Fog(0xbfdcf5, MOBILE ? 90 : 120, MOBILE ? 240 : 320);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6a7a55, 0.75));
const sun = new THREE.DirectionalLight(0xfff3dc, 1.6);
sun.castShadow = true; sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 300;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

const world = buildWorld(scene);
const car = new PlayerCar(scene);
const START = { x: -132, z: -1.6, phi: headingOf('E') };
car.reset(START.x, START.z, START.phi);
const traffic = new Traffic(scene);
const input = new Input();
let camMode = 'third';

const ui = new UI({
  onGear: (g) => { const r = car.setGear(g); if (!r.ok) ui.toast(r.msg, 'info'); },
  onCamera: () => { camMode = camMode === 'third' ? 'first' : 'third'; },
  onReset: () => { car.reset(START.x, START.z, START.phi); ui.toast(mission.running ? '출발 지점으로 복귀 (미션 시간은 계속 흐릅니다)' : '출발 지점으로 복귀', 'info'); },
  onSignal: (d) => car.setSignal(d),
  onWiper: () => toggleWiper(),
  onStart: () => canvas.focus(),
  onMission: (d) => mission.start(d),
}, CHECKLIST);
const rules = new Rules(traffic, ui);
const mission = new Mission(scene, car, rules, ui, START);
let touch = null;
if (MOBILE) {
  touch = new TouchControls(input, {
    onSignal: (d) => car.setSignal(d), onCamera: () => { camMode = camMode === 'third' ? 'first' : 'third'; }, onWiper: () => toggleWiper(),
    onHelp: () => ui.toggleRules(), onChecklist: () => ui.toggleChecklist(), onRank: () => ui.toggleRank(),
    onGear: (g) => { const r = car.setGear(g); if (!r.ok) ui.toast(r.msg, 'info'); }, onToast: (m) => ui.toast(m, 'info'),
  });
  ui.touch = touch;
  const hint = document.querySelector('#rotate-hint');
  const checkOrient = () => hint.classList.toggle('hidden', window.innerWidth >= window.innerHeight || window.innerWidth > 900);
  checkOrient(); window.addEventListener('resize', checkOrient); window.addEventListener('orientationchange', () => setTimeout(checkOrient, 150));
  document.addEventListener('contextmenu', e => e.preventDefault());
}
window.__sim = { car, traffic, rules, ui, NODES, mission };

function toggleWiper() {
  car.wiper = !car.wiper;
  if (car.wiper) ui.toast('와이퍼 ON — 일본차는 왼쪽 레버가 와이퍼, 오른쪽 레버가 깜빡이! 당황하지 말고 반대쪽(Q/E)을 조작하세요', 'info');
}

function handleKeys() {
  for (const k of input.consumePressed()) {
    if (mission.handleKey(k)) continue;
    if (k === 'Enter' && ui.paused) { ui.hideOverlay(); if (!ui.rulesPanel.classList.contains('hidden')) ui.toggleRules(); continue; }
    if (k === 'Escape' && !ui.rankModal.classList.contains('hidden')) { ui.toggleRank(); continue; }
    if (k === 'r' && ui.overlay.classList.contains('hidden')) { ui.toggleRank(); continue; }
    if (k === 'Escape' || k === 'h') { ui.toggleRules(); continue; }
    if (ui.paused) continue;
    if (k === 'q') car.setSignal('L');
    else if (k === 'e') car.setSignal('R');
    else if (k === 'x') toggleWiper();
    else if (k === 'c') camMode = camMode === 'third' ? 'first' : 'third';
    else if (k === 't') ui.toggleChecklist();
    else if (k === 'Backspace') { car.reset(START.x, START.z, START.phi); ui.toast('출발 지점으로 복귀', 'info'); }
    else if (['1', '2', '3', '4'].includes(k)) { const r = car.setGear(['P', 'R', 'N', 'D'][+k - 1]); if (!r.ok) ui.toast(r.msg, 'info'); }
  }
}

// 전방 신호 정보 (HUD)
function lightAhead() {
  const h = quantizeHeading(car.phi), d = DIRS[h], l = leftVec(h);
  let best = null, bd = Infinity;
  for (const n of NODES) {
    const rx = n.x - car.x, rz = n.z - car.z, a = rx * d.x + rz * d.z, lat = Math.abs(rx * l.x + rz * l.z);
    if (lat < 5 && a > -3 && a < bd) { bd = a; best = n; }
  }
  if (!best || best.type !== 'signal' || bd > 80) return null;
  const st = traffic.signals.stateFor(best, h);
  return { color: st.color, arrows: st.arrows, dist: Math.max(0, bd - 7.5) };
}

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const f = car.forward;
  if (camMode === 'first') {
    tmp.set(0.45, 1.42, -0.25); car.mesh.localToWorld(tmp);
    camera.position.copy(tmp);
    const lookDir = car.v < -0.5 ? -1 : 1;
    camLook.set(tmp.x + f.x * 30 * lookDir - Math.cos(car.phi) * car.steer * 6, 1.25, tmp.z + f.z * 30 * lookDir + Math.sin(car.phi) * car.steer * 6);
    camera.lookAt(camLook);
    camInit = false;
  } else {
    const back = 9.5 + Math.abs(car.v) * 0.15;
    tmp.set(car.x - f.x * back, 4.2, car.z - f.z * back);
    if (!camInit) { camPos.copy(tmp); camInit = true; }
    camPos.lerp(tmp, 1 - Math.exp(-5 * dt));
    camera.position.copy(camPos);
    camera.lookAt(car.x + f.x * 4, 1.0, car.z + f.z * 4);
  }
  sun.position.set(car.x + 60, 110, car.z + 40); sun.target.position.set(car.x, 0, car.z);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  handleKeys();
  if (touch) touch.update(dt);
  if (!ui.paused) {
    const events = car.update(dt, input, world.colliders, traffic.cars);
    traffic.update(dt, car);
    rules.update(dt, car, events);
    mission.update(dt);
  }
  updateCamera(dt);
  ui.update(car, traffic, rules, camMode, lightAhead());
  renderer.render(scene, camera);
}
loop();

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
