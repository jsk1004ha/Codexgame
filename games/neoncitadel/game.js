(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const panels = [...document.querySelectorAll('.panel')];
  const ui = {
    hpBar: document.getElementById('hp-bar'),
    hpText: document.getElementById('hp-text'),
    xpBar: document.getElementById('xp-bar'),
    xpText: document.getElementById('xp-text'),
    waveText: document.getElementById('wave-text'),
    chapterText: document.getElementById('chapter-text'),
    scrapText: document.getElementById('scrap-text'),
    multiplierText: document.getElementById('multiplier-text'),
    notice: document.getElementById('floating-notice'),
    endTitle: document.getElementById('end-title'),
    endSummary: document.getElementById('end-summary'),
    endScore: document.getElementById('end-score'),
    endWave: document.getElementById('end-wave'),
    endTime: document.getElementById('end-time'),
    bestScore: document.getElementById('best-score'),
    upgradeList: document.getElementById('upgrade-list'),
    difficulty: document.getElementById('difficulty'),
    masterVolume: document.getElementById('master-volume'),
    sfxVolume: document.getElementById('sfx-volume'),
    muteToggle: document.getElementById('mute-toggle'),
    shakeToggle: document.getElementById('shake-toggle'),
  };

  const STORAGE_KEY = 'neon-citadel-save-v1';
  const SETTINGS_KEY = 'neon-citadel-settings-v1';
  const BEST_KEY = 'neon-citadel-best-v1';

  const waves = [
    { chapter: 'Sector 1: Border', enemies: [['scout', 9], ['sniper', 2]], duration: 38 },
    { chapter: 'Sector 1: Border', enemies: [['scout', 12], ['charger', 4]], duration: 42 },
    { chapter: 'Sector 1: Border', enemies: [['scout', 12], ['sniper', 4], ['mine', 2]], duration: 48 },
    { chapter: 'Sector 2: Relay', enemies: [['charger', 8], ['sniper', 6], ['mine', 5]], duration: 52 },
    { chapter: 'Sector 2: Relay', enemies: [['scout', 16], ['warden', 3], ['mine', 6]], duration: 58 },
    { chapter: 'Sector 2: Relay', enemies: [['charger', 12], ['sniper', 8], ['warden', 4]], duration: 60 },
    { chapter: 'Sector 3: Rift', enemies: [['scout', 10], ['charger', 10], ['sniper', 10], ['mine', 8]], duration: 64 },
    { chapter: 'Sector 3: Rift', enemies: [['warden', 8], ['sniper', 12], ['mine', 10]], duration: 66 },
    { chapter: 'Sector 3: Rift', enemies: [['charger', 16], ['warden', 6], ['mine', 12]], duration: 68 },
    { chapter: 'Sector 4: Core Breach', enemies: [['sniper', 14], ['warden', 10], ['mine', 12]], duration: 72 },
    { chapter: 'Sector 4: Core Breach', enemies: [['charger', 18], ['warden', 10], ['mine', 16]], duration: 75 },
    { chapter: 'Sector 4: Core Breach', boss: true, enemies: [['boss', 1], ['sniper', 8], ['charger', 8]], duration: 120 },
  ];

  const enemyDefs = {
    scout: { hp: 34, speed: 110, radius: 10, color: '#79dbff', score: 60 },
    charger: { hp: 60, speed: 145, radius: 12, color: '#ff6e7f', score: 95 },
    sniper: { hp: 46, speed: 84, radius: 11, color: '#ffd46a', score: 80 },
    mine: { hp: 22, speed: 66, radius: 9, color: '#c68dff', score: 50 },
    warden: { hp: 120, speed: 62, radius: 15, color: '#9eff8d', score: 140 },
    boss: { hp: 1400, speed: 58, radius: 32, color: '#ff4f6d', score: 1800 },
  };

  const upgrades = [
    { id: 'power', title: 'Rail Amplifier', desc: '사격 피해량 +24%', apply: (p) => (p.damage *= 1.24) },
    { id: 'rapid', title: 'Pulse Overclock', desc: '연사 속도 +20%', apply: (p) => (p.fireDelay *= 0.8) },
    { id: 'dash', title: 'Blink Capacitor', desc: '대시 쿨다운 -22%', apply: (p) => (p.dashCooldown *= 0.78) },
    { id: 'regen', title: 'Repair Thread', desc: '웨이브 종료 시 체력 추가 회복', apply: (p) => (p.repairBonus += 12) },
    { id: 'magnet', title: 'Scrap Magnet', desc: '스크랩 획득 반경 +70%', apply: (p) => (p.pickupRange += 70) },
    { id: 'burst', title: 'Aftershock', desc: '처치 시 충격파 발생', apply: (p) => (p.aftershock += 1) },
  ];

  const settings = loadSettings();
  let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);

  const state = {
    mode: 'title',
    run: null,
    keys: new Set(),
    mouse: { x: canvas.width / 2, y: canvas.height / 2, down: false },
    particles: [],
    effects: [],
    shake: 0,
    noticeTimer: 0,
  };

  const audio = createAudio();
  syncSettingsUI();
  ui.bestScore.textContent = String(bestScore);
  showPanel('title-screen');
  wireMenus();

  let last = performance.now();
  requestAnimationFrame(loop);

  function createRun(fromSave = null) {
    const base = {
      player: {
        x: 480,
        y: 280,
        vx: 0,
        vy: 0,
        speed: 220,
        hp: 100,
        maxHp: 100,
        damage: 18,
        fireDelay: 0.18,
        fireTimer: 0,
        dashCooldown: 2.2,
        dashTimer: 0,
        invincible: 0,
        pickupRange: 90,
        repairBonus: 0,
        aftershock: 0,
      },
      wave: 0,
      waveTimer: 0,
      waveSpawn: [],
      enemies: [],
      shots: [],
      hostileShots: [],
      scraps: [],
      score: 0,
      combo: 1,
      comboTimer: 0,
      signal: 0,
      elapsed: 0,
      tutorialStage: 0,
      waveBreak: 0,
      difficulty: settings.difficulty,
      completed: false,
      upgradesTaken: 0,
    };

    if (fromSave) {
      return Object.assign(base, fromSave);
    }
    startWave(base);
    return base;
  }

  function difficultyScale() {
    if (settings.difficulty === 'story') return { enemy: 0.82, damageTaken: 0.75, scrap: 1.2 };
    if (settings.difficulty === 'hard') return { enemy: 1.22, damageTaken: 1.3, scrap: 0.92 };
    return { enemy: 1, damageTaken: 1, scrap: 1 };
  }

  function startWave(run) {
    const data = waves[run.wave];
    if (!data) {
      endRun(true);
      return;
    }
    run.waveTimer = data.duration;
    run.waveSpawn = [];
    data.enemies.forEach(([type, count]) => {
      for (let i = 0; i < count; i += 1) {
        run.waveSpawn.push({ type, t: Math.random() * data.duration * 0.8 + 4 });
      }
    });
    run.waveSpawn.sort((a, b) => b.t - a.t);
    run.chapter = data.chapter;
    run.waveBreak = 1.5;
    toast(`${run.chapter} - Wave ${run.wave + 1}`);
  }

  function spawnEnemy(run, type) {
    const edge = Math.floor(Math.random() * 4);
    const pad = 30;
    let x = 0;
    let y = 0;
    if (edge === 0) { x = -pad; y = Math.random() * canvas.height; }
    if (edge === 1) { x = canvas.width + pad; y = Math.random() * canvas.height; }
    if (edge === 2) { x = Math.random() * canvas.width; y = -pad; }
    if (edge === 3) { x = Math.random() * canvas.width; y = canvas.height + pad; }

    const def = enemyDefs[type];
    const scale = difficultyScale().enemy;
    run.enemies.push({
      type,
      x,
      y,
      hp: def.hp * scale,
      maxHp: def.hp * scale,
      speed: def.speed * (type === 'boss' ? 1 : 0.92 + Math.random() * 0.16),
      radius: def.radius,
      cool: 0.7 + Math.random() * 1.1,
      pulse: 0,
    });
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    if (state.mode === 'playing') {
      update(dt);
      render();
    } else {
      renderBackground(now * 0.001);
    }

    if (state.noticeTimer > 0) {
      state.noticeTimer -= dt;
      if (state.noticeTimer <= 0) ui.notice.classList.remove('show');
    }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const run = state.run;
    const p = run.player;
    run.elapsed += dt;

    if (run.waveBreak > 0) run.waveBreak -= dt;

    const mvX = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0);
    const mvY = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0);
    const mag = Math.hypot(mvX, mvY) || 1;
    p.vx = (mvX / mag) * p.speed;
    p.vy = (mvY / mag) * p.speed;

    p.x = clamp(p.x + p.vx * dt, 16, canvas.width - 16);
    p.y = clamp(p.y + p.vy * dt, 16, canvas.height - 16);
    p.fireTimer -= dt;
    p.dashTimer -= dt;
    p.invincible -= dt;

    if (state.mouse.down && p.fireTimer <= 0) {
      shoot(run);
      p.fireTimer = p.fireDelay;
    }

    run.waveTimer -= dt;
    while (run.waveSpawn.length && run.waveSpawn[run.waveSpawn.length - 1].t >= run.waveTimer) {
      spawnEnemy(run, run.waveSpawn.pop().type);
    }

    run.shots.forEach((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    });
    run.shots = run.shots.filter((s) => s.life > 0 && s.x > -20 && s.x < canvas.width + 20 && s.y > -20 && s.y < canvas.height + 20);

    run.hostileShots.forEach((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    });
    run.hostileShots = run.hostileShots.filter((s) => s.life > 0);

    run.enemies.forEach((e) => {
      e.pulse += dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (e.type === 'sniper') {
        const desired = d > 220 ? 1 : -1;
        e.x += (dx / d) * e.speed * desired * 0.7 * dt;
        e.y += (dy / d) * e.speed * desired * 0.7 * dt;
        e.cool -= dt;
        if (e.cool <= 0) {
          e.cool = 1.3;
          const b = unit(dx, dy);
          run.hostileShots.push({ x: e.x, y: e.y, vx: b.x * 230, vy: b.y * 230, life: 4, damage: 11 });
          audio.sfx('enemyShot');
        }
      } else if (e.type === 'mine') {
        e.x += (dx / d) * e.speed * 0.45 * dt;
        e.y += (dy / d) * e.speed * 0.45 * dt;
      } else {
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }

      if (e.type === 'boss') {
        e.cool -= dt;
        if (e.cool <= 0) {
          e.cool = 0.9;
          for (let i = 0; i < 10; i += 1) {
            const ang = (Math.PI * 2 * i) / 10 + run.elapsed;
            run.hostileShots.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 180, vy: Math.sin(ang) * 180, life: 6, damage: 13 });
          }
          audio.sfx('danger');
          shake(3);
        }
      }
    });

    collisions(run);
    pickupScrap(run, dt);

    if (run.waveTimer <= 0 && run.waveSpawn.length === 0 && run.enemies.length === 0) {
      run.wave += 1;
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + 12 + run.player.repairBonus);
      run.signal = Math.min(100, run.signal + 8);
      if (run.wave >= waves.length) {
        endRun(true);
        return;
      }
      saveRun();
      if (run.wave % 2 === 0) {
        showUpgradeChoices();
      } else {
        startWave(run);
      }
    }

    run.comboTimer -= dt;
    if (run.comboTimer <= 0) run.combo = 1;

    state.particles.forEach((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    });
    state.particles = state.particles.filter((pt) => pt.life > 0);

    state.shake *= 0.86;

    updateHUD();

    if (run.player.hp <= 0) endRun(false);
  }

  function collisions(run) {
    const p = run.player;
    const scale = difficultyScale().damageTaken;

    run.shots.forEach((shot) => {
      run.enemies.forEach((e) => {
        if (dist(shot, e) < e.radius + 4 && shot.life > 0) {
          shot.life = 0;
          e.hp -= p.damage;
          spark(e.x, e.y, '#7ee8ff', 5);
          audio.sfx('hit');
          if (e.hp <= 0) {
            const def = enemyDefs[e.type];
            run.score += Math.floor(def.score * run.combo);
            run.combo = Math.min(5, run.combo + 0.18);
            run.comboTimer = 2.8;
            run.signal = Math.min(100, run.signal + (e.type === 'boss' ? 14 : 1.4));
            run.scraps.push({ x: e.x, y: e.y, v: 9 + Math.random() * 6, t: 8 });
            if (p.aftershock > 0) {
              run.enemies.forEach((o) => {
                if (dist(e, o) < 70) o.hp -= 14;
              });
              spark(e.x, e.y, '#74ff87', 10);
            }
            audio.sfx('kill');
            shake(2);
          }
        }
      });
    });

    run.enemies = run.enemies.filter((e) => e.hp > 0);

    run.hostileShots.forEach((b) => {
      if (dist(b, p) < 12 && p.invincible <= 0) {
        b.life = 0;
        p.hp -= b.damage * scale;
        p.invincible = 0.38;
        spark(p.x, p.y, '#ff6d86', 14);
        audio.sfx('hurt');
        shake(4);
      }
    });

    run.enemies.forEach((e) => {
      if (dist(e, p) < e.radius + 11 && p.invincible <= 0) {
        p.hp -= (e.type === 'boss' ? 18 : 10) * scale;
        p.invincible = 0.55;
        spark(p.x, p.y, '#ff4f6d', 12);
        audio.sfx('hurt');
        if (e.type === 'mine') e.hp = 0;
        shake(5);
      }
    });
  }

  function pickupScrap(run, dt) {
    const p = run.player;
    run.scraps.forEach((s) => {
      s.t -= dt;
      const d = dist(s, p);
      if (d < p.pickupRange) {
        const toward = unit(p.x - s.x, p.y - s.y);
        s.x += toward.x * 220 * dt;
        s.y += toward.y * 220 * dt;
      }
      if (d < 14) {
        s.t = -1;
        run.score += Math.floor(25 * difficultyScale().scrap);
        run.signal = Math.min(100, run.signal + 0.9);
        audio.sfx('pickup');
      }
    });
    run.scraps = run.scraps.filter((s) => s.t > 0);
  }

  function shoot(run) {
    const p = run.player;
    const to = unit(state.mouse.x - p.x, state.mouse.y - p.y);
    run.shots.push({ x: p.x, y: p.y, vx: to.x * 460, vy: to.y * 460, life: 1.2 });
    spark(p.x + to.x * 8, p.y + to.y * 8, '#a6fdff', 3);
    audio.sfx('shoot');
  }

  function dash() {
    if (state.mode !== 'playing') return;
    const run = state.run;
    const p = run.player;
    if (p.dashTimer > 0) return;
    const mvX = (state.keys.has('KeyD') || state.keys.has('ArrowRight') ? 1 : 0) - (state.keys.has('KeyA') || state.keys.has('ArrowLeft') ? 1 : 0);
    const mvY = (state.keys.has('KeyS') || state.keys.has('ArrowDown') ? 1 : 0) - (state.keys.has('KeyW') || state.keys.has('ArrowUp') ? 1 : 0);
    if (!mvX && !mvY) return;
    const n = unit(mvX, mvY);
    p.x = clamp(p.x + n.x * 120, 15, canvas.width - 15);
    p.y = clamp(p.y + n.y * 120, 15, canvas.height - 15);
    p.dashTimer = p.dashCooldown;
    p.invincible = 0.2;
    spark(p.x, p.y, '#8a7cff', 16);
    audio.sfx('dash');
    shake(2);
  }

  function render() {
    const run = state.run;
    renderBackground(run.elapsed);

    if (settings.shake && state.shake > 0.1) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    run.scraps.forEach((s) => {
      circle(s.x, s.y, 3.8, '#74ff87');
    });

    run.shots.forEach((s) => circle(s.x, s.y, 3, '#b2f8ff'));
    run.hostileShots.forEach((s) => circle(s.x, s.y, 4, '#ff8ea5'));

    run.enemies.forEach((e) => {
      circle(e.x, e.y, e.radius, enemyDefs[e.type].color);
      const hpRatio = e.hp / e.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2, 4);
      ctx.fillStyle = '#74ff87';
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2 * hpRatio, 4);
    });

    const p = run.player;
    const facing = Math.atan2(state.mouse.y - p.y, state.mouse.x - p.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(facing);
    ctx.fillStyle = p.invincible > 0 ? '#ffd0d8' : '#f0fbff';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    state.particles.forEach((pt) => {
      ctx.globalAlpha = Math.max(pt.life, 0);
      circle(pt.x, pt.y, pt.r, pt.c);
      ctx.globalAlpha = 1;
    });

    if (settings.shake && state.shake > 0.1) ctx.restore();

    if (run.wave === 11 && run.waveTimer < 15) {
      ctx.fillStyle = 'rgba(255,79,109,0.14)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (run.waveBreak > 0) {
      centerText(`Wave ${run.wave + 1}`, 40, '#ddf8ff');
    }
  }

  function renderBackground(t) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#070d18');
    grad.addColorStop(1, '#04060a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(56,245,255,0.09)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t + x * 0.02) * 2, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < 44; i += 1) {
      const x = (i * 97 + (t * 60) % canvas.width) % canvas.width;
      const y = (i * 57) % canvas.height;
      circle(x, y, 1.4, 'rgba(138,124,255,0.6)');
    }
  }

  function updateHUD() {
    const run = state.run;
    const p = run.player;
    ui.hpBar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    ui.hpText.textContent = `${Math.max(0, Math.round(p.hp))} / ${p.maxHp}`;
    ui.xpBar.style.width = `${run.signal}%`;
    ui.xpText.textContent = `${Math.round(run.signal)}%`;
    ui.waveText.textContent = `${Math.min(run.wave + 1, 12)} / 12`;
    ui.chapterText.textContent = run.chapter || 'Preparation';
    ui.scrapText.textContent = `${Math.floor(run.score)}`;
    ui.multiplierText.textContent = `Combo x${run.combo.toFixed(1)}`;
  }

  function endRun(victory) {
    const run = state.run;
    state.mode = 'result';
    deleteSave();
    if (run.score > bestScore) {
      bestScore = Math.floor(run.score);
      localStorage.setItem(BEST_KEY, String(bestScore));
      ui.bestScore.textContent = String(bestScore);
    }
    ui.endTitle.textContent = victory ? 'Signal Restored' : 'Signal Lost';
    ui.endSummary.textContent = victory
      ? '코어 복구에 성공했습니다. 시타델 전 구역의 전력이 복원됩니다.'
      : '회로가 붕괴되었습니다. 빌드를 조정해 다시 도전하세요.';
    ui.endScore.textContent = Math.floor(run.score);
    ui.endWave.textContent = run.wave + 1;
    ui.endTime.textContent = formatTime(run.elapsed);
    showPanel('end-screen');
    audio.sfx(victory ? 'win' : 'lose');
  }

  function showUpgradeChoices() {
    state.mode = 'upgrade';
    const run = state.run;
    const pool = shuffle([...upgrades]).slice(0, 3);
    ui.upgradeList.innerHTML = '';
    pool.forEach((u) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade';
      btn.innerHTML = `<strong>${u.title}</strong><br><span>${u.desc}</span>`;
      btn.addEventListener('click', () => {
        u.apply(run.player);
        run.upgradesTaken += 1;
        state.mode = 'playing';
        overlay.classList.remove('active');
        saveRun();
        startWave(run);
        audio.sfx('upgrade');
      });
      ui.upgradeList.appendChild(btn);
    });
    showPanel('upgrade-screen');
  }

  function showPanel(id) {
    overlay.classList.add('active');
    panels.forEach((p) => p.classList.toggle('active', p.id === id));
    const firstBtn = document.querySelector(`#${id} button, #${id} a, #${id} select, #${id} input`);
    if (firstBtn) firstBtn.focus();
    const continueBtn = document.querySelector('[data-action="continue"]');
    if (continueBtn) continueBtn.disabled = !localStorage.getItem(STORAGE_KEY);
  }

  function startRun(fromSave = false) {
    state.run = fromSave ? createRun(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')) : createRun();
    state.mode = 'playing';
    overlay.classList.remove('active');
    audio.sfx('start');
  }

  function saveRun() {
    if (!state.run) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.run));
  }

  function deleteSave() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function wireMenus() {
    document.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (!action) return;
      if (action === 'new') startRun(false);
      if (action === 'continue') startRun(true);
      if (action === 'options') showPanel('options-screen');
      if (action === 'credits') showPanel('credits-screen');
      if (action === 'back-title') showPanel('title-screen');
      if (action === 'resume') {
        state.mode = 'playing';
        overlay.classList.remove('active');
      }
      if (action === 'restart') startRun(false);
      if (action === 'to-title') {
        state.mode = 'title';
        showPanel('title-screen');
      }
    });

    document.addEventListener('keydown', (e) => {
      state.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        dash();
      }
      if (e.code === 'Escape') {
        if (state.mode === 'playing') {
          state.mode = 'paused';
          saveRun();
          showPanel('pause-screen');
        } else if (state.mode === 'paused') {
          state.mode = 'playing';
          overlay.classList.remove('active');
        }
      }
    });

    document.addEventListener('keyup', (e) => state.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      state.mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => {
      state.mouse.down = true;
      audio.resume();
    });
    window.addEventListener('mouseup', () => {
      state.mouse.down = false;
    });

    ui.difficulty.addEventListener('change', () => {
      settings.difficulty = ui.difficulty.value;
      persistSettings();
    });
    ui.masterVolume.addEventListener('input', () => {
      settings.master = Number(ui.masterVolume.value);
      persistSettings();
    });
    ui.sfxVolume.addEventListener('input', () => {
      settings.sfx = Number(ui.sfxVolume.value);
      persistSettings();
    });
    ui.muteToggle.addEventListener('change', () => {
      settings.mute = ui.muteToggle.checked;
      persistSettings();
    });
    ui.shakeToggle.addEventListener('change', () => {
      settings.shake = ui.shakeToggle.checked;
      persistSettings();
    });
  }

  function createAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = Ctx ? new Ctx() : null;
    const master = ac ? ac.createGain() : null;
    if (ac && master) {
      master.connect(ac.destination);
      master.gain.value = 0.5;
    }
    const tones = {
      shoot: [440, 0.04, 'square'],
      hit: [660, 0.03, 'triangle'],
      kill: [300, 0.06, 'sawtooth'],
      dash: [220, 0.08, 'sine'],
      hurt: [140, 0.1, 'sawtooth'],
      pickup: [880, 0.03, 'triangle'],
      upgrade: [520, 0.2, 'sine'],
      win: [740, 0.32, 'triangle'],
      lose: [110, 0.3, 'sawtooth'],
      start: [600, 0.08, 'triangle'],
      enemyShot: [170, 0.05, 'square'],
      danger: [95, 0.18, 'square'],
    };

    return {
      resume() {
        if (ac && ac.state === 'suspended') ac.resume();
      },
      sfx(name) {
        if (!ac || settings.mute) return;
        const t = tones[name];
        if (!t) return;
        const [freq, dur, wave] = t;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        gain.gain.value = settings.master * settings.sfx * 0.08;
        osc.connect(gain);
        gain.connect(master);
        const now = ac.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.start(now);
        osc.stop(now + dur);
      },
    };
  }

  function syncSettingsUI() {
    ui.difficulty.value = settings.difficulty;
    ui.masterVolume.value = settings.master;
    ui.sfxVolume.value = settings.sfx;
    ui.muteToggle.checked = settings.mute;
    ui.shakeToggle.checked = settings.shake;
  }

  function loadSettings() {
    const base = { difficulty: 'normal', master: 0.75, sfx: 0.8, mute: false, shake: true };
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return Object.assign(base, raw);
    } catch {
      return base;
    }
  }

  function persistSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function toast(text) {
    ui.notice.textContent = text;
    ui.notice.classList.add('show');
    state.noticeTimer = 2;
  }

  function circle(x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function spark(x, y, c, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        life: 0.25 + Math.random() * 0.35,
        c,
        r: 1 + Math.random() * 2,
      });
    }
  }

  function centerText(text, y, color) {
    ctx.fillStyle = color;
    ctx.font = '700 32px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, y);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function unit(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function formatTime(sec) {
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function shake(v) { if (settings.shake) state.shake = Math.min(12, state.shake + v); }
})();
