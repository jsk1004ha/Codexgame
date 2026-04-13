(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    menu: document.getElementById('menu'),
    options: document.getElementById('options'),
    credits: document.getElementById('credits'),
    overlay: document.getElementById('overlay'),
    hud: document.getElementById('hud'),
    bestScore: document.getElementById('bestScore'),
    unlocked: document.getElementById('unlocked'),
    hpText: document.getElementById('hpText'),
    beaconText: document.getElementById('beaconText'),
    chargeText: document.getElementById('chargeText'),
    scoreText: document.getElementById('scoreText'),
    pulseText: document.getElementById('pulseText'),
    volume: document.getElementById('volume'),
    shake: document.getElementById('shake'),
    flash: document.getElementById('flash'),
    assist: document.getElementById('assist')
  };

  const STORAGE_KEY = 'voidpulse_save_v1';
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const CENTER = { x: WIDTH * 0.5, y: HEIGHT * 0.5 };

  let save = loadSave();
  applySaveToUI();

  const keys = new Set();
  let state = 'menu';
  let game = null;
  let lastTime = performance.now();
  let cameraShake = 0;

  class Sfx {
    constructor() {
      this.ctx = null;
    }
    init() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    beep(freq, duration, type = 'square', gain = 0.05) {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const vol = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      vol.gain.value = gain * (save.volume / 100);
      osc.connect(vol).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }
  }
  const sfx = new Sfx();

  function loadSave() {
    const defaults = { bestScore: 0, unlockBurst: false, volume: 70, shake: true, flash: true, assist: false };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }
  function persistSave() { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); }
  function applySaveToUI() {
    ui.bestScore.textContent = String(save.bestScore);
    ui.unlocked.textContent = save.unlockBurst ? '버스트 파동 해금' : '기본 파동';
    ui.volume.value = save.volume;
    ui.shake.checked = save.shake;
    ui.flash.checked = save.flash;
    ui.assist.checked = save.assist;
  }

  function createGame() {
    return {
      player: { x: CENTER.x, y: CENTER.y + 120, r: 12, speed: 210, hp: save.assist ? 130 : 100, dashCd: 0, invul: 0 },
      beacon: { hp: save.assist ? 160 : 120, r: 34 },
      enemies: [],
      particles: [],
      pulses: [],
      t: 0,
      waveTimer: 0,
      score: 0,
      charge: 0,
      boss: null,
      pulseCd: 0,
      ended: false
    };
  }

  function startGame() {
    sfx.init();
    if (sfx.ctx?.state === 'suspended') sfx.ctx.resume();
    game = createGame();
    setState('playing');
  }

  function setState(next) {
    state = next;
    [ui.menu, ui.options, ui.credits].forEach(el => el.classList.remove('visible'));
    ui.overlay.classList.remove('visible');
    ui.hud.classList.toggle('visible', state === 'playing' || state === 'paused');
    if (next === 'menu') ui.menu.classList.add('visible');
    if (next === 'options') ui.options.classList.add('visible');
    if (next === 'credits') ui.credits.classList.add('visible');
    if (next === 'paused') {
      showOverlay('일시정지', 'Esc 또는 P로 복귀 · R로 재시작');
    }
  }

  function showOverlay(title, msg, buttons = [{ label: '메뉴', action: () => setState('menu') }]) {
    ui.overlay.innerHTML = `<div class="modal"><h3>${title}</h3><p>${msg}</p><div class="menu-buttons"></div></div>`;
    const box = ui.overlay.querySelector('.menu-buttons');
    buttons.forEach(btn => {
      const b = document.createElement('button');
      b.textContent = btn.label;
      b.addEventListener('click', btn.action);
      box.appendChild(b);
    });
    ui.overlay.classList.add('visible');
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = -20; y = Math.random() * HEIGHT; }
    if (side === 1) { x = WIDTH + 20; y = Math.random() * HEIGHT; }
    if (side === 2) { x = Math.random() * WIDTH; y = -20; }
    if (side === 3) { x = Math.random() * WIDTH; y = HEIGHT + 20; }
    const typeRoll = Math.random();
    const fast = typeRoll < 0.25;
    game.enemies.push({
      x, y,
      r: fast ? 9 : 12,
      hp: fast ? 18 : 30,
      speed: fast ? 120 + game.t * 0.6 : 70 + game.t * 0.5,
      type: fast ? 'fast' : 'normal'
    });
  }

  function spawnBoss() {
    game.boss = { x: WIDTH * 0.5, y: -80, r: 48, hp: 520, speed: 55, phase: 0, pulse: 0 };
    sfx.beep(130, 0.35, 'sawtooth', 0.1);
  }

  function emit(x, y, color, amount = 10) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      game.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45 + Math.random() * 0.4, color });
    }
  }

  function shootPulse(boost = false) {
    if (game.pulseCd > 0) return;
    game.pulseCd = boost ? 0.18 : 0.32;
    const power = save.unlockBurst ? 56 : 42;
    game.pulses.push({ x: game.player.x, y: game.player.y, r: 10, max: power + (boost ? 18 : 0), speed: 220, dmg: boost ? 28 : 20 });
    sfx.beep(boost ? 720 : 590, 0.08, 'triangle', 0.08);
  }

  function damagePlayer(amount) {
    if (game.player.invul > 0) return;
    game.player.hp -= amount * (save.assist ? 0.7 : 1);
    game.player.invul = 0.45;
    cameraShake = save.shake ? 8 : 0;
    sfx.beep(160, 0.08, 'square', 0.1);
    if (game.player.hp <= 0) endGame(false, '플레이어 HP가 소진되었습니다.');
  }

  function damageBeacon(amount) {
    game.beacon.hp -= amount * (save.assist ? 0.8 : 1);
    cameraShake = save.shake ? 10 : 0;
    sfx.beep(100, 0.1, 'square', 0.08);
    if (game.beacon.hp <= 0) endGame(false, '비콘이 붕괴되었습니다.');
  }

  function endGame(win, reason) {
    if (game.ended) return;
    game.ended = true;
    if (game.score > save.bestScore) save.bestScore = Math.floor(game.score);
    if (win) save.unlockBurst = true;
    save.volume = Number(ui.volume.value);
    save.shake = ui.shake.checked;
    save.flash = ui.flash.checked;
    save.assist = ui.assist.checked;
    persistSave();
    applySaveToUI();

    const title = win ? '클리어!' : '게임 오버';
    const msg = `${reason}<br>최종 점수: ${Math.floor(game.score)} / 최고 기록: ${save.bestScore}`;
    showOverlay(title, msg, [
      { label: '다시 플레이', action: startGame },
      { label: '메뉴', action: () => setState('menu') }
    ]);
    state = win ? 'victory' : 'gameover';
    sfx.beep(win ? 860 : 120, 0.22, win ? 'triangle' : 'sawtooth', 0.1);
  }

  function update(dt) {
    if (state !== 'playing' || !game) return;
    game.t += dt;
    game.waveTimer += dt;
    game.score += dt * 10;
    game.charge = Math.min(100, game.charge + dt * (save.assist ? 9 : 6.2));

    const moveX = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'));
    const moveY = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'));
    const len = Math.hypot(moveX, moveY) || 1;
    game.player.x += (moveX / len) * game.player.speed * dt;
    game.player.y += (moveY / len) * game.player.speed * dt;
    game.player.x = Math.max(10, Math.min(WIDTH - 10, game.player.x));
    game.player.y = Math.max(10, Math.min(HEIGHT - 10, game.player.y));

    game.player.dashCd = Math.max(0, game.player.dashCd - dt);
    game.player.invul = Math.max(0, game.player.invul - dt);
    game.pulseCd = Math.max(0, game.pulseCd - dt);

    if (game.waveTimer >= Math.max(0.34, 1.15 - game.t * 0.02)) {
      game.waveTimer = 0;
      spawnEnemy();
    }

    if (!game.boss && game.charge >= 100) spawnBoss();

    if (game.boss) {
      const b = game.boss;
      const tx = CENTER.x + Math.sin(game.t * 0.7) * 160;
      const ty = CENTER.y - 80 + Math.cos(game.t * 0.9) * 24;
      b.x += (tx - b.x) * dt * 1.5;
      b.y += (ty - b.y) * dt * 1.2;
      b.pulse += dt;
      if (b.pulse > 2.25) {
        b.pulse = 0;
        for (let i = 0; i < 8; i++) {
          const ang = (Math.PI * 2 * i) / 8 + game.t;
          game.enemies.push({ x: b.x, y: b.y, r: 9, hp: 14, speed: 130, vx: Math.cos(ang) * 130, vy: Math.sin(ang) * 130, type: 'drone' });
        }
        sfx.beep(220, 0.09, 'sawtooth', 0.08);
      }
    }

    if (keys.has(' ') || keys.has('space')) shootPulse(false);

    game.pulses.forEach(p => p.r += p.speed * dt);
    game.pulses = game.pulses.filter(p => p.r < p.max);

    for (const e of game.enemies) {
      if (e.type === 'drone') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      } else {
        const target = Math.hypot(e.x - CENTER.x, e.y - CENTER.y) < 160 ? CENTER : game.player;
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }

      if (Math.hypot(e.x - game.player.x, e.y - game.player.y) < e.r + game.player.r) {
        damagePlayer(e.type === 'fast' ? 10 : 7);
        e.hp = 0;
      }
      if (Math.hypot(e.x - CENTER.x, e.y - CENTER.y) < e.r + game.beacon.r) {
        damageBeacon(e.type === 'drone' ? 6 : 9);
        e.hp = 0;
      }

      for (const p of game.pulses) {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (Math.abs(dist - p.r) < e.r + 5) {
          e.hp -= p.dmg;
          emit(e.x, e.y, '#7dd3fc', 4);
        }
      }
    }

    if (game.boss) {
      for (const p of game.pulses) {
        const d = Math.hypot(game.boss.x - p.x, game.boss.y - p.y);
        if (Math.abs(d - p.r) < game.boss.r + 6) {
          game.boss.hp -= p.dmg * 0.7;
          game.score += 4;
          emit(game.boss.x + (Math.random() - 0.5) * 20, game.boss.y + (Math.random() - 0.5) * 20, '#a78bfa', 3);
        }
      }
      if (Math.hypot(game.boss.x - game.player.x, game.boss.y - game.player.y) < game.boss.r + game.player.r) damagePlayer(18);
      if (game.boss.hp <= 0) endGame(true, 'Oblivion Eye를 파괴하고 비콘을 지켜냈습니다!');
    }

    game.enemies = game.enemies.filter(e => {
      if (e.hp <= 0) {
        game.score += e.type === 'drone' ? 5 : 12;
        emit(e.x, e.y, e.type === 'fast' ? '#f59e0b' : '#34d399', 8);
        return false;
      }
      return e.x > -120 && e.x < WIDTH + 120 && e.y > -120 && e.y < HEIGHT + 120;
    });

    game.particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
    });
    game.particles = game.particles.filter(p => p.life > 0);

    ui.hpText.textContent = `${Math.max(0, game.player.hp).toFixed(0)}`;
    ui.beaconText.textContent = `${Math.max(0, game.beacon.hp).toFixed(0)}`;
    ui.chargeText.textContent = `${game.charge.toFixed(0)}%`;
    ui.scoreText.textContent = `${Math.floor(game.score)}`;
    ui.pulseText.textContent = save.unlockBurst ? 'Burst ON' : 'Normal';

    cameraShake *= 0.85;
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const sx = save.shake ? (Math.random() - 0.5) * cameraShake : 0;
    const sy = save.shake ? (Math.random() - 0.5) * cameraShake : 0;
    ctx.save();
    ctx.translate(sx, sy);

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (let i = 0; i < 80; i++) {
      const x = (i * 93 + Math.sin(i + performance.now() * 0.0002) * 40) % WIDTH;
      const y = (i * 57 + Math.cos(i + performance.now() * 0.00016) * 25) % HEIGHT;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(125,211,252,.4)' : 'rgba(148,163,184,.16)';
      ctx.fillRect(x, y, 2, 2);
    }

    if (game) {
      const aura = 40 + Math.sin(game.t * 3) * 8;
      const grad = ctx.createRadialGradient(CENTER.x, CENTER.y, 8, CENTER.x, CENTER.y, aura + 50);
      grad.addColorStop(0, 'rgba(125,211,252,0.25)');
      grad.addColorStop(1, 'rgba(2,6,23,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, aura + 50, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, game.beacon.r, 0, Math.PI * 2);
      ctx.stroke();

      game.pulses.forEach(p => {
        ctx.strokeStyle = save.flash ? 'rgba(125,211,252,0.88)' : 'rgba(125,211,252,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      });

      game.enemies.forEach(e => {
        ctx.fillStyle = e.type === 'fast' ? '#f59e0b' : e.type === 'drone' ? '#a78bfa' : '#34d399';
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (game.boss) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(game.boss.x, game.boss.y, game.boss.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(game.boss.x + 12, game.boss.y - 5, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(15,23,42,.72)';
        ctx.fillRect(WIDTH * 0.25, 20, WIDTH * 0.5, 12);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(WIDTH * 0.25, 20, WIDTH * 0.5 * Math.max(0, game.boss.hp / 520), 12);
      }

      const blink = game.player.invul > 0 && Math.floor(game.player.invul * 20) % 2 === 0;
      if (!blink) {
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(game.player.x, game.player.y - game.player.r);
        ctx.lineTo(game.player.x + game.player.r, game.player.y + game.player.r);
        ctx.lineTo(game.player.x - game.player.r, game.player.y + game.player.r);
        ctx.closePath();
        ctx.fill();
      }

      game.particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
        ctx.globalAlpha = 1;
      });
    }

    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);

    if ((k === 'escape' || k === 'p') && (state === 'playing' || state === 'paused')) {
      if (state === 'playing') setState('paused');
      else {
        state = 'playing';
        ui.overlay.classList.remove('visible');
      }
    }

    if (k === 'r' && (state === 'playing' || state === 'paused' || state === 'gameover' || state === 'victory')) startGame();

    if (state === 'playing' && k === 'shift' && game.player.dashCd <= 0) {
      game.player.dashCd = 1.8;
      const mx = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'));
      const my = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'));
      const n = Math.hypot(mx, my) || 1;
      game.player.x += (mx / n) * 90;
      game.player.y += (my / n) * 90;
      shootPulse(true);
      sfx.beep(940, 0.05, 'triangle', 0.08);
    }

    if (k === 'm') {
      ui.volume.value = ui.volume.value === '0' ? String(save.volume || 70) : '0';
      save.volume = Number(ui.volume.value);
      persistSave();
    }
  });

  document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('optionsBtn').addEventListener('click', () => setState('options'));
  document.getElementById('creditsBtn').addEventListener('click', () => setState('credits'));
  document.querySelectorAll('.back-btn').forEach(btn => btn.addEventListener('click', () => setState(btn.dataset.back)));

  [ui.volume, ui.shake, ui.flash, ui.assist].forEach(el => {
    el.addEventListener('input', () => {
      save.volume = Number(ui.volume.value);
      save.shake = ui.shake.checked;
      save.flash = ui.flash.checked;
      save.assist = ui.assist.checked;
      persistSave();
    });
  });

  setState('menu');
  requestAnimationFrame(loop);
})();
