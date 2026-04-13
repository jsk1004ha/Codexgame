(() => {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  const hud = {
    hpBar: document.getElementById("hp-bar"),
    hpText: document.getElementById("hp-text"),
    staminaBar: document.getElementById("stamina-bar"),
    staminaText: document.getElementById("stamina-text"),
    wave: document.getElementById("wave-text"),
    phase: document.getElementById("phase-text"),
    time: document.getElementById("time-text"),
    chips: document.getElementById("chips-text"),
    objective: document.getElementById("objective-text"),
    threat: document.getElementById("threat-text"),
    toast: document.getElementById("toast"),
    best: document.getElementById("best-run-text")
  };

  const overlays = {
    title: document.getElementById("title-screen"),
    options: document.getElementById("options-screen"),
    credits: document.getElementById("credits-screen"),
    pause: document.getElementById("pause-screen"),
    result: document.getElementById("result-screen"),
    upgrade: document.getElementById("upgrade-screen")
  };

  const buttons = {
    cont: document.getElementById("btn-continue"),
    fresh: document.getElementById("btn-new"),
    options: document.getElementById("btn-options"),
    credits: document.getElementById("btn-credits"),
    optionsBack: document.getElementById("btn-options-back"),
    creditsBack: document.getElementById("btn-credits-back"),
    resetSave: document.getElementById("btn-reset-save"),
    resume: document.getElementById("btn-resume"),
    restart: document.getElementById("btn-restart"),
    pauseOptions: document.getElementById("btn-pause-options"),
    quit: document.getElementById("btn-quit"),
    replay: document.getElementById("btn-replay"),
    resultMenu: document.getElementById("btn-result-menu")
  };

  const optionsForm = {
    difficulty: document.getElementById("difficulty"),
    master: document.getElementById("master-volume"),
    sfx: document.getElementById("sfx-volume"),
    mute: document.getElementById("mute-toggle"),
    reducedFlash: document.getElementById("reduced-flash"),
    largeText: document.getElementById("large-text"),
    assist: document.getElementById("assist-mode")
  };

  const resultTitle = document.getElementById("result-title");
  const resultSummary = document.getElementById("result-summary");
  const resultStats = document.getElementById("result-stats");
  const upgradeList = document.getElementById("upgrade-list");
  const upgradeCaption = document.getElementById("upgrade-caption");

  const KEYMAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    a: "left",
    s: "down",
    d: "right"
  };

  const difficultyConfig = {
    story: { damageTaken: 0.72, enemyHp: 0.88, spawnRate: 0.9, chipBonus: 1.15 },
    normal: { damageTaken: 1, enemyHp: 1, spawnRate: 1, chipBonus: 1 },
    hard: { damageTaken: 1.28, enemyHp: 1.2, spawnRate: 1.18, chipBonus: 1.08 }
  };

  const phaseTimeline = [
    { name: "I · 로비", start: 900, end: 690, tint: "#3a1f24", objective: "감시 드론을 피해 입구 토큰 3개 확보" },
    { name: "II · 테이블 홀", start: 690, end: 450, tint: "#2f1d33", objective: "위험 배당 터미널 2회 해킹으로 배수 상승" },
    { name: "III · 볼트 링", start: 450, end: 180, tint: "#20273d", objective: "보안 기둥 파괴 후 코어 셔터 개방" },
    { name: "IV · 하우스 코어", start: 180, end: 0, tint: "#3f171f", objective: "하우스 AI 보스를 붕괴시키고 탈출" }
  ];

  const upgradePool = [
    { id: "blade", name: "유리날 강화", desc: "기본 공격 피해 +18%", apply: (g) => (g.player.attackPower *= 1.18) },
    { id: "dash", name: "브레이크 대시", desc: "대시 쿨다운 -25%", apply: (g) => (g.player.dashCooldown *= 0.75) },
    { id: "interest", name: "배당 회수", desc: "처치 칩 획득 +30%", apply: (g) => (g.meta.chipGain *= 1.3) },
    { id: "barrier", name: "담보 방호막", desc: "최대 체력 +25, 즉시 회복 25", apply: (g) => { g.player.maxHp += 25; g.player.hp = Math.min(g.player.maxHp, g.player.hp + 25); } },
    { id: "tempo", name: "극한 템포", desc: "이동 속도 +14%, 스태미나 회복 +20%", apply: (g) => { g.player.speed *= 1.14; g.player.staminaRegen *= 1.2; } },
    { id: "pulse", name: "리스크 펄스", desc: "L 능력 파동 피해 +45%", apply: (g) => (g.player.pulsePower *= 1.45) },
    { id: "crit", name: "황금 확률", desc: "치명타 확률 +15%", apply: (g) => (g.player.critChance += 0.15) }
  ];

  const STORE_KEYS = {
    settings: "gildedbreach.settings.v1",
    best: "gildedbreach.best.v1",
    run: "gildedbreach.run.v1"
  };

  const state = {
    mode: "title",
    paused: false,
    gameOver: false,
    victory: false,
    elapsed: 0,
    lastStamp: 0,
    saveTick: 0,
    input: { up: false, down: false, left: false, right: false, attack: false },
    aim: { x: canvas.width / 2, y: canvas.height / 2 },
    rngSeed: Math.random() * 99999,
    shake: 0,
    flash: 0,
    shots: [],
    enemies: [],
    particles: [],
    pickups: [],
    hazards: [],
    boss: null,
    spawnClock: 0,
    hazardClock: 0,
    wave: 1,
    chips: 0,
    tokens: 0,
    hackCount: 0,
    phase: 0,
    settings: loadSettings(),
    best: loadBest(),
    player: null,
    stats: { kills: 0, damageTaken: 0, dodges: 0, chipsSpent: 0, upgrades: 0 }
  };

  applySettingsToForm();
  applySettingsVisuals();
  refreshBestText();

  function defaultPlayer() {
    return {
      x: canvas.width / 2,
      y: canvas.height / 2,
      radius: 15,
      speed: 250,
      hp: 100,
      maxHp: 100,
      attackPower: 20,
      stamina: 100,
      staminaRegen: 26,
      dashCooldown: 1.35,
      dashTimer: 0,
      invuln: 0,
      attackCd: 0,
      pulseCd: 0,
      pulsePower: 60,
      critChance: 0.05
    };
  }

  function newRun() {
    state.mode = "play";
    state.paused = false;
    state.gameOver = false;
    state.victory = false;
    state.elapsed = 0;
    state.saveTick = 0;
    state.wave = 1;
    state.chips = 0;
    state.tokens = 0;
    state.hackCount = 0;
    state.phase = 0;
    state.shots = [];
    state.enemies = [];
    state.particles = [];
    state.pickups = [];
    state.hazards = [];
    state.boss = null;
    state.spawnClock = 0;
    state.hazardClock = 0;
    state.flash = 0;
    state.player = defaultPlayer();
    state.stats = { kills: 0, damageTaken: 0, dodges: 0, chipsSpent: 0, upgrades: 0 };
    state.meta = { chipGain: 1 };
    localStorage.removeItem(STORE_KEYS.run);
    showOnly(null);
    toast("작전 시작: 15분 내 하우스 코어 격파");
  }

  function saveRunSnapshot() {
    if (state.mode !== "play" || state.gameOver) return;
    const pack = {
      version: 1,
      elapsed: state.elapsed,
      wave: state.wave,
      chips: state.chips,
      tokens: state.tokens,
      hackCount: state.hackCount,
      phase: state.phase,
      settings: state.settings,
      stats: state.stats,
      meta: state.meta,
      player: state.player
    };
    localStorage.setItem(STORE_KEYS.run, JSON.stringify(pack));
  }

  function continueRun() {
    const raw = localStorage.getItem(STORE_KEYS.run);
    if (!raw) return false;
    try {
      const save = JSON.parse(raw);
      if (!save || save.version !== 1) return false;
      state.mode = "play";
      state.paused = false;
      state.gameOver = false;
      state.victory = false;
      state.elapsed = save.elapsed || 0;
      state.wave = save.wave || 1;
      state.chips = save.chips || 0;
      state.tokens = save.tokens || 0;
      state.hackCount = save.hackCount || 0;
      state.phase = save.phase || 0;
      state.player = { ...defaultPlayer(), ...(save.player || {}) };
      state.stats = { ...state.stats, ...(save.stats || {}) };
      state.meta = { chipGain: 1, ...(save.meta || {}) };
      state.shots = [];
      state.enemies = [];
      state.particles = [];
      state.pickups = [];
      state.hazards = [];
      state.boss = null;
      state.spawnClock = 0;
      state.hazardClock = 0;
      showOnly(null);
      toast("작전 복구 완료");
      return true;
    } catch {
      return false;
    }
  }

  function setPhaseByTime() {
    const remain = Math.max(0, 900 - state.elapsed);
    for (let i = 0; i < phaseTimeline.length; i += 1) {
      if (remain <= phaseTimeline[i].start && remain > phaseTimeline[i].end) {
        state.phase = i;
        break;
      }
    }
    if (remain <= 180) state.phase = 3;
  }

  function spawnEnemy(dt) {
    const diff = difficultyConfig[state.settings.difficulty];
    state.spawnClock -= dt;
    const remain = 900 - state.elapsed;
    const baseRate = Math.max(0.25, 1.18 - state.phase * 0.18);
    if (state.spawnClock > 0 || state.boss) return;
    state.spawnClock = baseRate / diff.spawnRate;

    const typeRoll = Math.random();
    let type = "drone";
    if (state.phase >= 1 && typeRoll > 0.55) type = "spiker";
    if (state.phase >= 2 && typeRoll > 0.72) type = "sniper";
    if (state.phase >= 3 && typeRoll > 0.78) type = "warden";

    const edge = Math.floor(Math.random() * 4);
    const pos = { x: 0, y: 0 };
    if (edge === 0) { pos.x = -30; pos.y = Math.random() * canvas.height; }
    if (edge === 1) { pos.x = canvas.width + 30; pos.y = Math.random() * canvas.height; }
    if (edge === 2) { pos.y = -30; pos.x = Math.random() * canvas.width; }
    if (edge === 3) { pos.y = canvas.height + 30; pos.x = Math.random() * canvas.width; }

    const hpScale = diff.enemyHp * (1 + state.elapsed / 1500);
    const templates = {
      drone: { hp: 38, speed: 110, radius: 12, dmg: 10, color: "#f77a84", chip: 8 },
      spiker: { hp: 70, speed: 90, radius: 16, dmg: 16, color: "#e49b43", chip: 14 },
      sniper: { hp: 54, speed: 72, radius: 14, dmg: 12, color: "#8bb5ff", chip: 13, cd: 1.8 },
      warden: { hp: 140, speed: 66, radius: 20, dmg: 18, color: "#c390ff", chip: 24 }
    };

    const t = templates[type];
    state.enemies.push({
      ...pos,
      type,
      hp: t.hp * hpScale,
      maxHp: t.hp * hpScale,
      speed: t.speed,
      radius: t.radius,
      dmg: t.dmg,
      chip: t.chip,
      color: t.color,
      cd: t.cd || 0,
      hit: 0
    });

    if (remain < 190 && !state.boss) {
      spawnBoss();
    }
  }

  function spawnBoss() {
    if (state.boss) return;
    state.boss = {
      x: canvas.width / 2,
      y: 120,
      hp: 1800,
      maxHp: 1800,
      phase: 1,
      cd: 0,
      radius: 56,
      drift: 1
    };
    state.enemies = [];
    toast("최종 보스 등장: HOUSE PRIME");
    sound("warning", 0.8);
  }

  function shootTowards(x, y, powerMul = 1) {
    if (state.mode !== "play" || state.player.attackCd > 0) return;
    const p = state.player;
    let dx = x - p.x;
    let dy = y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    if (state.settings.assist && state.enemies.length) {
      let nearest = null;
      let nearestDist = 170;
      for (const e of state.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < nearestDist) {
          nearest = e;
          nearestDist = d;
        }
      }
      if (nearest) {
        const nd = Math.hypot(nearest.x - p.x, nearest.y - p.y) || 1;
        dx = (nearest.x - p.x) / nd;
        dy = (nearest.y - p.y) / nd;
      }
    }
    state.shots.push({ x: p.x, y: p.y, vx: dx * 520, vy: dy * 520, life: 0.9, dmg: p.attackPower * powerMul, crit: Math.random() < p.critChance });
    p.attackCd = 0.24;
    sound("attack", 0.45);
  }

  function pulse() {
    const p = state.player;
    if (p.pulseCd > 0 || p.stamina < 35) return;
    p.stamina -= 35;
    p.pulseCd = 8;
    sound("pulse", 0.85);
    state.flash = state.settings.reducedFlash ? 0.16 : 0.42;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d < 210) {
        enemy.hp -= p.pulsePower * (1 - d / 250);
        enemy.hit = 0.15;
      }
    }
    if (state.boss) {
      const d = Math.hypot(state.boss.x - p.x, state.boss.y - p.y);
      if (d < 260) state.boss.hp -= p.pulsePower * 0.8;
    }
  }

  function dash() {
    const p = state.player;
    if (p.dashTimer > 0 || p.stamina < 20) return;
    const axisX = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    const axisY = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    if (axisX === 0 && axisY === 0) return;
    const len = Math.hypot(axisX, axisY) || 1;
    p.x += (axisX / len) * 95;
    p.y += (axisY / len) * 95;
    p.dashTimer = p.dashCooldown;
    p.invuln = 0.3;
    p.stamina -= 20;
    state.stats.dodges += 1;
    sound("dash", 0.6);
    state.shake = 0.18;
  }

  function update(dt) {
    if (state.mode !== "play" || state.paused || state.gameOver) return;
    const p = state.player;
    state.elapsed += dt;
    state.saveTick += dt;
    if (state.saveTick > 10) {
      saveRunSnapshot();
      state.saveTick = 0;
    }

    setPhaseByTime();
    const remain = Math.max(0, 900 - state.elapsed);

    const axisX = (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0);
    const axisY = (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0);
    const axisLen = Math.hypot(axisX, axisY) || 1;
    p.x += (axisX / axisLen) * p.speed * dt;
    p.y += (axisY / axisLen) * p.speed * dt;

    p.x = clamp(p.x, 22, canvas.width - 22);
    p.y = clamp(p.y, 22, canvas.height - 22);

    p.stamina = Math.min(100, p.stamina + p.staminaRegen * dt);
    p.dashTimer = Math.max(0, p.dashTimer - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.pulseCd = Math.max(0, p.pulseCd - dt);

    if (state.input.attack) shootTowards(state.aim.x, state.aim.y);

    spawnEnemy(dt);
    updateHazards(dt, remain);

    for (const shot of state.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.crit && Math.random() < 0.2) {
        state.particles.push({ x: shot.x, y: shot.y, r: 1 + Math.random() * 2, t: 0.2, c: "#fff2a8" });
      }
    }
    state.shots = state.shots.filter((s) => s.life > 0 && s.x > -10 && s.y > -10 && s.x < canvas.width + 10 && s.y < canvas.height + 10);

    for (const enemy of state.enemies) {
      enemy.hit = Math.max(0, enemy.hit - dt);
      if (enemy.type === "sniper") {
        enemy.cd -= dt;
        const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
        if (d > 220) {
          enemy.x += ((p.x - enemy.x) / d) * enemy.speed * dt;
          enemy.y += ((p.y - enemy.y) / d) * enemy.speed * dt;
        }
        if (enemy.cd <= 0) {
          enemy.cd = 1.7;
          const dx = p.x - enemy.x;
          const dy = p.y - enemy.y;
          const l = Math.hypot(dx, dy) || 1;
          state.hazards.push({ x: enemy.x, y: enemy.y, vx: (dx / l) * 310, vy: (dy / l) * 310, r: 7, t: 2.5, dmg: 12, kind: "bolt" });
        }
      } else {
        const dx = p.x - enemy.x;
        const dy = p.y - enemy.y;
        const l = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / l) * enemy.speed * dt;
        enemy.y += (dy / l) * enemy.speed * dt;
      }

      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.radius + p.radius - 2 && p.invuln <= 0) {
        damagePlayer(enemy.dmg);
        p.invuln = 0.52;
      }
    }

    if (state.boss) {
      updateBoss(dt);
      if (state.boss.hp <= 0) {
        endRun(true);
      }
    }

    for (const shot of state.shots) {
      for (const enemy of state.enemies) {
        if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < enemy.radius + 4) {
          enemy.hp -= shot.dmg * (shot.crit ? 1.9 : 1);
          enemy.hit = 0.2;
          shot.life = 0;
          sound("hit", shot.crit ? 0.7 : 0.4);
          break;
        }
      }
      if (state.boss && Math.hypot(shot.x - state.boss.x, shot.y - state.boss.y) < state.boss.radius + 6) {
        state.boss.hp -= shot.dmg * (shot.crit ? 1.7 : 1);
        shot.life = 0;
        sound("hit", shot.crit ? 0.7 : 0.35);
      }
    }

    const alive = [];
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) {
        state.stats.kills += 1;
        state.chips += Math.floor(enemy.chip * state.meta.chipGain);
        if (state.phase === 0 && Math.random() < 0.13) state.tokens += 1;
        if (Math.random() < 0.2) state.pickups.push({ x: enemy.x, y: enemy.y, r: 9, t: 8, type: "heal" });
        burst(enemy.x, enemy.y, enemy.color);
      } else {
        alive.push(enemy);
      }
    }
    state.enemies = alive;

    for (const pickup of state.pickups) {
      pickup.t -= dt;
      if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < p.radius + pickup.r) {
        if (pickup.type === "heal") p.hp = Math.min(p.maxHp, p.hp + 18);
        pickup.t = -1;
        sound("reward", 0.45);
      }
    }
    state.pickups = state.pickups.filter((q) => q.t > 0);

    for (const part of state.particles) part.t -= dt;
    state.particles = state.particles.filter((part) => part.t > 0);

    if (state.phase > 0 && state.chips >= 110 + state.phase * 35 && !overlays.upgrade.classList.contains("active")) {
      openUpgrade();
    }

    if (remain <= 0 && !state.victory) endRun(false, "시간 초과로 하우스가 시스템을 봉인했습니다.");

    state.wave = 1 + Math.floor(state.elapsed / 42);
  }

  function updateHazards(dt, remain) {
    state.hazardClock -= dt;
    if (state.phase >= 1 && state.hazardClock <= 0) {
      state.hazardClock = Math.max(2.4 - state.phase * 0.35, 1.3);
      const x = 80 + Math.random() * (canvas.width - 160);
      const y = 100 + Math.random() * (canvas.height - 170);
      state.hazards.push({ x, y, r: 28, t: 2.5, dmg: 14 + state.phase * 4, kind: "mine" });
      if (remain < 220 && Math.random() < 0.55) {
        state.hazards.push({ x: canvas.width / 2, y: 68 + Math.random() * 580, r: 14, t: 3, dmg: 16, kind: "laser" });
      }
    }

    for (const h of state.hazards) {
      h.t -= dt;
      if (h.kind === "bolt") {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
      }
      if (h.kind === "laser" && Math.abs(h.x - state.player.x) < h.r && state.player.invuln <= 0) {
        damagePlayer(h.dmg * dt * 2.2);
      }
      if ((h.kind === "mine" || h.kind === "bolt") && Math.hypot(h.x - state.player.x, h.y - state.player.y) < h.r + state.player.radius && state.player.invuln <= 0) {
        damagePlayer(h.dmg);
        h.t = -1;
      }
    }

    state.hazards = state.hazards.filter((h) => h.t > 0 && h.x > -80 && h.y > -80 && h.x < canvas.width + 80 && h.y < canvas.height + 80);
  }

  function updateBoss(dt) {
    const b = state.boss;
    const p = state.player;
    b.cd -= dt;
    b.x += Math.sin(state.elapsed * 0.6) * b.drift * 22 * dt;
    b.y = 120 + Math.sin(state.elapsed * 1.2) * 18;

    if (b.hp < b.maxHp * 0.62) b.phase = 2;
    if (b.hp < b.maxHp * 0.28) b.phase = 3;

    if (b.cd <= 0) {
      b.cd = Math.max(1.1 - b.phase * 0.18, 0.62);
      for (let i = 0; i < 8 + b.phase * 2; i += 1) {
        const a = (Math.PI * 2 * i) / (8 + b.phase * 2) + state.elapsed * 0.4;
        state.hazards.push({ x: b.x, y: b.y, vx: Math.cos(a) * (190 + b.phase * 30), vy: Math.sin(a) * (190 + b.phase * 30), r: 7 + b.phase, t: 3.2, dmg: 10 + b.phase * 5, kind: "bolt" });
      }
      sound("warning", 0.48);
    }

    if (Math.hypot(b.x - p.x, b.y - p.y) < b.radius + p.radius && p.invuln <= 0) {
      damagePlayer(18 + b.phase * 4);
      p.invuln = 0.4;
    }
  }

  function burst(x, y, color) {
    for (let i = 0; i < 9; i += 1) {
      state.particles.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, r: 2 + Math.random() * 4, t: 0.45 + Math.random() * 0.4, c: color });
    }
  }

  function damagePlayer(amount) {
    const p = state.player;
    const dmg = amount * difficultyConfig[state.settings.difficulty].damageTaken;
    p.hp -= dmg;
    state.stats.damageTaken += dmg;
    state.shake = Math.min(0.3, state.shake + 0.07);
    sound("hurt", 0.65);
    if (p.hp <= 0) {
      p.hp = 0;
      endRun(false, "체력이 소진되어 계약이 종료되었습니다.");
    }
  }

  function endRun(victory, reason) {
    state.mode = "result";
    state.gameOver = true;
    state.victory = victory;
    localStorage.removeItem(STORE_KEYS.run);
    const score = Math.floor(state.chips + state.stats.kills * 6 + Math.max(0, 900 - state.elapsed) * 0.8);
    const result = { score, clears: victory ? 1 : 0, fastest: victory ? state.elapsed : null };
    updateBest(result);
    showResult(victory, reason, score);
    sound(victory ? "clear" : "gameover", 0.9);
  }

  function openUpgrade() {
    state.paused = true;
    state.mode = "upgrade";
    showOnly(overlays.upgrade);
    upgradeList.innerHTML = "";

    const picks = [...upgradePool].sort(() => Math.random() - 0.5).slice(0, 3);
    upgradeCaption.textContent = `칩 ${80 + state.phase * 30}를 지불하고 강화 1개를 선택하세요.`;

    picks.forEach((upgrade) => {
      const btn = document.createElement("button");
      btn.className = "upgrade-item";
      btn.innerHTML = `<h3>${upgrade.name}</h3><p>${upgrade.desc}</p><strong>선택</strong>`;
      btn.addEventListener("click", () => {
        const cost = 80 + state.phase * 30;
        if (state.chips < cost) {
          toast("칩이 부족합니다.");
          return;
        }
        state.chips -= cost;
        state.stats.chipsSpent += cost;
        state.stats.upgrades += 1;
        upgrade.apply(state);
        state.mode = "play";
        state.paused = false;
        showOnly(null);
        toast(`강화 획득: ${upgrade.name}`);
        sound("reward", 0.75);
      });
      upgradeList.appendChild(btn);
    });

    setTimeout(() => {
      const first = upgradeList.querySelector("button");
      if (first) first.focus();
    }, 20);
  }

  function render() {
    const phaseInfo = phaseTimeline[state.phase] || phaseTimeline[0];
    const remain = Math.max(0, 900 - state.elapsed);

    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, phaseInfo.tint);
    bg.addColorStop(1, "#0b0a10");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawArenaDecor();

    for (const h of state.hazards) {
      if (h.kind === "mine") {
        ctx.strokeStyle = "rgba(255,110,90,0.78)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (h.kind === "laser") {
        ctx.fillStyle = "rgba(255,70,110,0.34)";
        ctx.fillRect(h.x - h.r, 0, h.r * 2, canvas.height);
      } else {
        ctx.fillStyle = "#ff8fb3";
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const pickup of state.pickups) {
      ctx.fillStyle = "#7ffcc4";
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, pickup.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f3f30";
      ctx.stroke();
    }

    for (const shot of state.shots) {
      ctx.fillStyle = shot.crit ? "#fff4ba" : "#ffd591";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.crit ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const enemy of state.enemies) {
      ctx.save();
      if (enemy.hit > 0) ctx.globalAlpha = 0.6;
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(16,7,10,0.65)";
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, enemy.radius * 2, 4);
      ctx.fillStyle = "rgba(255,226,174,0.85)";
      ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 10, (enemy.hp / enemy.maxHp) * enemy.radius * 2, 4);
      ctx.restore();
    }

    if (state.boss) {
      drawBoss(state.boss);
    }

    const p = state.player || defaultPlayer();
    ctx.save();
    if (p.invuln > 0 && Math.floor(state.elapsed * 18) % 2 === 0) ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffe1a1";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#55351d";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    for (const part of state.particles) {
      if (part.vx) {
        part.x += part.vx * 0.016;
        part.y += part.vy * 0.016;
      }
      ctx.globalAlpha = Math.max(0, part.t);
      ctx.fillStyle = part.c || "#fff";
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,220,160,${state.flash})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      state.flash *= 0.84;
    }

    if (state.shake > 0 && !state.settings.reducedFlash) {
      state.shake *= 0.9;
    }

    updateHud(remain, phaseInfo);
  }

  function drawArenaDecor() {
    ctx.strokeStyle = "rgba(255,196,130,0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const y = 48 + i * 48 + Math.sin(state.elapsed * 0.3 + i) * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    for (let i = 0; i < 7; i += 1) {
      const x = 80 + i * 190;
      ctx.fillStyle = "rgba(255,191,71,0.08)";
      ctx.fillRect(x, 65, 60, canvas.height - 130);
    }
  }

  function drawBoss(b) {
    ctx.fillStyle = "#ff6e8d";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + Math.sin(state.elapsed * 3) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3e1420";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(20,10,14,0.8)";
    ctx.fillRect(250, 26, 780, 20);
    ctx.fillStyle = "#ff7c8f";
    ctx.fillRect(250, 26, (b.hp / b.maxHp) * 780, 20);
    ctx.strokeStyle = "rgba(255,214,170,0.7)";
    ctx.strokeRect(250, 26, 780, 20);
    ctx.fillStyle = "#ffe4c9";
    ctx.font = "16px Segoe UI";
    ctx.fillText("HOUSE PRIME", 250, 22);
  }

  function updateHud(remain, phaseInfo) {
    if (!state.player) return;
    hud.hpBar.style.width = `${(state.player.hp / state.player.maxHp) * 100}%`;
    hud.hpText.textContent = `${Math.ceil(state.player.hp)} / ${Math.ceil(state.player.maxHp)}`;
    hud.staminaBar.style.width = `${state.player.stamina}%`;
    hud.staminaText.textContent = `${Math.round(state.player.stamina)}%`;
    hud.wave.textContent = String(state.wave);
    hud.phase.textContent = phaseInfo.name;
    hud.time.textContent = formatTime(remain);
    hud.chips.textContent = `${Math.floor(state.chips)} (토큰 ${state.tokens})`;
    hud.objective.textContent = phaseInfo.objective;

    const threatLevel = state.boss
      ? "최대"
      : state.phase === 0
      ? "안정"
      : state.phase === 1
      ? "주의"
      : state.phase === 2
      ? "경계"
      : "위기";
    hud.threat.textContent = `위협도: ${threatLevel}`;
  }

  function showResult(victory, reason, score) {
    showOnly(overlays.result);
    resultTitle.textContent = victory ? "VAULT BREACHED" : "RUN FAILED";
    resultSummary.textContent = reason || (victory ? "하우스 AI를 무력화하고 계약을 완수했습니다." : "작전이 붕괴되었습니다.");
    resultStats.innerHTML = "";

    const lines = [
      `점수: ${score}`,
      `생존 시간: ${formatTime(state.elapsed)}`,
      `처치 수: ${state.stats.kills}`,
      `회피(대시) 성공: ${state.stats.dodges}`,
      `강화 선택: ${state.stats.upgrades}`,
      `획득 칩: ${Math.floor(state.chips + state.stats.chipsSpent)}`
    ];
    lines.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      resultStats.appendChild(li);
    });
    buttons.replay.focus();
  }

  function showOnly(element) {
    Object.values(overlays).forEach((overlay) => overlay.classList.remove("active"));
    if (element) element.classList.add("active");
  }

  function toast(message) {
    hud.toast.textContent = message;
    hud.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => hud.toast.classList.remove("show"), 1700);
  }

  function formatTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function loadSettings() {
    const fallback = {
      difficulty: "normal",
      masterVolume: 70,
      sfxVolume: 80,
      mute: false,
      reducedFlash: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      largeText: false,
      assist: false
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEYS.settings) || "null");
      return { ...fallback, ...(saved || {}) };
    } catch {
      return fallback;
    }
  }

  function saveSettings() {
    localStorage.setItem(STORE_KEYS.settings, JSON.stringify(state.settings));
  }

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEYS.best) || "null") || { highScore: 0, clears: 0, fastest: null };
    } catch {
      return { highScore: 0, clears: 0, fastest: null };
    }
  }

  function updateBest(run) {
    state.best.highScore = Math.max(state.best.highScore, run.score);
    state.best.clears += run.clears;
    if (run.fastest && (!state.best.fastest || run.fastest < state.best.fastest)) state.best.fastest = run.fastest;
    localStorage.setItem(STORE_KEYS.best, JSON.stringify(state.best));
    refreshBestText();
  }

  function refreshBestText() {
    const fast = state.best.fastest ? formatTime(state.best.fastest) : "-";
    hud.best.textContent = `최고 점수 ${state.best.highScore} · 클리어 ${state.best.clears}회 · 최단 ${fast}`;
  }

  function applySettingsToForm() {
    optionsForm.difficulty.value = state.settings.difficulty;
    optionsForm.master.value = state.settings.masterVolume;
    optionsForm.sfx.value = state.settings.sfxVolume;
    optionsForm.mute.checked = state.settings.mute;
    optionsForm.reducedFlash.checked = state.settings.reducedFlash;
    optionsForm.largeText.checked = state.settings.largeText;
    optionsForm.assist.checked = state.settings.assist;
  }

  function readFormSettings() {
    state.settings = {
      difficulty: optionsForm.difficulty.value,
      masterVolume: Number(optionsForm.master.value),
      sfxVolume: Number(optionsForm.sfx.value),
      mute: optionsForm.mute.checked,
      reducedFlash: optionsForm.reducedFlash.checked,
      largeText: optionsForm.largeText.checked,
      assist: optionsForm.assist.checked
    };
    applySettingsVisuals();
    saveSettings();
  }

  function applySettingsVisuals() {
    document.body.classList.toggle("large-text", state.settings.largeText);
  }

  let audioCtx;
  function sound(type, intensity = 1) {
    if (state.settings.mute) return;
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        return;
      }
    }
    const gain = audioCtx.createGain();
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const vol = (state.settings.masterVolume / 100) * (state.settings.sfxVolume / 100) * intensity;

    const map = {
      attack: [220, "square", 0.05],
      hit: [340, "triangle", 0.04],
      dash: [180, "sawtooth", 0.08],
      pulse: [130, "sawtooth", 0.2],
      hurt: [120, "square", 0.14],
      reward: [460, "triangle", 0.12],
      clear: [620, "triangle", 0.45],
      gameover: [90, "sawtooth", 0.4],
      warning: [260, "square", 0.18]
    };

    const [freq, wave, dur] = map[type] || [200, "sine", 0.08];
    osc.type = wave;
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 1200 + freq;

    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur + 0.02);
  }

  function bindEvents() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (state.mode === "play") {
          state.paused = true;
          state.mode = "pause";
          showOnly(overlays.pause);
          buttons.resume.focus();
          saveRunSnapshot();
        } else if (state.mode === "pause") {
          state.paused = false;
          state.mode = "play";
          showOnly(null);
        }
        return;
      }
      if (KEYMAP[e.key]) state.input[KEYMAP[e.key]] = true;
      if (e.key.toLowerCase() === "j") state.input.attack = true;
      if (e.key.toLowerCase() === "k" || e.key === "Shift") dash();
      if (e.key.toLowerCase() === "l") pulse();
    });

    window.addEventListener("keyup", (e) => {
      if (KEYMAP[e.key]) state.input[KEYMAP[e.key]] = false;
      if (e.key.toLowerCase() === "j") state.input.attack = false;
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      state.aim.x = (e.clientX - rect.left) * sx;
      state.aim.y = (e.clientY - rect.top) * sy;
    });

    canvas.addEventListener("mousedown", () => {
      state.input.attack = true;
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    });
    window.addEventListener("mouseup", () => {
      state.input.attack = false;
    });

    buttons.fresh.addEventListener("click", () => {
      newRun();
    });
    buttons.cont.addEventListener("click", () => {
      if (!continueRun()) toast("이어하기 데이터가 없습니다.");
    });
    buttons.options.addEventListener("click", () => {
      showOnly(overlays.options);
      buttons.optionsBack.focus();
    });
    buttons.credits.addEventListener("click", () => {
      showOnly(overlays.credits);
      buttons.creditsBack.focus();
    });
    buttons.optionsBack.addEventListener("click", () => {
      showOnly(overlays.title);
      buttons.options.focus();
    });
    buttons.creditsBack.addEventListener("click", () => {
      showOnly(overlays.title);
      buttons.credits.focus();
    });
    buttons.resetSave.addEventListener("click", () => {
      localStorage.removeItem(STORE_KEYS.best);
      localStorage.removeItem(STORE_KEYS.run);
      state.best = { highScore: 0, clears: 0, fastest: null };
      refreshBestText();
      toast("기록 초기화 완료");
    });
    buttons.resume.addEventListener("click", () => {
      state.paused = false;
      state.mode = "play";
      showOnly(null);
    });
    buttons.restart.addEventListener("click", newRun);
    buttons.pauseOptions.addEventListener("click", () => showOnly(overlays.options));
    buttons.quit.addEventListener("click", () => {
      state.mode = "title";
      state.paused = false;
      showOnly(overlays.title);
      saveRunSnapshot();
      buttons.fresh.focus();
    });

    buttons.replay.addEventListener("click", newRun);
    buttons.resultMenu.addEventListener("click", () => {
      state.mode = "title";
      showOnly(overlays.title);
      buttons.fresh.focus();
    });

    Object.values(optionsForm).forEach((input) => {
      input.addEventListener("input", readFormSettings);
      input.addEventListener("change", readFormSettings);
    });

    window.addEventListener("beforeunload", saveRunSnapshot);
  }

  function syncContinueAvailability() {
    const hasSave = !!localStorage.getItem(STORE_KEYS.run);
    buttons.cont.disabled = !hasSave;
  }

  function loop(ts) {
    if (!state.lastStamp) state.lastStamp = ts;
    const dt = Math.min(0.033, (ts - state.lastStamp) / 1000);
    state.lastStamp = ts;

    if (state.mode === "play") update(dt);
    render();
    syncContinueAvailability();

    requestAnimationFrame(loop);
  }

  bindEvents();
  state.player = defaultPlayer();
  showOnly(overlays.title);
  buttons.fresh.focus();
  requestAnimationFrame(loop);
})();
