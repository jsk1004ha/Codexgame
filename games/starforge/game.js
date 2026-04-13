(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    hp: document.getElementById('hpText'),
    core: document.getElementById('coreText'),
    wave: document.getElementById('waveText'),
    score: document.getElementById('scoreText'),
    best: document.getElementById('bestText'),
    overlay: document.getElementById('overlay'),
    pauseBtn: document.getElementById('pauseBtn'),
    optionBtn: document.getElementById('optionBtn')
  };

  const STORE_KEY = 'starforge_ember_raid_v1';
  const cfg = {
    width: canvas.width,
    height: canvas.height,
    playerSpeed: 220,
    dashSpeed: 540,
    bulletSpeed: 520,
    enemyBase: 72,
    coreTarget: 20,
    bossWave: 7
  };

  const state = {
    scene: 'title',
    settings: loadSettings(),
    bestScore: 0,
    unlockedHard: false,
    keys: new Set(),
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    coreDrops: [],
    time: 0,
    shootCd: 0,
    spawnCd: 0,
    pulseCd: 0,
    dashCd: 0,
    wave: 1,
    score: 0,
    core: 0,
    danger: 0,
    boss: null,
    shake: 0,
    resultReason: ''
  };

  applySaveData();
  bindInput();
  showTitle();
  let last = performance.now();
  requestAnimationFrame(loop);

  function applySaveData() {
    ui.best.textContent = state.bestScore;
  }

  function loadSettings() {
    const def = { volume: 0.45, reducedMotion: false, difficulty: 'normal', helperAim: true, mute: false };
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { ...def, ...raw.settings };
    } catch {
      return def;
    }
  }

  function saveProgress() {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      bestScore: state.bestScore,
      unlockedHard: state.unlockedHard,
      settings: state.settings
    }));
  }

  function loadProgress() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      state.bestScore = raw.bestScore || 0;
      state.unlockedHard = !!raw.unlockedHard;
    } catch {
      state.bestScore = 0;
      state.unlockedHard = false;
    }
  }

  loadProgress();

  function resetRun() {
    state.player = { x: cfg.width / 2, y: cfg.height / 2, r: 14, hp: 100, facingX: 1, facingY: 0, dashTimer: 0, inv: 0 };
    state.bullets = [];
    state.enemies = [];
    state.particles = [];
    state.coreDrops = [];
    state.time = 0;
    state.shootCd = 0;
    state.spawnCd = 0.6;
    state.pulseCd = 0;
    state.dashCd = 0;
    state.wave = 1;
    state.score = 0;
    state.core = 0;
    state.danger = 0;
    state.boss = null;
    state.shake = 0;
    state.resultReason = '';
    updateHud();
  }

  function startGame() {
    resetRun();
    state.scene = 'playing';
    closeOverlay();
  }

  function bindInput() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if ([" ", 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
      state.keys.add(key);

      if (key === 'p') togglePause();
      if (key === 'o') openOptions();
      if (key === ' ' && state.scene === 'playing') doDash();
      if (key === 'shift' && state.scene === 'playing') doPulse();
    });
    window.addEventListener('keyup', (e) => state.keys.delete(e.key.toLowerCase()));

    ui.pauseBtn.addEventListener('click', togglePause);
    ui.optionBtn.addEventListener('click', openOptions);
  }

  function togglePause() {
    if (state.scene === 'playing') {
      state.scene = 'paused';
      showPause();
    } else if (state.scene === 'paused') {
      state.scene = 'playing';
      closeOverlay();
    }
  }

  function showTitle() {
    state.scene = 'title';
    ui.overlay.className = 'overlay active';
    ui.overlay.innerHTML = `
      <div class="modal">
        <h2>STARFORGE: Ember Raid</h2>
        <p>끊임없이 몰려오는 드론을 정리하며 <strong>에너지 코어 20개</strong>를 모아 보스를 소환하고 파괴하세요.</p>
        <ul>
          <li>핵심 루프: 이동 회피 → 자동 사격 → 코어 수집 → 보스전 돌입</li>
          <li>실패 조건: 체력 0</li>
          <li>클리어 조건: 보스 "Oblivion Carrier" 격파</li>
        </ul>
        <p class="small">하드 모드는 1회 클리어 시 해금됩니다. (저장됨)</p>
        <div class="row">
          <button id="startBtn">게임 시작</button>
          <button id="titleOptionBtn">옵션</button>
          <button id="creditBtn">크레딧</button>
        </div>
      </div>`;
    document.getElementById('startBtn').onclick = startGame;
    document.getElementById('titleOptionBtn').onclick = openOptions;
    document.getElementById('creditBtn').onclick = showCredits;
  }

  function showPause() {
    ui.overlay.className = 'overlay active';
    ui.overlay.innerHTML = `
      <div class="modal">
        <h2>일시정지</h2>
        <p>전장을 잠시 정지했습니다.</p>
        <div class="row">
          <button id="resumeBtn">계속하기</button>
          <button id="retryBtn">재시작</button>
          <button id="pauseOptBtn">옵션</button>
          <button id="toTitleBtn">타이틀</button>
        </div>
      </div>`;
    document.getElementById('resumeBtn').onclick = () => { state.scene = 'playing'; closeOverlay(); };
    document.getElementById('retryBtn').onclick = startGame;
    document.getElementById('pauseOptBtn').onclick = openOptions;
    document.getElementById('toTitleBtn').onclick = showTitle;
  }

  function endRun(cleared, reason = '') {
    state.scene = cleared ? 'clear' : 'gameover';
    state.resultReason = reason;
    if (state.score > state.bestScore) state.bestScore = state.score;
    if (cleared) state.unlockedHard = true;
    ui.best.textContent = state.bestScore;
    saveProgress();

    ui.overlay.className = 'overlay active';
    ui.overlay.innerHTML = `
      <div class="modal">
        <h2>${cleared ? 'MISSION CLEAR' : 'GAME OVER'}</h2>
        <p>${cleared ? '보스를 격파하고 스타포지 회수를 완료했습니다.' : `패배 원인: ${reason || '체력 고갈'}`}</p>
        <p>최종 점수: <strong>${state.score}</strong> / 최고 점수: <strong>${state.bestScore}</strong></p>
        <div class="row">
          <button id="againBtn">다시 플레이</button>
          <button id="endOptBtn">옵션</button>
          <button id="endTitleBtn">타이틀</button>
        </div>
      </div>`;
    document.getElementById('againBtn').onclick = startGame;
    document.getElementById('endOptBtn').onclick = openOptions;
    document.getElementById('endTitleBtn').onclick = showTitle;
  }

  function showCredits() {
    ui.overlay.className = 'overlay active';
    ui.overlay.innerHTML = `
      <div class="modal">
        <h2>크레딧</h2>
        <p>기획/개발/아트/사운드: Autonomous Codex Indie Agent</p>
        <p>엔진: Vanilla JavaScript + HTML5 Canvas + Web Audio API</p>
        <p>2026 Solo Web Demo Build</p>
        <div class="row">
          <button id="creditBackBtn">돌아가기</button>
        </div>
      </div>`;
    document.getElementById('creditBackBtn').onclick = showTitle;
  }

  function openOptions() {
    const from = state.scene;
    state.scene = 'options';
    ui.overlay.className = 'overlay active';
    ui.overlay.innerHTML = `
      <div class="modal">
        <h2>옵션</h2>
        <label>마스터 볼륨 <input id="volInput" type="range" min="0" max="1" step="0.05" value="${state.settings.volume}"></label>
        <label><input id="muteInput" type="checkbox" ${state.settings.mute ? 'checked' : ''}> 음소거</label>
        <label><input id="motionInput" type="checkbox" ${state.settings.reducedMotion ? 'checked' : ''}> 화면 흔들림 줄이기</label>
        <label><input id="aimInput" type="checkbox" ${state.settings.helperAim ? 'checked' : ''}> 자동 조준 보정(초보자용)</label>
        <label>난이도
          <select id="difficultySelect">
            <option value="easy" ${state.settings.difficulty === 'easy' ? 'selected' : ''}>쉬움</option>
            <option value="normal" ${state.settings.difficulty === 'normal' ? 'selected' : ''}>보통</option>
            <option value="hard" ${(state.settings.difficulty === 'hard' && state.unlockedHard) ? 'selected' : ''} ${state.unlockedHard ? '' : 'disabled'}>어려움${state.unlockedHard ? '' : ' (클리어 후 해금)'}</option>
          </select>
        </label>
        <div class="row">
          <button id="optSaveBtn">저장</button>
          <button id="optCancelBtn">취소</button>
        </div>
      </div>`;

    document.getElementById('optSaveBtn').onclick = () => {
      state.settings.volume = Number(document.getElementById('volInput').value);
      state.settings.mute = document.getElementById('muteInput').checked;
      state.settings.reducedMotion = document.getElementById('motionInput').checked;
      state.settings.helperAim = document.getElementById('aimInput').checked;
      const diff = document.getElementById('difficultySelect').value;
      state.settings.difficulty = (diff === 'hard' && !state.unlockedHard) ? 'normal' : diff;
      saveProgress();
      if (from === 'playing') {
        state.scene = 'paused';
        showPause();
      } else if (from === 'title' || from === 'clear' || from === 'gameover') {
        showTitle();
      } else {
        state.scene = from;
        closeOverlay();
      }
    };
    document.getElementById('optCancelBtn').onclick = () => {
      if (from === 'playing') {
        state.scene = 'paused';
        showPause();
      } else if (from === 'title' || from === 'clear' || from === 'gameover') {
        showTitle();
      } else {
        state.scene = from;
        closeOverlay();
      }
    };
  }

  function closeOverlay() {
    ui.overlay.className = 'overlay';
    ui.overlay.innerHTML = '';
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (state.scene === 'playing') update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function difficultyScalar() {
    if (state.settings.difficulty === 'easy') return 0.84;
    if (state.settings.difficulty === 'hard') return 1.28;
    return 1;
  }

  function update(dt) {
    state.time += dt;
    const diff = difficultyScalar();
    const p = state.player;

    movePlayer(dt, p);

    if (p.inv > 0) p.inv -= dt;
    if (p.dashTimer > 0) p.dashTimer -= dt;
    if (state.pulseCd > 0) state.pulseCd -= dt;
    if (state.dashCd > 0) state.dashCd -= dt;

    state.spawnCd -= dt;
    const aliveWeight = state.enemies.reduce((a, e) => a + (e.type === 'tank' ? 2 : 1), 0);
    if (state.spawnCd <= 0 && !state.boss) {
      const targetCount = 4 + state.wave * 0.6 * diff;
      if (aliveWeight < targetCount) spawnEnemy();
      state.spawnCd = Math.max(0.18, 1.0 - state.wave * 0.06) / diff;
    }

    state.shootCd -= dt;
    if (state.shootCd <= 0) {
      shootAtNearest();
      state.shootCd = state.settings.helperAim ? 0.2 : 0.26;
    }

    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > cfg.width + 40 || b.y > cfg.height + 40) {
        state.bullets.splice(i, 1);
      }
    }

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const e = state.enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = (e.speed + state.wave * 2.6) * diff;
      e.x += (dx / dist) * speed * dt;
      e.y += (dy / dist) * speed * dt;

      if (dist < p.r + e.r && p.inv <= 0) {
        const hit = e.type === 'tank' ? 18 : 11;
        p.hp -= hit;
        p.inv = 0.55;
        state.shake = state.settings.reducedMotion ? 0 : 8;
        spawnBurst(p.x, p.y, '#fb7185', 16);
        playSfx(120, 0.08, 'sawtooth');
        if (p.hp <= 0) {
          endRun(false, '적과 충돌');
          return;
        }
      }
    }

    if (state.boss) updateBoss(dt, diff);

    resolveHits();
    collectCores();
    advanceWaves();

    for (let i = state.coreDrops.length - 1; i >= 0; i--) {
      state.coreDrops[i].life -= dt;
      if (state.coreDrops[i].life <= 0) state.coreDrops.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) state.particles.splice(i, 1);
    }

    state.shake *= 0.84;
    updateHud();
  }

  function movePlayer(dt, p) {
    let mx = 0;
    let my = 0;
    if (state.keys.has('a') || state.keys.has('arrowleft')) mx -= 1;
    if (state.keys.has('d') || state.keys.has('arrowright')) mx += 1;
    if (state.keys.has('w') || state.keys.has('arrowup')) my -= 1;
    if (state.keys.has('s') || state.keys.has('arrowdown')) my += 1;

    const len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    if (mx || my) {
      p.facingX = mx;
      p.facingY = my;
    }

    const speed = p.dashTimer > 0 ? cfg.dashSpeed : cfg.playerSpeed;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.x = Math.max(14, Math.min(cfg.width - 14, p.x));
    p.y = Math.max(14, Math.min(cfg.height - 14, p.y));
  }

  function doDash() {
    if (state.dashCd > 0) return;
    state.player.dashTimer = 0.14;
    state.player.inv = 0.2;
    state.dashCd = 1.05;
    spawnBurst(state.player.x, state.player.y, '#22d3ee', 12);
    playSfx(280, 0.06, 'triangle');
  }

  function doPulse() {
    if (state.pulseCd > 0) return;
    state.pulseCd = 2.8;
    const p = state.player;
    let hits = 0;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= 120) {
        e.hp -= 34;
        e.stun = 0.35;
        hits++;
      }
    }
    if (state.boss) {
      const d = Math.hypot(state.boss.x - p.x, state.boss.y - p.y);
      if (d <= 160) {
        state.boss.hp -= 20;
        hits++;
      }
    }
    state.shake = state.settings.reducedMotion ? 0 : 10;
    spawnRing(p.x, p.y, '#a78bfa');
    if (hits > 0) playSfx(190, 0.11, 'square');
  }

  function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = -20; y = Math.random() * cfg.height; }
    if (side === 1) { x = cfg.width + 20; y = Math.random() * cfg.height; }
    if (side === 2) { x = Math.random() * cfg.width; y = -20; }
    if (side === 3) { x = Math.random() * cfg.width; y = cfg.height + 20; }

    const tank = Math.random() < Math.min(0.35, 0.12 + state.wave * 0.04);
    state.enemies.push({
      x, y,
      r: tank ? 14 : 10,
      hp: tank ? 64 : 30,
      speed: tank ? 36 : 68,
      type: tank ? 'tank' : 'drone'
    });
  }

  function shootAtNearest() {
    const p = state.player;
    let target = null;
    let min = Infinity;
    const pool = state.boss ? [state.boss, ...state.enemies] : state.enemies;
    for (const e of pool) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < min) { min = d; target = e; }
    }
    if (!target) return;
    let dx = target.x - p.x;
    let dy = target.y - p.y;
    if (!state.settings.helperAim) {
      dx += (Math.random() - 0.5) * 60;
      dy += (Math.random() - 0.5) * 60;
    }
    const dist = Math.hypot(dx, dy) || 1;
    state.bullets.push({
      x: p.x,
      y: p.y,
      vx: (dx / dist) * cfg.bulletSpeed,
      vy: (dy / dist) * cfg.bulletSpeed,
      life: 1.2
    });
    playSfx(360, 0.03, 'square');
  }

  function resolveHits() {
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      let removed = false;

      for (let j = state.enemies.length - 1; j >= 0; j--) {
        const e = state.enemies[j];
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (d < e.r + 3) {
          e.hp -= 22;
          state.bullets.splice(i, 1);
          removed = true;
          if (e.hp <= 0) {
            const gain = e.type === 'tank' ? 120 : 70;
            state.score += gain;
            if (Math.random() < (e.type === 'tank' ? 0.85 : 0.45)) {
              state.coreDrops.push({ x: e.x, y: e.y, r: 7, life: 8 });
            }
            spawnBurst(e.x, e.y, e.type === 'tank' ? '#f59e0b' : '#22d3ee', 14);
            state.enemies.splice(j, 1);
            playSfx(220, 0.05, 'triangle');
          }
          break;
        }
      }

      if (!removed && state.boss) {
        const d = Math.hypot(b.x - state.boss.x, b.y - state.boss.y);
        if (d < state.boss.r + 3) {
          state.boss.hp -= 11;
          state.bullets.splice(i, 1);
          spawnBurst(b.x, b.y, '#f43f5e', 4);
          if (state.boss.hp <= 0) {
            state.score += 1600;
            endRun(true);
            return;
          }
        }
      }
    }
  }

  function collectCores() {
    const p = state.player;
    for (let i = state.coreDrops.length - 1; i >= 0; i--) {
      const c = state.coreDrops[i];
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < p.r + c.r + 3) {
        state.coreDrops.splice(i, 1);
        state.core += 1;
        state.score += 35;
        p.hp = Math.min(100, p.hp + 2);
        playSfx(520, 0.05, 'sine');
      }
    }
  }

  function advanceWaves() {
    const old = state.wave;
    state.wave = Math.min(cfg.bossWave, 1 + Math.floor(state.time / 18) + Math.floor(state.core / 4));
    if (state.wave !== old) {
      spawnRing(state.player.x, state.player.y, '#38bdf8');
    }

    if (!state.boss && (state.core >= cfg.coreTarget || (state.wave >= cfg.bossWave && state.time > 90))) {
      summonBoss();
    }
  }

  function summonBoss() {
    state.boss = {
      x: cfg.width / 2,
      y: 90,
      r: 34,
      hp: state.settings.difficulty === 'hard' ? 950 : state.settings.difficulty === 'easy' ? 640 : 780,
      phase: 0,
      attackCd: 1.1,
      vx: 130
    };
    state.enemies.length = 0;
    spawnRing(cfg.width / 2, 90, '#f43f5e');
    playSfx(90, 0.3, 'sawtooth');
  }

  function updateBoss(dt, diff) {
    const b = state.boss;
    b.x += b.vx * dt;
    if (b.x < 90 || b.x > cfg.width - 90) b.vx *= -1;
    b.attackCd -= dt;

    if (b.attackCd <= 0) {
      b.phase = (b.phase + 1) % 3;
      const p = state.player;
      if (b.phase === 0) {
        for (let i = -2; i <= 2; i++) {
          fireHazard(b.x, b.y, p.x + i * 60, p.y);
        }
        b.attackCd = 1.1 / diff;
      } else if (b.phase === 1) {
        for (let i = 0; i < 10; i++) {
          const ang = (Math.PI * 2 * i) / 10;
          fireHazard(b.x, b.y, b.x + Math.cos(ang) * 80, b.y + Math.sin(ang) * 80);
        }
        b.attackCd = 1.7 / diff;
      } else {
        for (let i = 0; i < 6; i++) {
          spawnEnemy();
        }
        b.attackCd = 2.2 / diff;
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      if (pt.kind !== 'hazard') continue;
      const d = Math.hypot(pt.x - state.player.x, pt.y - state.player.y);
      if (d < state.player.r + pt.r && state.player.inv <= 0) {
        state.player.hp -= 10;
        state.player.inv = 0.4;
        pt.life = 0;
        state.shake = state.settings.reducedMotion ? 0 : 7;
        playSfx(110, 0.08, 'sawtooth');
        if (state.player.hp <= 0) {
          endRun(false, '보스 탄막 피격');
          return;
        }
      }
    }
  }

  function fireHazard(x, y, tx, ty) {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = 220;
    state.particles.push({ x, y, vx: (dx / d) * sp, vy: (dy / d) * sp, life: 3.2, color: '#f43f5e', r: 6, kind: 'hazard' });
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 220;
      state.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.25 + Math.random() * 0.45, color, r: 2 + Math.random() * 2, kind: 'vfx' });
    }
  }

  function spawnRing(x, y, color) {
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      const sp = 140;
      state.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.45, color, r: 2, kind: 'vfx' });
    }
  }

  function render() {
    const s = state.shake;
    const ox = s > 0 ? (Math.random() - 0.5) * s : 0;
    const oy = s > 0 ? (Math.random() - 0.5) * s : 0;

    ctx.save();
    ctx.clearRect(0, 0, cfg.width, cfg.height);
    ctx.translate(ox, oy);

    drawBackground();

    for (const c of state.coreDrops) {
      drawCore(c.x, c.y, c.r);
    }

    for (const b of state.bullets) {
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const e of state.enemies) drawEnemy(e);
    if (state.boss) drawBoss(state.boss);
    drawPlayer(state.player || { x: -100, y: -100, r: 0, hp: 0, inv: 0 });

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (state.boss && state.scene === 'playing') {
      const ratio = Math.max(0, state.boss.hp) / (state.settings.difficulty === 'hard' ? 950 : state.settings.difficulty === 'easy' ? 640 : 780);
      ctx.fillStyle = 'rgba(15,23,42,.8)';
      ctx.fillRect(200, 12, 560, 18);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(202, 14, 556 * ratio, 14);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(200, 12, 560, 18);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '13px sans-serif';
      ctx.fillText('BOSS: Oblivion Carrier', 208, 26);
    }

    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, cfg.height);
    g.addColorStop(0, '#020617');
    g.addColorStop(1, '#0b1120');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cfg.width, cfg.height);

    const t = state.time;
    for (let i = 0; i < 70; i++) {
      const x = (i * 137 + t * 20) % cfg.width;
      const y = (i * 89 + Math.sin(t + i) * 18 + 20) % cfg.height;
      ctx.fillStyle = i % 3 === 0 ? '#1d4ed8' : '#0ea5e9';
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = 'rgba(56,189,248,0.14)';
    for (let x = 0; x < cfg.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cfg.height);
      ctx.stroke();
    }
  }

  function drawPlayer(p) {
    if (!p) return;
    ctx.save();
    if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.type === 'tank') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
      ctx.strokeStyle = '#fef3c7';
      ctx.strokeRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fee2e2';
      ctx.stroke();
    }
  }

  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fecaca';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    for (let i = 0; i < 6; i++) {
      const a = state.time * 2 + (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (b.r + 8), Math.sin(a) * (b.r + 8), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCore(x, y, r) {
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.moveTo(x, y - r - 2);
    ctx.lineTo(x + r + 1, y);
    ctx.lineTo(x, y + r + 2);
    ctx.lineTo(x - r - 1, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ede9fe';
    ctx.stroke();
  }

  function updateHud() {
    if (!state.player) return;
    ui.hp.textContent = Math.max(0, Math.floor(state.player.hp));
    ui.core.textContent = state.core;
    ui.wave.textContent = state.wave + (state.boss ? ' (BOSS)' : '');
    ui.score.textContent = state.score;
    ui.best.textContent = state.bestScore;
  }

  let audioCtx = null;
  function playSfx(freq, len, type = 'sine') {
    if (state.settings.mute || state.settings.volume <= 0) return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, state.settings.volume * 0.08), audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + len);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + len + 0.03);
  }
})();
