// 키보드 입력: 연속 상태(down) + 단발 이벤트(pressed)
export class Input {
  constructor() {
    this.down = new Set();
    this.pressedQueue = [];
    this.touch = { steer: 0, throttle: false, brake: false };   // 터치 컨트롤이 채움
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = norm(e);
      if (k) { this.down.add(k); this.pressedQueue.push(k); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', e => { const k = norm(e); if (k) this.down.delete(k); });
    window.addEventListener('blur', () => this.down.clear());
  }
  get throttle() { return this.touch.throttle || this.down.has('w') || this.down.has('ArrowUp'); }
  get brake() { return this.touch.brake || this.down.has('s') || this.down.has('ArrowDown') || this.down.has(' '); }
  get left() { return this.down.has('a') || this.down.has('ArrowLeft'); }
  get right() { return this.down.has('d') || this.down.has('ArrowRight'); }
  // 조향 축: 왼쪽 +1 ~ 오른쪽 −1 (키보드 + 터치 합산)
  get steer() { const k = (this.left ? 1 : 0) - (this.right ? 1 : 0); return Math.max(-1, Math.min(1, k + this.touch.steer)); }
  // 이번 프레임에 눌린 키 목록을 반환하고 비움
  consumePressed() { const q = this.pressedQueue; this.pressedQueue = []; return q; }
}
function norm(e) {
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}
