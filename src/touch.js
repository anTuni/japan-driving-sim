// 모바일 터치 조작: 왼쪽 드래그 핸들(또는 기울이기), 오른쪽 브레이크/엑셀 페달, 기어 D/R, 깜빡이
const WHEEL_MAX = 110;   // 핸들 최대 회전(°) = 풀락
const TILT_FULL = 22;    // 기울기 °에서 풀락
const TILT_DEAD = 2.5;

export function isTouchDevice() {
  return new URLSearchParams(location.search).has('touch') || (matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);
}

export class TouchControls {
  constructor(input, handlers) {
    this.input = input; this.h = handlers;
    this.wheelAngle = 0; this.grab = null; this.tilt = { on: false, zero: 0, raw: 0 };
    document.body.classList.add('is-touch');
    this.root = document.querySelector('#touch');
    this.root.classList.remove('hidden');
    this.wheelEl = this.root.querySelector('.t-wheel');
    this.bindWheel(); this.bindPedals(); this.bindButtons(); this.bindTilt();
  }

  // ── 핸들: 잡은 지점 기준 상대 회전, 놓으면 스프링 복귀 ──
  bindWheel() {
    const el = this.wheelEl;
    const angleOf = (e) => { const r = el.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); this.grab = { id: e.pointerId, a0: angleOf(e), base: this.wheelAngle }; });
    el.addEventListener('pointermove', e => {
      if (!this.grab || e.pointerId !== this.grab.id) return;
      let d = angleOf(e) - this.grab.a0; while (d > 180) d -= 360; while (d < -180) d += 360;
      this.grab.a0 = angleOf(e); this.grab.base = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, this.grab.base + d));
      this.wheelAngle = this.grab.base;
    });
    const release = e => { if (this.grab && e.pointerId === this.grab.id) this.grab = null; };
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  }
  // ── 페달: 누르는 동안만 ──
  bindPedals() {
    for (const [sel, key] of [['.t-gas', 'throttle'], ['.t-brake', 'brake']]) {
      const el = this.root.querySelector(sel);
      const on = e => { e.preventDefault(); el.setPointerCapture(e.pointerId); this.input.touch[key] = true; el.classList.add('down'); };
      const off = () => { this.input.touch[key] = false; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    }
  }
  bindButtons() {
    const q = s => this.root.querySelector(s);
    q('.t-sig-l').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onSignal('L'); });
    q('.t-sig-r').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onSignal('R'); });
    q('.t-cam').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onCamera(); });
    q('.t-wiper').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onWiper(); });
    q('.t-help').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onHelp(); });
    q('.t-check').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onChecklist(); });
    q('.t-rank').addEventListener('pointerdown', e => { e.preventDefault(); this.h.onRank(); });
    this.root.querySelectorAll('.t-gear button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); this.h.onGear(b.dataset.gear); }));
    this.tiltBtn = q('.t-tilt');
    this.tiltBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.toggleTilt(); });
  }
  // ── 기울이기 조향 (iOS는 권한 요청 필요, 사용자 제스처 안에서) ──
  bindTilt() {
    this.onOrient = (e) => {
      if (e.beta == null) return;
      const t = (screen.orientation && screen.orientation.type) || '';
      let raw;
      if (t.startsWith('landscape') || Math.abs(window.orientation || 0) === 90) raw = e.beta * ((t === 'landscape-secondary' || window.orientation === -90) ? -1 : 1);
      else raw = e.gamma;
      this.tilt.raw = raw;
    };
  }
  async toggleTilt() {
    if (this.tilt.on) { this.tilt.on = false; window.removeEventListener('deviceorientation', this.onOrient); this.tiltBtn.classList.remove('on'); this.wheelEl.classList.remove('disabled'); this.h.onToast('기울이기 조향 OFF — 핸들 드래그로 조작'); return; }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { this.h.onToast('기울기 센서 권한이 거부됐어요'); return; }
      }
    } catch { this.h.onToast('기울기 센서를 사용할 수 없어요'); return; }
    window.addEventListener('deviceorientation', this.onOrient);
    this.tilt.on = true; this.tilt.zero = null; this.tiltBtn.classList.add('on'); this.wheelEl.classList.add('disabled');
    this.h.onToast('기울이기 조향 ON — 지금 자세가 중앙. 폰을 핸들처럼 돌리세요');
  }

  update(dt) {
    if (this.tilt.on) {
      if (this.tilt.zero === null && this.tilt.raw !== 0) this.tilt.zero = this.tilt.raw;
      const d = this.tilt.raw - (this.tilt.zero || 0);
      const mag = Math.max(0, Math.abs(d) - TILT_DEAD) / (TILT_FULL - TILT_DEAD);
      const steer = -Math.sign(d) * Math.min(1, mag);
      this.input.touch.steer = steer; this.wheelAngle = -steer * WHEEL_MAX;
    } else {
      if (!this.grab) { const k = 1 - Math.exp(-14 * dt); this.wheelAngle += (0 - this.wheelAngle) * k; if (Math.abs(this.wheelAngle) < 0.3) this.wheelAngle = 0; }
      this.input.touch.steer = -this.wheelAngle / WHEEL_MAX;   // 시계방향(+) = 우회전(−)
    }
    this.wheelEl.style.transform = `rotate(${this.wheelAngle}deg)`;
  }
  setGear(g) { this.root.querySelectorAll('.t-gear button').forEach(b => b.classList.toggle('active', b.dataset.gear === g)); }
  setSignal(sig, on) {
    this.root.querySelector('.t-sig-l').classList.toggle('on', on && sig === 'L'); this.root.querySelector('.t-sig-r').classList.toggle('on', on && sig === 'R');
    this.root.querySelector('.t-sig-l').classList.toggle('armed', sig === 'L'); this.root.querySelector('.t-sig-r').classList.toggle('armed', sig === 'R');
  }
}
