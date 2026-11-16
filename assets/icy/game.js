/* Normal mode from icytower-rs (classic rules, 50Hz).
   Coordinates are the original 640x480 screen. Stone walls sit on both edges. */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.mount();
})(function () {
  const MAX_SPEED = 12.2;
  const START_SPEED = 0; // normal: index 5 of the original start-speed table
  const SPEEDUPS = [1500, 3000, 4500, 6000, 7500, 9000, 10500, 1800000, 9000000];
  const REWARDS = ['Good', 'Sweet', 'Great', 'Super', 'Wow', 'Amazing', 'Extreme', 'Fantastic', 'Splendid', 'No way'];
  /* Side stones: the real wall sprite is 132px, drawn at x=-57 and x=565, so about 75px shows on each edge. */
  const WALL_L = 75;
  const WALL_R = 565;

  const STANDING = 0, RISING = 1, FALLING = 2, IN_AIR = 3;

  function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const dx = x2 - x1, dy = y2 - y1;
    const d = (x3 - x4) * dy + (y4 - y3) * dx;
    const n1 = (y3 - y4) * (x1 - x3) + (x4 - x3) * (y1 - y3);
    const n2 = (y1 - y3) * dx + (y1 - y2) * (x1 - x3);
    if (d === 0) return null;
    const t1 = n1 / d, t2 = n2 / d;
    if (t1 < 0 || t2 < 0 || t1 > 1 || t2 > 1) return null;
    return [Math.trunc(t1 * dx + 0.5) + x1, Math.trunc(t1 * dy + 0.5) + y1];
  }

  function rewardIdx(floors) {
    if (floors <= 6) return 0;
    if (floors <= 14) return 1;
    if (floors <= 24) return 2;
    if (floors <= 34) return 3;
    if (floors <= 49) return 4;
    if (floors <= 69) return 5;
    if (floors <= 99) return 6;
    if (floors <= 139) return 7;
    if (floors <= 199) return 8;
    return 9;
  }

  function Game(seed) {
    this.holdrand = seed >>> 0;
    this.off = 0;
    this.speed = -1;
    this.speedupIdx = 0;
    this.fallCount = 0;
    this.clock = 0;
    this.tickN = 0;
    this.hurryY = 480;
    this.rewardTime = 0;
    this.rewardScale = 0;
    this.rewardIdx = 0;
    this.lastDiff = 0;
    this.over = false;
    this.onFall = null;
    this.rows = Array.from({ length: 32 }, () => ({ empty: true, start: 0, end: 0, level: 0, style: 0 }));
    this.p = {
      x: 200, y: 431, sx: 0.001, sy: 0,
      status: STANDING, rotate: false, angle: 0, edge: 0,
      level: 0, score: 0, inCombo: 0, accLevel: 0, accJumps: 0,
      facingLeft: false, walk: 0, dead: 0, latest: 0,
    };
    for (let i = 0; i < 30; i++) this.addFloor();
  }

  Game.prototype.rand = function () {
    this.holdrand = (Math.imul(this.holdrand, 214013) + 2531011) >>> 0;
    return (this.holdrand >>> 16) & 0x7fff;
  };

  Game.prototype.finalScore = function () {
    return this.p.level * 10 + this.p.score;
  };

  Game.prototype.visibleFloors = function () {
    const out = [];
    const off16 = this.off % 16;
    for (let i = 0; i < 32; i++) {
      const r = this.rows[i];
      if (r.empty) continue;
      out.push({
        n: (r.level - 1) / 5 | 0,
        start: r.start,
        end: r.end,
        y: (29 - i) * 16 + off16,
        style: r.style,
      });
    }
    return out;
  };

  Game.prototype.addFloor = function () {
    for (let i = 0; i < 31; i++) this.rows[i] = this.rows[i + 1];
    const lvl = this.rows[30].level;
    const style = lvl > 4999 ? 10 : (lvl / 500 | 0);
    let row = { empty: true, start: 0, end: 0, level: lvl + 1, style };
    if ((lvl % 250 === 0 && lvl <= 5004) || lvl % 2500 === 0) {
      row = { empty: false, start: 0, end: 40, level: lvl + 1, style };
    } else if (lvl % 5 === 0) {
      const level = lvl + 1;
      let size;
      if (level <= 2999) {
        const r = this.rand();
        const room = (300 - (level / 5 | 0)) / 300 * 10;
        size = 1 > room ? 6 : (r % Math.trunc(room)) + 6;
      } else if (level <= 5004) size = 6;
      else if (level <= 7504) size = 5;
      else if (level <= 10004) size = 4;
      else if (level < 50005) size = 3;
      else size = 2;
      const range = size > 0 ? 30 - size : 29;
      const w = size > 0 ? size : 1;
      const start = this.rand() % range + 5;
      row = { empty: false, start, end: start + w, level: lvl + 1, style };
    }
    this.rows[31] = row;
  };

  Game.prototype.floorData = function (y) {
    const r = (y + 1) >> 4;
    const row = 29 - r;
    if (row < 0 || row >= 32 || this.rows[row].empty) return null;
    const rw = this.rows[row];
    return [r * 16 + (this.off % 16), rw.start * 16 - 2, rw.end * 16 + 17];
  };

  Game.prototype.getLevel = function (y) {
    const row = 29 - ((y + 1) >> 4);
    return row >= 0 && row < 32 ? this.rows[row].level : 0;
  };

  Game.prototype.jump = function () {
    const p = this.p;
    if (p.status !== STANDING) return false;
    p.status = RISING;
    const v = -2 * Math.abs(p.sx);
    p.sy = v < -MAX_SPEED ? v : -MAX_SPEED;
    p.rotate = p.sy < -22;
    p.angle = 0;
    return true;
  };

  Game.prototype.input = function (left, right, jump) {
    const p = this.p;
    if (left) {
      if (p.sx > 0) p.sx *= 0.7;
      p.sx -= 0.3;
    } else if (right) {
      if (p.sx < 0) p.sx *= 0.7;
      p.sx += 0.3;
    } else p.sx *= 0.9;
    if (jump) this.jump();
  };

  Game.prototype.updatePlayer = function () {
    const p = this.p;
    p.sy = Math.max(-100, Math.min(MAX_SPEED, p.sy));
    p.sx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, p.sx));
    p.x += p.sx;
    p.y += p.sy;
    if (p.y > 1000) p.y = 1000;
    if (p.x > 555) { p.x = 555; p.sx *= -0.9; }
    else if (p.x < 85) { p.x = 85; p.sx *= -0.9; }
    if (p.status !== STANDING) {
      p.sy += 0.8;
      if (p.status === RISING && p.sy > 0) p.status = FALLING;
    }
    if (Math.abs(p.sx) > 0.2) p.facingLeft = p.sx < 0;
    p.walk += 0.05 + Math.abs(p.sx) * 0.02;
  };

  Game.prototype.collide = function (oldX, oldY) {
    const p = this.p;
    const yi = p.y | 0;
    const hit = this.floorData(yi) || this.floorData(oldY);
    if (!hit) {
      if (p.status === FALLING || p.status === STANDING) p.status = IN_AIR;
      return;
    }
    const [fy, x1, x2] = hit;
    const xi = p.x | 0;
    const a = lineIntersect(x1, fy, x2, fy, xi - 11, yi + 1, oldX - 11, oldY);
    const b = lineIntersect(x1, fy, x2, fy, xi + 11, yi + 1, oldX + 11, oldY);
    if (!a && !b && (p.status === FALLING || p.status === STANDING)) p.status = IN_AIR;
    p.edge = a && !b ? 1 : b && !a ? 2 : 0;
    if ((!a && !b) || !(p.status === FALLING || p.status === IN_AIR)) return;
    let x;
    if (a && b) {
      if (a[0] < -10000 || b[0] < -10000 || a[0] > 10000 || b[0] > 10000) return;
      x = a[0] + 11;
    } else x = a ? a[0] + 11 : b[0] - 11;
    p.status = STANDING;
    p.sy = 0;
    p.y = fy - 1;
    p.x = x;
    p.rotate = false;
  };

  Game.prototype.tick = function (left, right, jump) {
    if (this.over) return;
    const p = this.p;
    this.tickN++;
    this.fallCount++;
    const oldX = p.x | 0;
    let oldY = p.y | 0;
    this.input(!!left, !!right, !!jump);
    this.updatePlayer();

    const oldOff = this.off;
    let scrolled = 0;
    if (p.y < 160) {
      const y = p.y;
      let k = y < 140 ? 2 : 1;
      for (const [lim, add] of [[120, 1], [100, 1], [80, 1], [60, 1], [40, 2], [20, 2], [0, 3]]) {
        if (y < lim) k += add;
      }
      this.off += k;
      p.y += k;
      oldY += k;
      scrolled = k;
    }
    if (!p.dead) this.clock++;
    if (this.off > 100 && !p.dead) {
      if (this.speed < 0) this.speed = START_SPEED;
      const k = this.speed === 0 ? (this.tickN & 1) : this.speed;
      this.off += k;
      scrolled += k;
      p.y += k;
      oldY += k;
    } else if (this.off <= 100 && !p.dead) {
      this.clock = 0;
      this.fallCount = 0;
    }
    if (((this.hurryY + 99) >>> 0) <= 578) this.hurryY -= 2;
    if (!p.dead && SPEEDUPS[Math.min(this.speedupIdx, 8)] < this.fallCount && this.speed <= 4) {
      this.speedupIdx++;
      this.speed++;
      this.hurryY = 479;
    }
    if (this.speed === 5) {
      this.fallCount -= 45;
      if (!p.dead) this.clock -= 45;
    }
    if (oldOff % 16 > this.off % 16 || scrolled > 15) this.addFloor();
    this.collide(oldX, oldY);

    if (p.rotate) p.angle = (p.angle + 8) % 256;
    if (p.inCombo !== 0) {
      p.inCombo--;
      if (p.inCombo === 0 && p.accJumps > 1) {
        p.score += p.accLevel * p.accLevel;
        p.latest = p.accLevel;
        this.rewardTime = 80;
        this.rewardScale = 0;
        this.rewardIdx = rewardIdx(p.accLevel);
      }
    }
    if (p.status === STANDING) {
      const floor = (this.getLevel(p.y | 0) - 1) / 5 | 0;
      if (floor >= p.level) {
        const diff = floor - p.level;
        if (diff !== this.lastDiff && diff !== 0) this.lastDiff = 0;
        if (diff >= 2) {
          if (p.inCombo !== 0) { p.accLevel += diff; p.accJumps += 1; }
          else { p.accLevel = diff; p.accJumps = 1; }
          p.inCombo = 100;
          this.lastDiff = diff;
        } else if (diff === 1 && p.inCombo !== 0) p.inCombo = 1;
      } else if (p.inCombo !== 0) p.inCombo = 1;
      p.level = floor;
    }
    if (this.rewardTime !== 0) {
      if (this.rewardTime > 60) this.rewardScale += 0.05;
      else if (this.rewardTime <= 9) this.rewardScale -= 0.1;
      this.rewardTime--;
    }
    if (p.y > 540 && !p.dead) {
      p.dead = 1;
      this.over = true;
      if (this.onFall) this.onFall();
    }
  };

  function hash(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function blob(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* Dark blue bricks fill the shaft. The side columns are the lighter stones. */
  function drawShaft(ctx, off) {
    const bw = 64, bh = 32;
    const scroll = ((off * 0.5) % bh + bh) % bh;
    ctx.fillStyle = '#2c315c';
    ctx.fillRect(0, 0, 640, 480);
    for (let y = -bh + scroll; y < 500; y += bh) {
      const row = Math.floor((y + off * 0.5) / bh);
      const stagger = (row & 1) ? bw / 2 : 0;
      for (let x = -bw; x < 660; x += bw) {
        const px = x + stagger;
        const n = hash((px / bw) | 0, row);
        ctx.fillStyle = n > 0.66 ? '#454b82' : n > 0.33 ? '#3a4074' : '#343a6c';
        ctx.fillRect(px + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.fillRect(px + 4, y + 4, bw - 8, 2);
      }
    }
  }

  function drawWall(ctx, x, w, off) {
    const rate = 124 / 84;
    const bh = 62, bw = 34;
    const phase = ((off * rate) % bh + bh) % bh;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, 0, w + 4, 480);
    ctx.clip();
    ctx.fillStyle = '#6a7096';
    ctx.fillRect(x - 2, 0, w + 4, 480);
    const cols = Math.ceil(w / bw) + 1;
    for (let y = -bh + phase; y < 500; y += bh) {
      const row = Math.floor((y + off * rate) / bh);
      for (let col = 0; col < cols; col++) {
        const px = x + col * bw - 6;
        const n = hash(col + (x | 0), row);
        const by = y + 3;
        ctx.fillStyle = n > 0.5 ? '#a7adc8' : '#949ab8';
        blob(ctx, px + 2, by, bw - 6, bh - 8, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        blob(ctx, px + 6, by + 4, bw - 16, 7, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(70,76,110,.4)';
        ctx.beginPath();
        ctx.ellipse(px + 10 + n * 8, by + 24, 4.5, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px + 18, by + 40, 2.4, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x | 0, p.y | 0);
    if (p.edge === 1) ctx.translate(-2, 0);
    if (p.edge === 2) ctx.translate(2, 0);
    if (p.rotate) {
      ctx.translate(0, -16);
      ctx.rotate((p.angle / 256) * Math.PI * 2 * (p.facingLeft ? -1 : 1));
      ctx.translate(0, 16);
    }
    if (p.facingLeft) ctx.scale(-1, 1);
    const air = p.status !== STANDING;
    const bob = !air && Math.abs(p.sx) > 0.2 ? Math.sin(p.walk * 4) * 2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a4a32';
    if (air) {
      ctx.fillRect(-5, -16, 4, 8);
      ctx.fillRect(2, -16, 4, 8);
    } else {
      ctx.fillRect(-5, -14 + bob, 4, 12);
      ctx.fillRect(2, -14 - bob, 4, 12);
    }
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(-6, -4, 5, 4);
    ctx.fillRect(2, -4, 5, 4);
    ctx.fillStyle = '#3dae45';
    ctx.fillRect(-6, -26, 13, 13);
    ctx.fillStyle = '#f0c7a0';
    ctx.fillRect(-4, -32, 9, 7);
    ctx.fillStyle = '#3d6fd4';
    blob(ctx, -6, -40, 13, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(1, -30, 2, 2);
    ctx.restore();
  }

  function drawWorld(ctx, g) {
    drawShaft(ctx, g.off);

    for (const f of g.visibleFloors()) {
      if (f.y < -40 || f.y > 530) continue;
      const x0 = f.start * 16 - 2;
      const w = Math.max(18, (f.end - f.start) * 16 + 14);
      const y = f.y - 18;
      const h = 24;
      ctx.fillStyle = 'rgba(20,24,48,.45)';
      blob(ctx, x0 + 3, y + 5, w, h, 9);
      ctx.fill();
      ctx.fillStyle = '#b7bcd4';
      blob(ctx, x0, y + 4, w, h - 2, 9);
      ctx.fill();
      ctx.fillStyle = '#e7eaf6';
      blob(ctx, x0, y, w, 12, 8);
      ctx.fill();
      ctx.fillStyle = '#f7f8fd';
      for (let sx = x0 + 8; sx < x0 + w - 6; sx += 9) {
        ctx.beginPath();
        ctx.arc(sx, y + 4, 3.4, Math.PI, 0);
        ctx.fill();
      }
      if (f.n > 0 && f.n % 10 === 0) {
        const cx = x0 + w / 2;
        if (cx > WALL_L + 18 && cx < WALL_R - 18) {
          ctx.font = "700 13px ui-monospace, Consolas, monospace";
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(30,34,60,.85)';
          ctx.strokeText(String(f.n), cx, y + 16);
          ctx.fillStyle = '#f7f8fd';
          ctx.fillText(String(f.n), cx, y + 16);
        }
      }
    }

    drawPlayer(ctx, g.p);
    drawWall(ctx, 0, WALL_L, g.off);
    drawWall(ctx, WALL_R, 640 - WALL_R, g.off);

    ctx.save();
    ctx.translate(38, 42);
    ctx.fillStyle = '#e6a31a';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff8ea';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c48412';
    ctx.fillRect(-3, -26, 6, 8);
    const turn = (g.clock % 1500) / 1500;
    ctx.rotate(turn * Math.PI * 2);
    ctx.strokeStyle = '#e23b3b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -11);
    ctx.stroke();
    ctx.restore();

    const meterH = 108;
    const fill = Math.max(0, Math.min(1, g.p.inCombo / 100));
    ctx.fillStyle = '#e6a31a';
    blob(ctx, 20, 74, 24, meterH, 8);
    ctx.fill();
    ctx.fillStyle = '#1a1c24';
    blob(ctx, 24, 78, 16, meterH - 8, 5);
    ctx.fill();
    if (fill > 0) {
      ctx.save();
      ctx.beginPath();
      blob(ctx, 24, 78, 16, meterH - 8, 5);
      ctx.clip();
      ctx.fillStyle = '#f0c14a';
      ctx.fillRect(24, 78 + (meterH - 8) * (1 - fill), 16, (meterH - 8) * fill);
      ctx.restore();
    }
    if (g.p.inCombo) {
      ctx.font = "700 16px ui-monospace, Consolas, monospace";
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(String(g.p.accLevel), 48, 96);
      ctx.fillStyle = '#fff8ea';
      ctx.fillText(String(g.p.accLevel), 48, 96);
    }

    ctx.font = "700 18px ui-monospace, Consolas, monospace";
    ctx.textAlign = 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,24,40,.8)';
    ctx.strokeText('Score: ' + g.finalScore(), 12, 462);
    ctx.fillStyle = '#f4f6fb';
    ctx.fillText('Score: ' + g.finalScore(), 12, 462);

    if (!g.over && ((g.hurryY + 99) >>> 0) <= 578) {
      ctx.font = "26px 'VCR OSD Mono', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText('HURRY UP', 320, g.hurryY);
      ctx.fillStyle = '#ff4040';
      ctx.fillText('HURRY UP', 320, g.hurryY);
    }

    if (g.rewardTime > 0 && g.rewardScale > 0.05) {
      const s = Math.max(0, Math.min(1, g.rewardScale));
      ctx.save();
      ctx.translate(320, 200);
      ctx.scale(s, s);
      ctx.font = "32px 'VCR OSD Mono', ui-monospace, monospace";
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(REWARDS[g.rewardIdx], 0, 0);
      ctx.fillStyle = '#fff4b0';
      ctx.fillText(REWARDS[g.rewardIdx], 0, 0);
      ctx.font = "18px 'VCR OSD Mono', ui-monospace, monospace";
      ctx.strokeText(String(g.p.latest), 0, 28);
      ctx.fillStyle = '#f4f7fb';
      ctx.fillText(String(g.p.latest), 0, 28);
      ctx.restore();
    }
  }

  function mount() {
    const root = document.getElementById('demo-icy');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    root.innerHTML = `
      <div class="dm-icy-stage">
        <canvas class="dm-icy-cv" tabindex="0" aria-label="Icy Tower. Arrows or A and D move, space jumps."></canvas>
        <p class="dm-icy-hint">arrows or A D · space jumps</p>
        <div class="dm-icy-over" hidden role="dialog" aria-modal="true" aria-label="You fell">
          <p class="dm-icy-fell">You fell</p>
          <p class="dm-icy-stat" aria-live="polite"></p>
          <button type="button" class="dm-btn dm-icy-restart">Restart</button>
        </div>
      </div>
      <div class="dm-icy-pad">
        <button type="button" class="dm-btn" data-k="l" aria-label="Move left">◀</button>
        <button type="button" class="dm-btn" data-k="r" aria-label="Move right">▶</button>
        <button type="button" class="dm-btn" data-k="j" aria-label="Jump">Jump</button>
      </div>`;
    const cv = root.querySelector('.dm-icy-cv');
    const ctx = cv.getContext('2d');
    const hint = root.querySelector('.dm-icy-hint');
    const pad = root.querySelector('.dm-icy-pad');
    const over = root.querySelector('.dm-icy-over');
    const stat = root.querySelector('.dm-icy-stat');
    const restartBtn = root.querySelector('.dm-icy-restart');
    const down = new Set();
    const hold = { l: false, r: false, j: false };
    const ptr = new Map();
    let g = null;
    let jumpLock = false;
    let active = false;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let running = false;

    const syncHold = () => {
      hold.l = hold.r = hold.j = false;
      for (const k of ptr.values()) hold[k] = true;
      pad.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(!!hold[b.dataset.k])));
    };
    const fresh = seed => {
      g = new Game(seed >>> 0);
      g.onFall = () => {
        stat.textContent = 'Floor ' + g.p.level + ' · Score ' + g.finalScore();
        over.hidden = false;
        pad.hidden = true;
        hint.hidden = true;
        restartBtn.focus({ preventScroll: true });
      };
    };
    fresh(1);

    const jumpHeld = () => down.has('j') || hold.j;
    const restart = () => {
      jumpLock = jumpHeld();
      fresh((Math.random() * 0x100000000) >>> 0);
      over.hidden = true;
      pad.hidden = false;
      cv.focus({ preventScroll: true });
      if (active) start();
    };
    restartBtn.addEventListener('click', restart);

    const KEY = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'j', ArrowUp: 'j', KeyW: 'j' };
    root.addEventListener('keydown', e => {
      if (g.over) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') {
          e.preventDefault();
          e.stopPropagation();
          restart();
        }
        return;
      }
      const k = KEY[e.code];
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      down.add(k);
      hint.hidden = true;
    });
    root.addEventListener('keyup', e => {
      const k = KEY[e.code];
      if (!k) return;
      down.delete(k);
      e.stopPropagation();
    });
    addEventListener('blur', () => down.clear());

    pad.querySelectorAll('button').forEach(b => {
      b.addEventListener('pointerdown', e => {
        if (g.over) return;
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        ptr.set(e.pointerId, b.dataset.k);
        syncHold();
        hint.hidden = true;
      });
      const up = e => { ptr.delete(e.pointerId); syncHold(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    cv.addEventListener('pointerdown', () => cv.focus({ preventScroll: true }));

    const paint = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = cv.clientWidth, h = cv.clientHeight;
      if (w < 2 || h < 2) return;
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
      ctx.setTransform(dpr * w / 640, 0, 0, dpr * h / 480, 0, 0);
      drawWorld(ctx, g);
    };
    const frame = now => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (!g.over) {
        if (!jumpHeld()) jumpLock = false;
        const left = down.has('l') || hold.l;
        const right = down.has('r') || hold.r;
        const jump = jumpHeld() && !jumpLock;
        acc += dt;
        let steps = 0;
        while (acc >= 0.02 && steps < 3 && !g.over) {
          g.tick(left, right, jump);
          acc -= 0.02;
          steps++;
        }
        if (steps === 3) acc = 0;
      }
      paint();
      if (g.over) { running = false; return; }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    const paneOn = () => {
      const pane = root.closest('.feat-pane');
      return !!(pane && !pane.hidden && pane.classList.contains('is-on') && !pane.dataset.featHidden);
    };
    addEventListener('feat-change', () => {
      active = paneOn();
      if (active) {
        start();
        if (!g.over) cv.focus({ preventScroll: true });
      } else stop();
    });
    addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else if (active && paneOn()) start();
    });
    new ResizeObserver(paint).observe(root);
    if (paneOn()) { active = true; start(); }
    else paint();
  }

  return { Game, lineIntersect, mount, WALL_L, WALL_R };
});
