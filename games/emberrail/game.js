(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    hpFill: document.getElementById("hpFill"),
    hpText: document.getElementById("hpText"),
    threadFill: document.getElementById("threadFill"),
    threadText: document.getElementById("threadText"),
    sectorText: document.getElementById("sectorText"),
    timeText: document.getElementById("timeText"),
    scoreText: document.getElementById("scoreText"),
    toast: document.getElementById("toast"),
    bestText: document.getElementById("bestText"),
    clearText: document.getElementById("clearText"),
    resultHeading: document.getElementById("resultHeading"),
    resultLead: document.getElementById("resultLead"),
    resultScore: document.getElementById("resultScore"),
    resultTime: document.getElementById("resultTime"),
    resultKills: document.getElementById("resultKills"),
    resultSector: document.getElementById("resultSector")
  };

  const overlays = {
    title: document.getElementById("titleScreen"),
    options: document.getElementById("optionsScreen"),
    credits: document.getElementById("creditsScreen"),
    pause: document.getElementById("pauseScreen"),
    result: document.getElementById("resultScreen")
  };

  const volumeRange = document.getElementById("volumeRange");
  const volumeText = document.getElementById("volumeText");
  const muteBtn = document.getElementById("muteBtn");
  const difficultySelect = document.getElementById("difficultySelect");
  const motionBtn = document.getElementById("motionBtn");
  const hudScaleSelect = document.getElementById("hudScaleSelect");

  const SAVE_KEY = "emberrail-save-v1";
  const RUN_LIMIT = 12 * 60;

  const difficulty = {
    story: { enemyHp: 0.82, enemyDmg: 0.78, spawn: 0.88, score: 0.9, hp: 120 },
    normal: { enemyHp: 1, enemyDmg: 1, spawn: 1, score: 1, hp: 100 },
    hard: { enemyHp: 1.24, enemyDmg: 1.32, spawn: 1.16, score: 1.35, hp: 90 }
  };

  const defaultSettings = {
    volume: 80,
    muted: false,
    difficulty: "normal",
    motionFx: true,
    hudScale: "1"
  };

  const game = {
    mode: "title",
    overlay: "title",
    input: { keys: new Set(), mx: canvas.width / 2, my: canvas.height / 2, firing: false },
    save: { bestScore: 0, bestClear: null, settings: { ...defaultSettings }, snapshot: null },
    settings: { ...defaultSettings },
    time: 0,
    score: 0,
    kills: 0,
    sector: 1,
    bossSpawned: false,
    bossKilled: false,
    ended: false,
    toastTime: 0,
    shake: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    hazards: [],
    drops: [],
    lastShot: 0,
    spawnTimer: 0,
    hazardTimer: 0,
    alphaEvent: false,
    omegaEvent: false,
    lastFrame: 0
  };

  const audio = { ctx: null, gain: null, ready: false };

  function boot() {
    loadSave();
    bindEvents();
    applySettingsToUI();
    refreshStats();
    requestAnimationFrame(loop);
  }

  function bindEvents() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
    });

    volumeRange.addEventListener("input", () => {
      game.settings.volume = Number(volumeRange.value);
      volumeText.textContent = `${game.settings.volume}%`;
      syncAudio();
      persistSave();
    });

    difficultySelect.addEventListener("change", () => {
      game.settings.difficulty = difficultySelect.value;
      persistSave();
    });

    hudScaleSelect.addEventListener("change", () => {
      game.settings.hudScale = hudScaleSelect.value;
      document.documentElement.style.setProperty("--hud-scale", game.settings.hudScale);
      persistSave();
    });

    muteBtn.addEventListener("click", () => {
      game.settings.muted = !game.settings.muted;
      setToggle(muteBtn, game.settings.muted);
      syncAudio();
      persistSave();
    });

    motionBtn.addEventListener("click", () => {
      game.settings.motionFx = !game.settings.motionFx;
      setToggle(motionBtn, !game.settings.motionFx, "OFF", "ON");
      persistSave();
    });

    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      const key = event.key.toLowerCase();
      game.input.keys.add(key);

      if (event.key === "Escape") {
        if (game.mode === "playing") {
          game.mode = "paused";
          showOverlay("pause");
          playSfx("ui", 240, 0.05, "square");
        } else if (game.mode === "paused") {
          resumeGame();
        }
      }
      if (game.mode === "playing" && key === "e") {
        tryRewind();
      }
      if (game.mode === "playing" && key === "shift") {
        tryDash();
      }
    });

    window.addEventListener("keyup", (event) => {
      game.input.keys.delete(event.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      game.input.mx = ((event.clientX - rect.left) / rect.width) * canvas.width;
      game.input.my = ((event.clientY - rect.top) / rect.height) * canvas.height;
    });

    canvas.addEventListener("mousedown", (event) => {
      if (event.button === 0) {
        ensureAudio();
        game.input.firing = true;
      }
    });

    window.addEventListener("mouseup", () => {
      game.input.firing = false;
    });
  }

  function handleAction(action) {
    ensureAudio();
    playSfx("ui", 420, 0.05, "triangle");

    switch (action) {
      case "new":
      case "retry":
        startRun(true);
        break;
      case "continue":
        if (game.save.snapshot) {
          restoreSnapshot();
        } else {
          startRun(true);
        }
        break;
      case "options":
      case "options-pause":
        showOverlay("options");
        break;
      case "credits":
        showOverlay("credits");
        break;
      case "back-options":
      case "back-credits":
        showOverlay(game.mode === "paused" ? "pause" : "title");
        break;
      case "reset-options":
        game.settings = { ...defaultSettings };
        applySettingsToUI();
        persistSave();
        break;
      case "resume":
        resumeGame();
        break;
      case "to-title":
        if (game.mode === "playing" || game.mode === "paused") {
          saveSnapshot();
        }
        game.mode = "title";
        showOverlay("title");
        refreshStats();
        break;
      default:
        break;
    }
  }

  function startRun(clearSnapshot) {
    if (clearSnapshot) {
      game.save.snapshot = null;
      persistSave();
    }
    const tune = difficulty[game.settings.difficulty];
    game.mode = "playing";
    game.overlay = "none";
    hideOverlays();
    game.time = 0;
    game.score = 0;
    game.kills = 0;
    game.sector = 1;
    game.bossSpawned = false;
    game.bossKilled = false;
    game.ended = false;
    game.toastTime = 0;
    game.shake = 0;
    game.spawnTimer = 0;
    game.hazardTimer = 3;
    game.alphaEvent = false;
    game.omegaEvent = false;

    game.player = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      r: 14,
      speed: 208,
      hp: tune.hp,
      maxHp: tune.hp,
      fireRate: 0.16,
      bulletSpeed: 520,
      bulletDamage: 20,
      dashCd: 0,
      rewind: 0,
      invuln: 0,
      facing: 0,
      trail: []
    };

    game.bullets = [];
    game.enemies = [];
    game.particles = [];
    game.hazards = [];
    game.drops = [];
    toast("Sector I · Entry Breach");
    uiUpdate();
  }

  function resumeGame() {
    if (game.mode === "paused") {
      game.mode = "playing";
      hideOverlays();
    }
  }

  function restoreSnapshot() {
    try {
      const snap = game.save.snapshot;
      if (!snap) return startRun(true);
      Object.assign(game, {
        mode: "playing",
        overlay: "none",
        time: snap.time,
        score: snap.score,
        kills: snap.kills,
        sector: snap.sector,
        bossSpawned: snap.bossSpawned,
        bossKilled: snap.bossKilled,
        alphaEvent: snap.alphaEvent,
        omegaEvent: snap.omegaEvent,
        spawnTimer: 0.5,
        hazardTimer: 3
      });
      game.player = snap.player;
      game.bullets = [];
      game.enemies = snap.enemies || [];
      game.hazards = snap.hazards || [];
      game.drops = [];
      game.particles = [];
      hideOverlays();
      toast("Run Restored");
    } catch {
      startRun(true);
    }
  }

  function saveSnapshot() {
    if (!game.player) return;
    game.save.snapshot = {
      time: game.time,
      score: game.score,
      kills: game.kills,
      sector: game.sector,
      bossSpawned: game.bossSpawned,
      bossKilled: game.bossKilled,
      alphaEvent: game.alphaEvent,
      omegaEvent: game.omegaEvent,
      player: { ...game.player, trail: [] },
      enemies: game.enemies.slice(0, 24).map((e) => ({ ...e })),
      hazards: game.hazards.slice(0, 12).map((h) => ({ ...h }))
    };
    persistSave();
  }

  function showOverlay(name) {
    game.overlay = name;
    Object.entries(overlays).forEach(([key, el]) => {
      el.classList.toggle("active", key === name);
    });
  }

  function hideOverlays() {
    game.overlay = "none";
    Object.values(overlays).forEach((el) => el.classList.remove("active"));
  }

  function loop(ts) {
    if (!game.lastFrame) game.lastFrame = ts;
    const dt = Math.min(0.033, (ts - game.lastFrame) / 1000);
    game.lastFrame = ts;

    if (game.mode === "playing") {
      update(dt);
      render();
      uiUpdate();
    } else {
      renderBackground(ts / 1000);
    }

    requestAnimationFrame(loop);
  }

  function update(dt) {
    const tune = difficulty[game.settings.difficulty];
    game.time += dt;
    if (game.player.hp <= 0) return endRun(false, "붕괴: 시간망에 소거되었습니다.");

    if (game.time >= RUN_LIMIT && !game.bossKilled) {
      return endRun(false, "시간 제한 초과: 금고가 붕괴했습니다.");
    }

    updateSector();
    movePlayer(dt);
    handleFire(dt);
    updateBullets(dt);
    spawnEnemies(dt, tune);
    updateEnemies(dt, tune);
    updateHazards(dt, tune);
    updateDrops(dt);
    updateParticles(dt);

    game.player.dashCd = Math.max(0, game.player.dashCd - dt);
    game.player.invuln = Math.max(0, game.player.invuln - dt);
    game.player.rewind = Math.min(100, game.player.rewind + dt * (2.8 + game.sector));
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 2.4);

    if (!game.bossSpawned && game.time > 600) {
      spawnBoss(tune);
      toast("Final Sector · Null Warden Emerges");
    }

    if (game.bossKilled && !game.ended) {
      endRun(true, "승리: 시간망령을 소거했습니다.");
    }

    if (Math.floor(game.time) % 30 === 0 && Math.abs(game.time - Math.floor(game.time)) < dt) {
      spawnPulseReward();
    }
  }

  function updateSector() {
    const prev = game.sector;
    if (game.time < 210) game.sector = 1;
    else if (game.time < 420) game.sector = 2;
    else game.sector = 3;

    if (game.sector !== prev) {
      const messages = {
        2: "Sector II · Convergence",
        3: "Sector III · Collapse"
      };
      toast(messages[game.sector]);
      playSfx("sector", 180 + game.sector * 30, 0.1, "sawtooth");
    }

    if (!game.alphaEvent && game.time > 120) {
      game.alphaEvent = true;
      game.player.fireRate *= 0.88;
      game.player.bulletDamage += 4;
      toast("Thread Boost: fire cadence increased");
      burst(game.player.x, game.player.y, 16, "#7df6af");
    }

    if (!game.omegaEvent && game.time > 360) {
      game.omegaEvent = true;
      game.player.speed += 24;
      game.player.bulletSpeed += 80;
      toast("Omega Glide: movement and shot speed increased");
      burst(game.player.x, game.player.y, 18, "#3ee6ff");
    }
  }

  function movePlayer(dt) {
    const p = game.player;
    const up = game.input.keys.has("w") || game.input.keys.has("arrowup");
    const down = game.input.keys.has("s") || game.input.keys.has("arrowdown");
    const left = game.input.keys.has("a") || game.input.keys.has("arrowleft");
    const right = game.input.keys.has("d") || game.input.keys.has("arrowright");
    let vx = (right ? 1 : 0) - (left ? 1 : 0);
    let vy = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(vx, vy) || 1;
    vx /= len;
    vy /= len;

    p.x += vx * p.speed * dt;
    p.y += vy * p.speed * dt;
    p.x = clamp(p.x, 18, canvas.width - 18);
    p.y = clamp(p.y, 18, canvas.height - 18);

    p.facing = Math.atan2(game.input.my - p.y, game.input.mx - p.x);
    p.trail.push({ x: p.x, y: p.y, life: 0.6 });
    if (p.trail.length > 22) p.trail.shift();
  }

  function tryDash() {
    const p = game.player;
    if (p.dashCd > 0 || game.mode !== "playing") return;
    const angle = p.facing;
    p.x = clamp(p.x + Math.cos(angle) * 95, 18, canvas.width - 18);
    p.y = clamp(p.y + Math.sin(angle) * 95, 18, canvas.height - 18);
    p.dashCd = 2.1;
    p.invuln = 0.24;
    p.rewind = Math.min(100, p.rewind + 8);
    burst(p.x, p.y, 12, "#8f84ff");
    playSfx("dash", 600, 0.05, "triangle");
  }

  function tryRewind() {
    const p = game.player;
    if (p.rewind < 35) {
      toast("Need 35% Thread to Rewind");
      return;
    }
    p.rewind -= 35;
    p.hp = clamp(p.hp + p.maxHp * 0.22, 0, p.maxHp);
    game.enemies.forEach((e) => {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 220) {
        e.stun = 1.4;
        e.vx -= (dx / (d || 1)) * 120;
        e.vy -= (dy / (d || 1)) * 120;
      }
    });
    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18;
      game.bullets.push(createBullet(p.x, p.y, a, 14, 310, true));
    }
    burst(p.x, p.y, 24, "#67f4c0");
    game.shake = 0.5;
    playSfx("rewind", 150, 0.12, "sawtooth");
  }

  function handleFire(dt) {
    const shootPressed = game.input.firing || game.input.keys.has(" ");
    if (!shootPressed) return;

    game.lastShot -= dt;
    if (game.lastShot > 0) return;
    const p = game.player;
    const spread = game.sector >= 3 ? 0.08 : 0;
    game.bullets.push(createBullet(p.x, p.y, p.facing - spread, p.bulletDamage, p.bulletSpeed, false));
    if (spread) game.bullets.push(createBullet(p.x, p.y, p.facing + spread, p.bulletDamage * 0.8, p.bulletSpeed, false));
    game.lastShot = p.fireRate;
    playSfx("shoot", 520, 0.02, "square");
  }

  function createBullet(x, y, angle, damage, speed, allied) {
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: allied ? 4.2 : 3.7,
      life: allied ? 2.2 : 1.3,
      damage,
      allied
    };
  }

  function updateBullets(dt) {
    game.bullets = game.bullets.filter((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > canvas.width + 20 || b.y < -20 || b.y > canvas.height + 20) return false;

      if (b.allied) {
        for (const enemy of game.enemies) {
          if (circleHit(b, enemy)) {
            enemy.hp -= b.damage;
            enemy.flash = 0.1;
            spark(b.x, b.y, "#7de6ff");
            return false;
          }
        }
      }
      return true;
    });
  }

  function spawnEnemies(dt, tune) {
    game.spawnTimer -= dt;
    if (game.spawnTimer > 0) return;

    const base = 1.1 - game.sector * 0.12;
    game.spawnTimer = Math.max(0.22, base / tune.spawn);

    const pool = [];
    pool.push("chaser");
    if (game.time > 80) pool.push("sniper");
    if (game.time > 220) pool.push("tank");
    if (game.time > 380) pool.push("spinner");

    const count = game.sector >= 2 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const type = pool[(Math.random() * pool.length) | 0];
      game.enemies.push(createEnemy(type, tune));
    }
  }

  function createEnemy(type, tune) {
    const side = (Math.random() * 4) | 0;
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = -20;
      y = Math.random() * canvas.height;
    } else if (side === 1) {
      x = canvas.width + 20;
      y = Math.random() * canvas.height;
    } else if (side === 2) {
      x = Math.random() * canvas.width;
      y = -20;
    } else {
      x = Math.random() * canvas.width;
      y = canvas.height + 20;
    }

    const stats = {
      chaser: { hp: 34, speed: 115, dmg: 11, r: 12, value: 22, color: "#9b8bff" },
      sniper: { hp: 24, speed: 70, dmg: 14, r: 11, value: 28, color: "#59d8ff", shoot: 2.2 },
      tank: { hp: 88, speed: 58, dmg: 20, r: 17, value: 48, color: "#ff7eb8" },
      spinner: { hp: 56, speed: 92, dmg: 16, r: 13, value: 52, color: "#7df6af", spin: 0 }
    }[type];

    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: stats.hp * tune.enemyHp,
      maxHp: stats.hp * tune.enemyHp,
      speed: stats.speed,
      dmg: stats.dmg * tune.enemyDmg,
      r: stats.r,
      value: stats.value,
      color: stats.color,
      cd: stats.shoot || 1.8,
      spin: 0,
      flash: 0,
      stun: 0
    };
  }

  function spawnBoss(tune) {
    game.bossSpawned = true;
    game.enemies.push({
      type: "boss",
      x: canvas.width / 2,
      y: -120,
      vx: 0,
      vy: 35,
      hp: 1800 * tune.enemyHp,
      maxHp: 1800 * tune.enemyHp,
      speed: 64,
      dmg: 22 * tune.enemyDmg,
      r: 44,
      value: 900,
      color: "#ffe180",
      cd: 1.1,
      phase: 1,
      flash: 0,
      stun: 0
    });
  }

  function updateEnemies(dt, tune) {
    const p = game.player;
    for (const e of game.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.stun > 0) {
        e.stun -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vx *= 0.94;
        e.vy *= 0.94;
        continue;
      }

      if (e.type === "boss") {
        updateBoss(e, dt, tune);
      } else {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;

        if (e.type === "sniper") {
          const desired = dist > 220 ? 1 : -0.8;
          e.vx = (dx / dist) * e.speed * desired;
          e.vy = (dy / dist) * e.speed * desired;
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = 2.2;
            const ang = Math.atan2(dy, dx);
            game.hazards.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250, r: 6, life: 3.2, dmg: 13 * tune.enemyDmg, type: "bolt" });
            playSfx("enemy", 210, 0.03, "sawtooth");
          }
        } else if (e.type === "spinner") {
          e.spin += dt * 4;
          const perp = Math.sin(e.spin) * 80;
          e.vx = (dx / dist) * e.speed + (-dy / dist) * perp;
          e.vy = (dy / dist) * e.speed + (dx / dist) * perp;
        } else {
          e.vx = (dx / dist) * e.speed;
          e.vy = (dy / dist) * e.speed;
        }

        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }

      if (circleHit(e, p) && p.invuln <= 0) {
        hitPlayer(e.dmg);
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        p.x += Math.cos(ang) * 18;
        p.y += Math.sin(ang) * 18;
      }
    }

    game.enemies = game.enemies.filter((e) => {
      if (e.hp > 0) return true;
      if (e.type === "boss") game.bossKilled = true;
      game.kills += 1;
      game.score += Math.round(e.value * difficulty[game.settings.difficulty].score);
      if (Math.random() < 0.13) {
        game.drops.push({ x: e.x, y: e.y, r: 8, life: 10, kind: Math.random() < 0.5 ? "heal" : "thread" });
      }
      burst(e.x, e.y, 14, e.color);
      playSfx("kill", 180, 0.06, "triangle");
      return false;
    });
  }

  function updateBoss(boss, dt, tune) {
    const p = game.player;
    boss.phase = boss.hp < boss.maxHp * 0.45 ? 2 : 1;
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d = Math.hypot(dx, dy) || 1;

    if (boss.y < 120) {
      boss.y += 40 * dt;
      return;
    }

    boss.vx = (dx / d) * boss.speed;
    boss.vy = (dy / d) * boss.speed;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;

    boss.cd -= dt;
    if (boss.cd <= 0) {
      boss.cd = boss.phase === 1 ? 1.1 : 0.72;
      const count = boss.phase === 1 ? 8 : 14;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + game.time * 0.5;
        const speed = boss.phase === 1 ? 170 : 220;
        game.hazards.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: boss.phase === 1 ? 6 : 5, life: 4, dmg: 12 * tune.enemyDmg, type: "orb" });
      }
      playSfx("boss", 120, 0.08, "sawtooth");
    }
  }

  function hitPlayer(amount) {
    const p = game.player;
    p.hp = Math.max(0, p.hp - amount);
    p.invuln = 0.22;
    p.rewind = Math.min(100, p.rewind + 6);
    game.shake = 0.45;
    burst(p.x, p.y, 10, "#ff6c92");
    playSfx("hurt", 90, 0.1, "square");
  }

  function updateHazards(dt, tune) {
    game.hazardTimer -= dt;
    if (game.hazardTimer <= 0) {
      game.hazardTimer = Math.max(5 - game.sector, 1.8);
      const x = 120 + Math.random() * (canvas.width - 240);
      const y = 100 + Math.random() * (canvas.height - 200);
      const size = game.sector === 1 ? 34 : game.sector === 2 ? 52 : 70;
      game.hazards.push({ x, y, r: size, life: 6.2, dmg: 7 * tune.enemyDmg, type: "zone" });
      toast("Temporal Distortion Detected");
    }

    const p = game.player;
    game.hazards = game.hazards.filter((h) => {
      h.life -= dt;
      if (h.type !== "zone") {
        h.x += h.vx * dt;
        h.y += h.vy * dt;
      }
      if (h.life <= 0) return false;

      if (h.type === "zone") {
        if (Math.hypot(h.x - p.x, h.y - p.y) < h.r && p.invuln <= 0) {
          hitPlayer(h.dmg * dt);
        }
      } else if (Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r && p.invuln <= 0) {
        hitPlayer(h.dmg);
        return false;
      }
      return true;
    });
  }

  function spawnPulseReward() {
    const x = 80 + Math.random() * (canvas.width - 160);
    const y = 80 + Math.random() * (canvas.height - 160);
    game.drops.push({ x, y, r: 9, life: 14, kind: "thread" });
    if (Math.random() < 0.35) {
      game.drops.push({ x: x + 20, y: y - 10, r: 9, life: 14, kind: "heal" });
    }
  }

  function updateDrops(dt) {
    const p = game.player;
    game.drops = game.drops.filter((d) => {
      d.life -= dt;
      if (d.life <= 0) return false;
      if (Math.hypot(d.x - p.x, d.y - p.y) < d.r + p.r + 2) {
        if (d.kind === "heal") {
          p.hp = clamp(p.hp + 18, 0, p.maxHp);
          toast("Integrity Restored");
          playSfx("pickup", 620, 0.04, "triangle");
          burst(d.x, d.y, 8, "#7df6af");
        } else {
          p.rewind = clamp(p.rewind + 16, 0, 100);
          toast("Thread +16%");
          playSfx("pickup", 700, 0.04, "sine");
          burst(d.x, d.y, 8, "#3ee6ff");
        }
        return false;
      }
      return true;
    });
  }

  function updateParticles(dt) {
    game.particles = game.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life > 0;
    });
    game.player.trail.forEach((t) => (t.life -= dt));
    game.player.trail = game.player.trail.filter((t) => t.life > 0);

    if (game.toastTime > 0) {
      game.toastTime -= dt;
      if (game.toastTime <= 0) ui.toast.classList.remove("show");
    }
  }

  function endRun(win, lead) {
    game.ended = true;
    game.mode = "result";
    showOverlay("result");

    if (win) {
      game.score += 1200;
      if (!game.save.bestClear || game.time < game.save.bestClear) {
        game.save.bestClear = game.time;
      }
    }

    if (game.score > game.save.bestScore) game.save.bestScore = game.score;
    game.save.snapshot = null;
    persistSave();
    refreshStats();

    ui.resultHeading.textContent = win ? "Vault Secured" : "Run Failed";
    ui.resultLead.textContent = lead;
    ui.resultScore.textContent = String(Math.round(game.score));
    ui.resultTime.textContent = formatTime(game.time);
    ui.resultKills.textContent = String(game.kills);
    ui.resultSector.textContent = game.bossKilled ? "Final" : ["I", "II", "III"][game.sector - 1];
    playSfx(win ? "victory" : "defeat", win ? 660 : 120, 0.12, win ? "triangle" : "sawtooth");
  }

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    game.toastTime = 2.1;
  }

  function render() {
    const shakeAmount = game.settings.motionFx ? game.shake * 8 : 0;
    const ox = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;
    const oy = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;

    ctx.save();
    ctx.translate(ox, oy);
    drawArena();
    drawHazards();
    drawDrops();
    drawEnemies();
    drawBullets();
    drawPlayer();
    drawParticles();
    ctx.restore();
  }

  function renderBackground(t) {
    drawArena(t);
  }

  function drawArena(t = game.time) {
    const pulse = 0.5 + Math.sin(t * 1.1) * 0.5;
    const palette =
      game.sector === 1
        ? ["#0b0f1e", "#111735", "#131226"]
        : game.sector === 2
          ? ["#100d24", "#19163e", "#1d1232"]
          : ["#180c1e", "#261335", "#2e122c"];

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, palette[0]);
    grad.addColorStop(0.5, palette[1]);
    grad.addColorStop(1, palette[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = `rgba(125,109,255,${0.12 + pulse * 0.08})`;
    ctx.lineWidth = 1;
    for (let x = 20; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 20; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const p = game.player;
    for (const t of p.trail) {
      ctx.fillStyle = `rgba(100,245,255,${t.life * 0.25})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 8 * t.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    ctx.fillStyle = p.invuln > 0 ? "#ffffff" : "#89e9ff";
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (game.player.dashCd > 0) {
      ctx.strokeStyle = "rgba(126,245,255,0.45)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (game.bossSpawned && !game.bossKilled) {
      const e = game.enemies.find((v) => v.type === "boss");
      if (e) {
        const ratio = e.hp / e.maxHp;
        ctx.fillStyle = "rgba(8,10,24,0.8)";
        ctx.fillRect(280, 16, 400, 10);
        ctx.fillStyle = "#ffdb7b";
        ctx.fillRect(280, 16, 400 * ratio, 10);
        ctx.strokeStyle = "rgba(255,219,123,0.45)";
        ctx.strokeRect(280, 16, 400, 10);
      }
    }
  }

  function drawEnemies() {
    for (const e of game.enemies) {
      ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();

      if (e.type === "boss") {
        ctx.strokeStyle = "rgba(255,231,176,0.72)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawBullets() {
    for (const b of game.bullets) {
      ctx.fillStyle = b.allied ? "#a2f4ff" : "#f4fbff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHazards() {
    for (const h of game.hazards) {
      if (h.type === "zone") {
        ctx.fillStyle = `rgba(255,88,137,${0.1 + Math.sin(h.life * 6) * 0.06})`;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,92,135,0.45)";
        ctx.stroke();
      } else {
        ctx.fillStyle = h.type === "bolt" ? "#ff8fb4" : "#ffd17d";
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawDrops() {
    for (const d of game.drops) {
      ctx.fillStyle = d.kind === "heal" ? "#7df6af" : "#3ee6ff";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r + Math.sin(d.life * 8) * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function burst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, r: 1.5 + Math.random() * 2.2, color });
    }
  }

  function spark(x, y, color) {
    game.particles.push({ x, y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.22, r: 2.1, color });
  }

  function uiUpdate() {
    if (!game.player) return;
    const p = game.player;
    ui.hpFill.style.width = `${(p.hp / p.maxHp) * 100}%`;
    ui.threadFill.style.width = `${p.rewind}%`;
    ui.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    ui.threadText.textContent = `${Math.floor(p.rewind)}%`;
    ui.sectorText.textContent = game.bossSpawned ? "Final" : ["I", "II", "III"][game.sector - 1];
    ui.timeText.textContent = formatTime(Math.min(game.time, RUN_LIMIT));
    ui.scoreText.textContent = String(Math.round(game.score));
  }

  function refreshStats() {
    ui.bestText.textContent = `Best Score: ${Math.round(game.save.bestScore || 0)}`;
    ui.clearText.textContent = `Best Clear: ${game.save.bestClear ? formatTime(game.save.bestClear) : "--:--"}`;
  }

  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (data && typeof data === "object") {
        game.save = {
          bestScore: data.bestScore || 0,
          bestClear: data.bestClear || null,
          settings: { ...defaultSettings, ...(data.settings || {}) },
          snapshot: data.snapshot || null
        };
      }
    } catch {
      game.save = { bestScore: 0, bestClear: null, settings: { ...defaultSettings }, snapshot: null };
    }
    game.settings = { ...defaultSettings, ...game.save.settings };
  }

  function persistSave() {
    game.save.settings = { ...game.settings };
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));
  }

  function applySettingsToUI() {
    volumeRange.value = String(game.settings.volume);
    volumeText.textContent = `${game.settings.volume}%`;
    difficultySelect.value = game.settings.difficulty;
    hudScaleSelect.value = game.settings.hudScale;
    setToggle(muteBtn, game.settings.muted);
    setToggle(motionBtn, !game.settings.motionFx, "OFF", "ON");
    document.documentElement.style.setProperty("--hud-scale", game.settings.hudScale);
    syncAudio();
  }

  function setToggle(btn, on, offText = "OFF", onText = "ON") {
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? onText : offText;
  }

  function ensureAudio() {
    if (audio.ready) return;
    try {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      audio.gain = audio.ctx.createGain();
      audio.gain.connect(audio.ctx.destination);
      audio.ready = true;
      syncAudio();
    } catch {
      audio.ready = false;
    }
  }

  function syncAudio() {
    if (!audio.ready) return;
    const vol = game.settings.muted ? 0 : game.settings.volume / 100;
    audio.gain.gain.setValueAtTime(vol, audio.ctx.currentTime);
  }

  function playSfx(name, freq, duration, type = "sine") {
    if (!audio.ready || game.settings.muted) return;
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    if (name === "shoot") osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + duration);
    if (name === "hurt") osc.frequency.exponentialRampToValueAtTime(freq * 1.9, now + duration);
    if (name === "victory") osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + duration * 1.6);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audio.gain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function circleHit(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }

  boot();
})();
