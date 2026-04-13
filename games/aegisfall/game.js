(() => {
  'use strict';

  const STORAGE_KEY = 'aegisfall-save-v1';
  const SETTINGS_KEY = 'aegisfall-settings-v1';
  const TWO_PI = Math.PI * 2;

  const DIFFICULTY = {
    story: { enemyHp: 0.8, enemyDamage: 0.75, spawn: 0.8, score: 0.9, coreRegen: 2.6 },
    normal: { enemyHp: 1, enemyDamage: 1, spawn: 1, score: 1, coreRegen: 1.8 },
    hard: { enemyHp: 1.3, enemyDamage: 1.25, spawn: 1.22, score: 1.3, coreRegen: 1.1 }
  };

  const CHAPTERS = [
    { name: 'PHASE 1 · APPROACH', until: 210, bg: '#121a2f' },
    { name: 'PHASE 2 · BREACH', until: 420, bg: '#1d1635' },
    { name: 'PHASE 3 · ONSLAUGHT', until: 600, bg: '#2f1123' },
    { name: 'FINAL · ECLIPSE CORE', until: 660, bg: '#391110' }
  ];

  const screenIds = ['titleScreen', 'optionsScreen', 'creditsScreen', 'pauseScreen', 'resultScreen'];
  const screens = Object.fromEntries(screenIds.map((id) => [id, document.getElementById(id)]));
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hud = document.getElementById('hud');
  const hpBar = document.getElementById('hpBar');
  const coreBar = document.getElementById('coreBar');
  const energyBar = document.getElementById('energyBar');
  const timerLabel = document.getElementById('timerLabel');
  const stageLabel = document.getElementById('stageLabel');
  const objectiveLabel = document.getElementById('objectiveLabel');
  const scoreLabel = document.getElementById('scoreLabel');
  const comboLabel = document.getElementById('comboLabel');
  const bestLabel = document.getElementById('bestLabel');
  const toast = document.getElementById('toast');

  const resultTitle = document.getElementById('resultTitle');
  const resultSummary = document.getElementById('resultSummary');
  const resultStats = document.getElementById('resultStats');
  const upgradeModal = document.getElementById('upgradeModal');
  const upgradeChoices = document.getElementById('upgradeChoices');

  const optionEls = {
    difficulty: document.getElementById('optDifficulty'),
    master: document.getElementById('optMaster'),
    sfx: document.getElementById('optSfx'),
    music: document.getElementById('optMusic'),
    reducedFx: document.getElementById('optReducedFx'),
    autoFire: document.getElementById('optAutoFire')
  };

  const optionValues = {
    master: document.getElementById('valMaster'),
    sfx: document.getElementById('valSfx'),
    music: document.getElementById('valMusic')
  };

  const state = {
    mode: 'title',
    running: false,
    paused: false,
    inUpgrade: false,
    elapsed: 0,
    spawnTimer: 0,
    pulseCd: 0,
    dashCd: 0,
    bossSpawned: false,
    comboTimer: 0,
    combo: 1,
    score: 0,
    kills: 0,
    coreHealBudget: 0,
    promptsShown: new Set(),
    savedProgress: null
  };

  const saveData = loadJson(STORAGE_KEY, { highScore: 0, bestTime: 0, wins: 0, runs: 0 });
  const settings = loadJson(SETTINGS_KEY, {
    difficulty: 'normal',
    master: 0.7,
    sfx: 0.8,
    music: 0.6,
    reducedFx: false,
    autoFire: false
  });

  const input = {
    keys: new Set(),
    mouse: { x: canvas.width / 2, y: canvas.height / 2, down: false }
  };

  const world = {
    player: null,
    core: null,
    enemies: [],
    bullets: [],
    enemyBullets: [],
    particles: [],
    upgrades: []
  };

  const audio = initAudio();

  setupUI();
  showScreen('titleScreen');
  render(0);
  requestAnimationFrame(loop);

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function setupUI() {
    document.getElementById('btnStart').addEventListener('click', () => startRun(false));
    document.getElementById('btnContinue').addEventListener('click', () => startRun(true));
    document.getElementById('btnOptions').addEventListener('click', () => openOptions('titleScreen'));
    document.getElementById('btnCredits').addEventListener('click', () => showScreen('creditsScreen'));
    document.getElementById('btnOptionsBack').addEventListener('click', closeOptions);
    document.getElementById('btnCreditsBack').addEventListener('click', () => showScreen('titleScreen'));
    document.getElementById('btnResume').addEventListener('click', resumeGame);
    document.getElementById('btnPauseOptions').addEventListener('click', () => openOptions('pauseScreen'));
    document.getElementById('btnQuit').addEventListener('click', quitToTitle);
    document.getElementById('btnReplay').addEventListener('click', () => startRun(false));
    document.getElementById('btnResultTitle').addEventListener('click', quitToTitle);
    document.getElementById('btnResetOptions').addEventListener('click', resetOptions);

    Object.entries(optionEls).forEach(([key, el]) => {
      el.addEventListener('input', () => {
        if (key === 'difficulty') settings.difficulty = el.value;
        if (key === 'master' || key === 'sfx' || key === 'music') settings[key] = Number(el.value) / 100;
        if (key === 'reducedFx' || key === 'autoFire') settings[key] = el.checked;
        refreshOptionLabels();
        persist();
      });
    });

    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Escape') {
        if (state.mode === 'playing') pauseGame();
        else if (state.mode === 'paused') resumeGame();
      }
      if (e.key.toLowerCase() === 'p' && state.mode === 'playing') pauseGame();
      if (state.mode === 'playing') input.keys.add(e.key.toLowerCase());
      if (state.inUpgrade && ['1', '2', '3'].includes(e.key)) chooseUpgrade(Number(e.key) - 1);
    });

    document.addEventListener('keyup', (e) => input.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      input.mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      input.mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => {
      input.mouse.down = true;
      audio.unlock();
    });
    document.addEventListener('mouseup', () => (input.mouse.down = false));

    applySettingsToInputs();
    refreshOptionLabels();
    updateBestHud();
  }

  function applySettingsToInputs() {
    optionEls.difficulty.value = settings.difficulty;
    optionEls.master.value = Math.round(settings.master * 100);
    optionEls.sfx.value = Math.round(settings.sfx * 100);
    optionEls.music.value = Math.round(settings.music * 100);
    optionEls.reducedFx.checked = settings.reducedFx;
    optionEls.autoFire.checked = settings.autoFire;
  }

  function refreshOptionLabels() {
    optionValues.master.textContent = `${Math.round(settings.master * 100)}%`;
    optionValues.sfx.textContent = `${Math.round(settings.sfx * 100)}%`;
    optionValues.music.textContent = `${Math.round(settings.music * 100)}%`;
  }

  function openOptions(backTo) {
    screens.optionsScreen.dataset.returnTo = backTo;
    showScreen('optionsScreen');
  }

  function closeOptions() {
    const backTo = screens.optionsScreen.dataset.returnTo || 'titleScreen';
    showScreen(backTo);
  }

  function resetOptions() {
    Object.assign(settings, { difficulty: 'normal', master: 0.7, sfx: 0.8, music: 0.6, reducedFx: false, autoFire: false });
    applySettingsToInputs();
    refreshOptionLabels();
    persist();
    notify('옵션이 기본값으로 재설정되었습니다.');
  }

  function showScreen(id) {
    screenIds.forEach((key) => screens[key].classList.remove('active'));
    if (id && screens[id]) screens[id].classList.add('active');
    state.mode = id === 'pauseScreen' ? 'paused' : (id ? id.replace('Screen', '').toLowerCase() : 'playing');

    const focusBtn = screens[id]?.querySelector('button:not([hidden])');
    if (focusBtn) focusBtn.focus();
  }

  function startRun(fromContinue) {
    audio.unlock();
    resetWorld();
    saveData.runs += 1;
    persist();

    if (fromContinue && state.savedProgress) {
      Object.assign(state, structuredClone(state.savedProgress.state));
      Object.assign(world.player, state.savedProgress.player);
      Object.assign(world.core, state.savedProgress.core);
    }

    hud.classList.add('visible');
    hideAllScreens();
    state.mode = 'playing';
    state.running = true;
    state.paused = false;
    state.inUpgrade = false;
    upgradeModal.classList.remove('active');
    notify('작전 개시: 코어를 방어하고 11분을 버텨라.');
  }

  function resetWorld() {
    world.player = {
      x: canvas.width / 2,
      y: canvas.height / 2 + 80,
      vx: 0,
      vy: 0,
      radius: 13,
      hp: 100,
      maxHp: 100,
      energy: 100,
      maxEnergy: 100,
      fireRate: 0.22,
      shotCd: 0,
      bulletDamage: 18,
      bulletSpeed: 440,
      moveSpeed: 220,
      dashPower: 260,
      pulsePower: 110,
      lifesteal: 0,
      shield: 0,
      pierce: 0
    };
    world.core = { x: canvas.width / 2, y: canvas.height / 2, radius: 32, hp: 160, maxHp: 160 };
    world.enemies.length = 0;
    world.bullets.length = 0;
    world.enemyBullets.length = 0;
    world.particles.length = 0;

    Object.assign(state, {
      elapsed: 0, spawnTimer: 0, pulseCd: 0, dashCd: 0, bossSpawned: false,
      comboTimer: 0, combo: 1, score: 0, kills: 0, coreHealBudget: 0,
      promptsShown: new Set(), savedProgress: null
    });
  }

  function hideAllScreens() {
    screenIds.forEach((key) => screens[key].classList.remove('active'));
  }

  function pauseGame() {
    if (!state.running || state.inUpgrade) return;
    state.paused = true;
    state.mode = 'paused';
    state.savedProgress = {
      state: { ...state, promptsShown: [...state.promptsShown] },
      player: { ...world.player },
      core: { ...world.core }
    };
    state.savedProgress.state.promptsShown = new Set(state.savedProgress.state.promptsShown);
    showScreen('pauseScreen');
    document.getElementById('btnContinue').hidden = false;
  }

  function resumeGame() {
    if (!state.running) return;
    hideAllScreens();
    state.paused = false;
    state.mode = 'playing';
  }

  function quitToTitle() {
    state.running = false;
    state.paused = false;
    hud.classList.remove('visible');
    showScreen('titleScreen');
    updateBestHud();
  }

  function loop(ts) {
    const now = ts / 1000;
    const dt = Math.min(0.033, now - (loop.last || now));
    loop.last = now;

    if (state.running && !state.paused && state.mode === 'playing' && !state.inUpgrade) {
      update(dt);
    }
    render(dt);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const diff = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    state.elapsed += dt;

    if (state.elapsed >= 660 && world.enemies.length === 0) return endRun(true);

    handlePlayer(dt);
    spawnEnemies(dt, diff);
    updateEnemies(dt, diff);
    updateBullets(dt, diff);
    updateParticles(dt);

    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 1;
    state.pulseCd = Math.max(0, state.pulseCd - dt);
    state.dashCd = Math.max(0, state.dashCd - dt);

    if (state.elapsed > 12 && !state.promptsShown.has('dash')) {
      notify('Shift 대시로 밀집 구간을 탈출하세요.');
      state.promptsShown.add('dash');
    }
    if (state.elapsed > 30 && !state.promptsShown.has('pulse')) {
      notify('Space 펄스로 적탄을 지우고 밀쳐내세요.');
      state.promptsShown.add('pulse');
    }

    if (Math.floor(state.elapsed) % 60 === 0 && Math.floor((state.elapsed - dt)) % 60 !== 0 && state.elapsed < 600) {
      openUpgrade();
    }

    if (world.player.hp <= 0 || world.core.hp <= 0) endRun(false);

    updateHud(diff);
  }

  function handlePlayer(dt) {
    const p = world.player;
    let ax = 0;
    let ay = 0;
    if (input.keys.has('w')) ay -= 1;
    if (input.keys.has('s')) ay += 1;
    if (input.keys.has('a')) ax -= 1;
    if (input.keys.has('d')) ax += 1;

    const len = Math.hypot(ax, ay) || 1;
    p.vx = (ax / len) * p.moveSpeed;
    p.vy = (ay / len) * p.moveSpeed;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, 18, canvas.width - 18);
    p.y = clamp(p.y, 18, canvas.height - 18);

    p.energy = clamp(p.energy + 26 * dt, 0, p.maxEnergy);
    p.shotCd = Math.max(0, p.shotCd - dt);

    const wantFire = input.mouse.down || settings.autoFire;
    if (wantFire && p.shotCd <= 0) firePlayer();

    if (input.keys.has('shift') && state.dashCd <= 0 && p.energy >= 28) {
      const dx = input.mouse.x - p.x;
      const dy = input.mouse.y - p.y;
      const dlen = Math.hypot(dx, dy) || 1;
      p.x += (dx / dlen) * p.dashPower * dt * 2.1;
      p.y += (dy / dlen) * p.dashPower * dt * 2.1;
      p.energy -= 28;
      state.dashCd = 1.8;
      explode(p.x, p.y, 10, '#79f9ff');
      audio.play('dash');
      input.keys.delete('shift');
    }

    if (input.keys.has(' ') && state.pulseCd <= 0 && p.energy >= 40) {
      state.pulseCd = 6;
      p.energy -= 40;
      for (const e of world.enemies) {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist < p.pulsePower + e.radius) {
          e.vx += (e.x - p.x) * 2.5;
          e.vy += (e.y - p.y) * 2.5;
          e.hp -= 25;
        }
      }
      world.enemyBullets = world.enemyBullets.filter((b) => Math.hypot(b.x - p.x, b.y - p.y) > p.pulsePower);
      explode(p.x, p.y, 24, '#a988ff');
      audio.play('pulse');
      input.keys.delete(' ');
    }
  }

  function spawnEnemies(dt, diff) {
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;

    const chapter = getChapter();
    const baseDelay = chapter === 0 ? 1.1 : chapter === 1 ? 0.88 : chapter === 2 ? 0.72 : 0.55;
    state.spawnTimer = baseDelay / diff.spawn;

    const count = chapter === 0 ? 1 : chapter === 1 ? 2 : chapter === 2 ? 3 : 2;
    for (let i = 0; i < count; i++) world.enemies.push(makeEnemy(chapter, diff));

    if (!state.bossSpawned && state.elapsed > 600) {
      state.bossSpawned = true;
      world.enemies.push(makeBoss(diff));
      notify('ECLIPSE TITAN 출현! 코어를 사수하라!');
      audio.play('warning');
    }
  }

  function makeEnemy(chapter, diff) {
    const side = Math.floor(Math.random() * 4);
    const pad = 30;
    const pos = [
      { x: Math.random() * canvas.width, y: -pad },
      { x: canvas.width + pad, y: Math.random() * canvas.height },
      { x: Math.random() * canvas.width, y: canvas.height + pad },
      { x: -pad, y: Math.random() * canvas.height }
    ][side];

    const variants = [
      { type: 'drone', hp: 36, speed: 82, radius: 12, color: '#6fa5ff', damage: 10, score: 14 },
      { type: 'charger', hp: 54, speed: 112, radius: 11, color: '#ff7f8f', damage: 14, score: 20 },
      { type: 'sniper', hp: 48, speed: 64, radius: 13, color: '#d0a3ff', damage: 12, score: 18 }
    ];

    const pick = chapter === 0 ? variants[0] : chapter === 1 ? variants[Math.random() < 0.65 ? 0 : 1] : variants[Math.floor(Math.random() * variants.length)];
    return {
      ...pos,
      ...pick,
      hp: pick.hp * diff.enemyHp,
      maxHp: pick.hp * diff.enemyHp,
      fireCd: 1.4 + Math.random(),
      vx: 0,
      vy: 0,
      isBoss: false
    };
  }

  function makeBoss(diff) {
    return {
      x: canvas.width / 2,
      y: -80,
      type: 'boss',
      hp: 1600 * diff.enemyHp,
      maxHp: 1600 * diff.enemyHp,
      speed: 45,
      radius: 56,
      color: '#ff5f5f',
      damage: 24,
      score: 900,
      fireCd: 1,
      vx: 0,
      vy: 0,
      isBoss: true,
      phase: 0
    };
  }

  function updateEnemies(dt, diff) {
    const p = world.player;
    for (const e of world.enemies) {
      const target = Math.random() < 0.35 ? world.core : p;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      e.vx = (dx / len) * e.speed;
      e.vy = (dy / len) * e.speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.fireCd -= dt;

      if (e.type === 'sniper' && e.fireCd <= 0) {
        e.fireCd = 2.3;
        shootEnemy(e, target, 180);
      }
      if (e.isBoss && e.fireCd <= 0) {
        e.fireCd = 1.1;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TWO_PI + state.elapsed * 0.4;
          world.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, radius: 5, damage: 9 * diff.enemyDamage });
        }
        audio.play('warning');
      }

      const hitPlayer = Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius;
      if (hitPlayer) {
        damagePlayer(e.damage * diff.enemyDamage, e.x, e.y);
        e.hp -= 30;
      }
      const hitCore = Math.hypot(e.x - world.core.x, e.y - world.core.y) < e.radius + world.core.radius;
      if (hitCore) {
        world.core.hp -= e.damage * diff.enemyDamage * 0.9;
        e.hp = 0;
        explode(e.x, e.y, 11, '#ff5577');
      }
    }

    world.enemies = world.enemies.filter((e) => {
      if (e.hp > 0) return true;
      onEnemyDefeat(e, diff);
      return false;
    });

    world.core.hp = clamp(world.core.hp + diff.coreRegen * dt + state.coreHealBudget * dt, 0, world.core.maxHp);
  }

  function shootEnemy(e, target, speed) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    world.enemyBullets.push({
      x: e.x,
      y: e.y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      radius: 5,
      damage: e.damage
    });
    audio.play('enemyShot');
  }

  function onEnemyDefeat(e, diff) {
    state.kills += 1;
    state.combo = clamp(state.combo + (e.isBoss ? 0.8 : 0.06), 1, 5.5);
    state.comboTimer = 2.8;
    state.score += Math.round(e.score * state.combo * diff.score);
    world.player.hp = clamp(world.player.hp + world.player.lifesteal, 0, world.player.maxHp);
    explode(e.x, e.y, e.isBoss ? 42 : 13, e.color);
    audio.play(e.isBoss ? 'bossDown' : 'kill');
  }

  function updateBullets(dt, diff) {
    for (const b of world.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const e of world.enemies) {
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.radius + e.radius) {
          e.hp -= b.damage;
          if (b.pierce > 0) b.pierce -= 1;
          else b.life = 0;
          explode(b.x, b.y, 5, '#79f9ff');
          break;
        }
      }
    }
    world.bullets = world.bullets.filter((b) => b.life > 0 && b.x > -20 && b.y > -20 && b.x < canvas.width + 20 && b.y < canvas.height + 20);

    for (const b of world.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (Math.hypot(b.x - world.player.x, b.y - world.player.y) < b.radius + world.player.radius) {
        damagePlayer(b.damage * diff.enemyDamage, b.x, b.y);
        b.life = -1;
      } else if (Math.hypot(b.x - world.core.x, b.y - world.core.y) < b.radius + world.core.radius) {
        world.core.hp -= b.damage * diff.enemyDamage;
        b.life = -1;
        explode(b.x, b.y, 6, '#ff5577');
      }
    }
    world.enemyBullets = world.enemyBullets.filter((b) => b.life !== -1 && b.x > -40 && b.y > -40 && b.x < canvas.width + 40 && b.y < canvas.height + 40);
  }

  function damagePlayer(amount, x, y) {
    const reduced = Math.max(1, amount - world.player.shield);
    world.player.hp -= reduced;
    explode(x, y, 9, '#ff5577');
    audio.play('hurt');
  }

  function firePlayer() {
    const p = world.player;
    const dx = input.mouse.x - p.x;
    const dy = input.mouse.y - p.y;
    const len = Math.hypot(dx, dy) || 1;

    world.bullets.push({
      x: p.x,
      y: p.y,
      vx: (dx / len) * p.bulletSpeed,
      vy: (dy / len) * p.bulletSpeed,
      radius: 4,
      damage: p.bulletDamage,
      life: 1.4,
      pierce: p.pierce
    });
    p.shotCd = p.fireRate;
    audio.play('shot');
  }

  function openUpgrade() {
    state.inUpgrade = true;
    state.paused = true;
    upgradeChoices.innerHTML = '';

    const pool = [
      { name: 'Reactive Plating', desc: '최대 HP +20, 방어 +1', apply: () => { world.player.maxHp += 20; world.player.hp += 20; world.player.shield += 1; } },
      { name: 'Overclock Coil', desc: '공격 속도 +15%, 탄속 +12%', apply: () => { world.player.fireRate *= 0.85; world.player.bulletSpeed *= 1.12; } },
      { name: 'Pulse Matrix', desc: '펄스 반경 +25, 펄스 쿨다운 -1초', apply: () => { world.player.pulsePower += 25; state.pulseCd = Math.max(0, state.pulseCd - 1); } },
      { name: 'Core Nanites', desc: '코어 재생량 증가', apply: () => { state.coreHealBudget += 1.1; } },
      { name: 'Lifedrain Shell', desc: '적 처치 시 HP +1.6 회복', apply: () => { world.player.lifesteal += 1.6; } },
      { name: 'Pierce Vector', desc: '탄환 관통 +1, 공격력 +4', apply: () => { world.player.pierce += 1; world.player.bulletDamage += 4; } }
    ];

    const picks = shuffle(pool).slice(0, 3);
    world.upgrades = picks;

    picks.forEach((up, i) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade';
      btn.innerHTML = `<strong>${i + 1}. ${up.name}</strong><span>${up.desc}</span>`;
      btn.addEventListener('click', () => chooseUpgrade(i));
      upgradeChoices.appendChild(btn);
    });

    upgradeModal.classList.add('active');
    upgradeChoices.querySelector('button')?.focus();
    audio.play('upgrade');
  }

  function chooseUpgrade(index) {
    if (!state.inUpgrade) return;
    const pick = world.upgrades[index];
    if (!pick) return;
    pick.apply();
    notify(`업그레이드 적용: ${pick.name}`);
    upgradeModal.classList.remove('active');
    state.inUpgrade = false;
    state.paused = false;
  }

  function updateParticles(dt) {
    if (settings.reducedFx) {
      world.particles.length = 0;
      return;
    }
    for (const p of world.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    world.particles = world.particles.filter((p) => p.life > 0);
  }

  function explode(x, y, amount, color) {
    if (settings.reducedFx) return;
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * TWO_PI;
      const s = 25 + Math.random() * 110;
      world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.6, color });
    }
  }

  function getChapter() {
    if (state.elapsed < CHAPTERS[0].until) return 0;
    if (state.elapsed < CHAPTERS[1].until) return 1;
    if (state.elapsed < CHAPTERS[2].until) return 2;
    return 3;
  }

  function updateHud() {
    hpBar.style.width = `${(world.player.hp / world.player.maxHp) * 100}%`;
    coreBar.style.width = `${(world.core.hp / world.core.maxHp) * 100}%`;
    energyBar.style.width = `${(world.player.energy / world.player.maxEnergy) * 100}%`;

    const remain = Math.max(0, 660 - state.elapsed);
    const m = Math.floor(remain / 60);
    const s = Math.floor(remain % 60).toString().padStart(2, '0');
    timerLabel.textContent = `${m}:${s}`;
    const chapter = CHAPTERS[getChapter()];
    stageLabel.textContent = chapter.name;

    objectiveLabel.textContent = state.elapsed < 600
      ? '코어를 지키고 업그레이드로 빌드를 완성하세요.'
      : '최종 보스를 격파하고 생존을 완수하세요.';

    scoreLabel.textContent = `Score ${Math.round(state.score)}`;
    comboLabel.textContent = `Combo x${state.combo.toFixed(1)}`;
  }

  function render() {
    const chapter = CHAPTERS[getChapter()];
    ctx.fillStyle = chapter.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawCore();
    drawPlayer();
    drawEnemies();
    drawBullets();
    drawParticles();

    if (state.mode !== 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 194, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCore() {
    const c = world.core;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = 'rgba(169,136,255,0.15)';
    ctx.beginPath();
    ctx.arc(0, 0, c.radius + 22 + Math.sin(state.elapsed * 1.5) * 3, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#a988ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, c.radius, 0, TWO_PI);
    ctx.stroke();
    ctx.fillStyle = '#ddd2ff';
    ctx.beginPath();
    ctx.arc(0, 0, c.radius * 0.5, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const p = world.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
    ctx.rotate(angle);
    ctx.fillStyle = '#79f9ff';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of world.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-e.radius, -e.radius - 9, e.radius * 2, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-e.radius, -e.radius - 9, (e.hp / e.maxHp) * e.radius * 2, 4);
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.fillStyle = '#79f9ff';
    for (const b of world.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TWO_PI);
      ctx.fill();
    }
    ctx.fillStyle = '#ff8aa0';
    for (const b of world.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TWO_PI);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of world.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function endRun(victory) {
    state.running = false;
    hud.classList.remove('visible');

    const survived = Math.round(state.elapsed);
    saveData.highScore = Math.max(saveData.highScore, Math.round(state.score));
    saveData.bestTime = Math.max(saveData.bestTime, survived);
    if (victory) saveData.wins += 1;
    persist();

    resultTitle.textContent = victory ? 'MISSION COMPLETE' : 'OPERATION FAILED';
    resultSummary.textContent = victory
      ? '궤도 요새를 재점등하는 데 성공했습니다.'
      : '요새 방어선이 붕괴되었습니다. 빌드를 조정해 재도전하세요.';

    resultStats.innerHTML = '';
    const stats = [
      `Score: ${Math.round(state.score)}`,
      `Survival: ${survived}s`,
      `Kills: ${state.kills}`,
      `Best Score: ${saveData.highScore}`,
      `Best Survival: ${saveData.bestTime}s`,
      `Total Wins: ${saveData.wins}`
    ];
    stats.forEach((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      resultStats.appendChild(span);
    });

    showScreen('resultScreen');
    updateBestHud();
    audio.play(victory ? 'victory' : 'defeat');
  }

  function updateBestHud() {
    bestLabel.textContent = `Best ${saveData.highScore}`;
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function initAudio() {
    let ctxAudio = null;
    let unlocked = false;

    const tones = {
      shot: [540, 0.03, 'square'],
      hurt: [180, 0.09, 'sawtooth'],
      kill: [760, 0.05, 'triangle'],
      dash: [310, 0.06, 'triangle'],
      pulse: [260, 0.15, 'sine'],
      warning: [130, 0.2, 'sawtooth'],
      enemyShot: [260, 0.04, 'square'],
      upgrade: [680, 0.12, 'sine'],
      victory: [520, 0.35, 'triangle'],
      defeat: [120, 0.45, 'sawtooth'],
      bossDown: [880, 0.2, 'triangle']
    };

    function ensure() {
      if (!ctxAudio) ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
      return ctxAudio;
    }

    function play(name) {
      if (!unlocked || settings.master <= 0 || settings.sfx <= 0) return;
      const conf = tones[name];
      if (!conf) return;
      const [freq, dur, type] = conf;
      const c = ensure();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, settings.master * settings.sfx * 0.08), c.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur + 0.01);
    }

    return {
      unlock() {
        unlocked = true;
        ensure().resume();
      },
      play
    };
  }
})();
