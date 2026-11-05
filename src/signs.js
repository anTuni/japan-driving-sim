import * as THREE from 'three';

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// 止まれ 역삼각형 표지
export function stopSignTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#d9281c';
  g.beginPath(); g.moveTo(12, 24); g.lineTo(244, 24); g.lineTo(128, 236); g.closePath(); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(28, 36); g.lineTo(228, 36); g.lineTo(128, 216); g.closePath(); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 54px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('止まれ', 128, 92);
  g.font = 'bold 22px sans-serif'; g.fillText('STOP', 128, 140);
  return tex(c);
}
// 노면 止まれ 문자
export function stopRoadTexture() {
  const c = makeCanvas(256, 512), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  g.fillStyle = '#f2f2f2'; g.font = 'bold 150px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = ['止', 'ま', 'れ'];
  chars.forEach((ch, i) => g.fillText(ch, 128, 90 + i * 165));
  return tex(c);
}
// 유턴 금지
export function noUturnTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#1b4fbf'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 16; g.lineCap = 'round';
  g.beginPath(); g.moveTo(88, 200); g.lineTo(88, 100); g.arc(128, 100, 40, Math.PI, 0); g.lineTo(168, 150); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(140, 150); g.lineTo(196, 150); g.lineTo(168, 190); g.closePath(); g.fill();
  g.strokeStyle = '#d9281c'; g.lineWidth = 18; g.beginPath(); g.moveTo(40, 40); g.lineTo(216, 216); g.stroke();
  g.strokeStyle = '#d9281c'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  return tex(c);
}
// 편의점 간판
export function konbiniSignTexture() {
  const c = makeCanvas(1024, 256), g = c.getContext('2d');
  g.fillStyle = '#1e7f4f'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#f7f7f7'; g.fillRect(0, 96, 1024, 64);
  g.fillStyle = '#e8453c'; g.fillRect(0, 160, 1024, 40);
  g.fillStyle = '#fff'; g.font = 'bold 80px "Hiragino Sans", "Noto Sans JP", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('コンビニ', 512, 54);
  g.fillStyle = '#222'; g.font = 'bold 40px sans-serif'; g.fillText('24h  CONVENIENCE STORE', 512, 128);
  return tex(c);
}
// 주차장 P 표지
export function parkingSignTexture() {
  const c = makeCanvas(256, 320), g = c.getContext('2d');
  g.fillStyle = '#1b4fbf'; g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#fff'; g.font = 'bold 170px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('P', 128, 120);
  g.font = 'bold 44px "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText('駐車場', 128, 262);
  return tex(c);
}
// 주정차 금지 (노상)
export function noParkingTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#1b4fbf'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9281c'; g.lineWidth = 16;
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(50, 50); g.lineTo(206, 206); g.stroke();
  g.beginPath(); g.moveTo(206, 50); g.lineTo(50, 206); g.stroke();
  return tex(c);
}
// 도로 이름 / 안내 간판 (텍스트)
export function textBoardTexture(lines, bg = '#2b2b2b', fg = '#fff', w = 512, h = 256) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = Math.min(h / (lines.length + 0.6), w / 9);
  g.font = `bold ${size}px "Hiragino Sans", "Noto Sans JP", "Apple SD Gothic Neo", sans-serif`;
  lines.forEach((l, i) => g.fillText(l, w / 2, (i + 0.5) * (h / lines.length)));
  return tex(c);
}
// 신호 화살표 램프 (방향: 'L' | 'S' | 'R')
export function arrowLampTexture(dir) {
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.translate(64, 64);
  if (dir === 'L') g.rotate(-Math.PI / 2);
  if (dir === 'R') g.rotate(Math.PI / 2);
  g.fillStyle = '#22e07a';
  g.beginPath(); g.moveTo(0, -48); g.lineTo(40, 4); g.lineTo(14, 4); g.lineTo(14, 48); g.lineTo(-14, 48); g.lineTo(-14, 4); g.lineTo(-40, 4); g.closePath(); g.fill();
  return tex(c);
}
