(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    shieldFill: document.getElementById("shieldFill"),
    coreFill: document.getElementById("coreFill"),
    shieldText: document.getElementById("shieldText"),
    coreText: document.getElementById("coreText"),
    heatText: document.getElementById("heatText"),
    phaseText: document.getElementById("phaseText"),
    timeText: document.getElementById("timeText"),
    scoreText: document.getElementById("scoreText"),
    objectiveToast: document.getElementById("objectiveToast"),
    controlsInfo: document.getElementById("controlsInfo"),
    bestText: document.getElementById("bestText"),
    runText: document.getElementById("runText"),
    resultHeading: document.getElementById("resultHeading"),
    resultLead: document.getElementById("resultLead"),
    resultScore: document.getElementById("resultScore"),
    resultTime: document.getElementById("resultTime"),
    resultKills: document.getElementById("resultKills"),
    resultPhase: document.getElementById("resultPhase")
  };

  const overlays = {
    title: document.getElementById("titleScreen"),
    options: document.getElementById("optionsScreen"),
    credits: document.getElementById("creditsScreen"),
    pause: document.getElementById("pauseScreen"),
    result: document.getElementById("resultScreen")
  };

  const volumeSlider = document.getElementById("masterVolume");
  const volumeText = document.getElementById("masterVolumeText");
  const muteToggle = document.getElementById("muteToggle");
  const difficultySelect = document.getElementById("difficultySelect");
  const assistToggle = document.getElementById("assistToggle");
  const flashToggle = document.getElementById("flashToggle");
  const hudScaleSelect = document.getElementById("hudScaleSelect");

  const SAVE_KEY = "riftwarden-save-v1";

  const defaultSettings = {
    masterVolume: 80,
    muted: false,
    difficulty: "normal",
    assistRegen: false,
    reducedFlash: false,
    hudScale: "1"
  };

  const difficultyTuning = {
    story: { enemyHp: 0.86, enemyDamage: 0.8, spawnRate: 0.9, scoreMult: 0.9, coreHp: 120, shieldHp: 110 },
    normal: { enemyHp: 1, enemyDamage: 1, spawnRate: 1, scoreMult: 1, coreHp: 100, shieldHp: 100 },
    hard: { enemyHp: 1.2, enemyDamage: 1.25, spawnRate: 1.15, scoreMult: 1.35, coreHp: 90, shieldHp: 90 }
  };

  const game = {
    mode: "title",
    activeOverlay: "title",
    time: 0,
    score: 0,
    kills: 0,
    phase: 1,
    bossActive: false,
    objective: "코어를 방어하고 침공 단계를 버티세요.",
    settings: { ...defaultSettings },
    save: {
      bestScore: 0,
      bestTime: 0,
      clears: 0,
      lastRun: null,
      settings: { ...defaultSettings }
    },
    input: {
      keys: new Set(),
      mouseX: canvas.width / 2,
      mouseY: canvas.height / 2,
      firing: false
    },
    player: null,
    core: null,
    bullets: [],
    enemies: [],
    particles: [],
    hazards: [],
    pickups: [],
    boss: null,
    spawnTimer: 0,
    hazardTimer: 0,
    phaseNotified: new Set(),
    upgradeMoments: new Set(),
    pausedForUpgrade: false,
    upgradeChoices: [],
    shake: 0,
    freeze: 0,
    lastTimestamp: 0
  };

  const audio = {
    ctx: null,
    ready: false,
    masterGain: null
  };

  function boot() {
    loadSave();
    applySettingsToUI();
    bindEvents();
    updateHubStats();
    requestAnimationFrame(loop);
  }

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (parsed && typeof parsed === "object") {
        game.save = {
          ...game.save,
          ...parsed,
          settings: { ...defaultSettings, ...(parsed.settings || {}) }
        };
      }
    } catch {
      // no-op
    }
    game.settings = { ...defaultSettings, ...game.save.settings };
  }

  function persistSave() {
    game.save.settings = { ...game.settings };
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));
  }

  function applySettingsToUI() {
    volumeSlider.value = String(game.settings.masterVolume);
    volumeText.textContent = `${game.settings.masterVolume}%`;
    difficultySelect.value = game.settings.difficulty;
    hudScaleSelect.value = game.settings.hudScale;
    setToggle(muteToggle, game.settings.muted);
    setToggle(assistToggle, game.settings.assistRegen);
    setToggle(flashToggle, game.settings.reducedFlash);
    document.documentElement.style.setProperty("--hud-scale", game.settings.hudScale);
    syncAudioGain();
  }

  function bindEvents() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(btn.dataset.action));
    });

    volumeSlider.addEventListener("input", () => {
      game.settings.masterVolume = Number(volumeSlider.value);
      volumeText.textContent = `${game.settings.masterVolume}%`;
      syncAudioGain();
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
    muteToggle.addEventListener("click", () => {
      game.settings.muted = !game.settings.muted;
      setToggle(muteToggle, game.settings.muted);
      syncAudioGain();
      persistSave();
    });
    assistToggle.addEventListener("click", () => {
      game.settings.assistRegen = !game.settings.assistRegen;
      setToggle(assistToggle, game.settings.assistRegen);
      persistSave();
    });
    flashToggle.addEventListener("click", () => {
      game.settings.reducedFlash = !game.settings.reducedFlash;
      setToggle(flashToggle, game.settings.reducedFlash);
      persistSave();
    });

    window.addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "Escape") {
        if (game.mode === "playing") {
          showOverlay("pause");
          game.mode = "paused";
          playSfx("ui", 240, 0.05, "square");
        } else if (game.mode === "paused") {
          resumeGame();
        }
      }
      game.input.keys.add(event.key.toLowerCase());
    });

    window.addEventListener("keyup", (event) => {
      game.input.keys.delete(event.key.toLowerCase());
    });

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      game.input.mouseX = (event.clientX - rect.left) * sx;
      game.input.mouseY = (event.clientY - rect.top) * sy;
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

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  function handleAction(action) {
    ensureAudio();
    playSfx("ui", 440, 0.07, "triangle");

    if (action === "new" || action === "retry") {
      startRun(true);
      return;
    }

    if (action === "continue") {
      if (game.save.lastRun) {
        restoreLastRun();
      } else {
        startRun(true);
      }
      return;
    }

    if (action === "options") return showOverlay("options");
    if (action === "credits") return showOverlay("credits");
    if (action === "close-options" || action === "close-credits") return showOverlay("title");
    if (action === "resume") return resumeGame();
    if (action === "options-from-pause") return showOverlay("options");
    if (action === "to-title") {
      if (game.mode === "playing" || game.mode === "paused") {
        saveRunSnapshot();
      }
      game.mode = "title";
      showOverlay("title");
      updateHubStats();
      return;
    }
    if (action === "reset-options") {
      game.settings = { ...defaultSettings };
      applySettingsToUI();
      persistSave();
    }
  }

  function setToggle(button, value) {
    button.textContent = value ? "ON" : "OFF";
    button.setAttribute("aria-pressed", value ? "true" : "false");
  }

  function showOverlay(name) {
    Object.entries(overlays).forEach(([key, element]) => {
      element.classList.toggle("active", key === name);
    });
    game.activeOverlay = name;
    if (name === "options") game.mode = game.mode === "paused" ? "paused" : "menu";
  }

  function resumeGame() {
    if (game.mode === "paused" || game.mode === "menu") {
      game.mode = "playing";
      Object.values(overlays).forEach((el) => el.classList.remove("active"));
      game.activeOverlay = "none";
      playSfx("ui", 310, 0.06, "triangle");
    }
  }

  function startRun(clearLast) {
    const tuning = difficultyTuning[game.settings.difficulty] || difficultyTuning.normal;
    game.time = 0;
    game.score = 0;
    game.kills = 0;
    game.phase = 1;
    game.bossActive = false;
    game.enemies = [];
    game.bullets = [];
    game.particles = [];
    game.hazards = [];
    game.pickups = [];
    game.phaseNotified.clear();
    game.upgradeMoments.clear();
    game.pausedForUpgrade = false;
    game.upgradeChoices = [];
    game.spawnTimer = 0;
    game.hazardTimer = 0;
    game.boss = null;

    game.core = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      radius: 34,
      hp: tuning.coreHp,
      maxHp: tuning.coreHp,
      regenBuffer: 0
    };

    game.player = {
      x: canvas.width / 2,
      y: canvas.height / 2 + 120,
      radius: 12,
      speed: 230,
      hp: tuning.shieldHp,
      maxHp: tuning.shieldHp,
      fireCooldown: 0,
      shotRate: 0.14,
      bulletSpeed: 440,
      bulletDamage: 13,
      bulletSpread: 0.04,
      dashCooldown: 0,
      dashWindow: 0,
      dashPower: 260,
      pulseCooldown: 0,
      pulseRadius: 145,
      pulseDamage: 30,
      invuln: 0,
      heat: 0,
      critChance: 0.06,
      pierce: 0,
      coreLink: 0
    };

    if (game.save.clears > 0) {
      game.player.maxHp += 8;
      game.player.hp += 8;
      game.player.bulletDamage += 2;
    }

    if (clearLast) {
      game.save.lastRun = null;
      persistSave();
    }

    game.mode = "playing";
    Object.values(overlays).forEach((el) => el.classList.remove("active"));
    showToast("침공 개시: 코어를 지키고 10분 뒤 지휘자를 격파하라.", 2800);
  }

  function restoreLastRun() {
    if (!game.save.lastRun) return startRun(true);
    startRun(false);
    const data = game.save.lastRun;
    game.time = data.time || 0;
    game.score = data.score || 0;
    game.kills = data.kills || 0;
    game.phase = data.phase || 1;
    game.core.hp = data.coreHp || game.core.maxHp;
    game.player.hp = data.playerHp || game.player.maxHp;
    showToast("저장된 작전을 이어서 시작합니다.", 1800);
  }

  function saveRunSnapshot() {
    if (!game.player || !game.core) return;
    game.save.lastRun = {
      time: game.time,
      score: game.score,
      kills: game.kills,
      phase: game.phase,
      coreHp: game.core.hp,
      playerHp: game.player.hp
    };
    persistSave();
  }

  function loop(timestamp) {
    if (!game.lastTimestamp) game.lastTimestamp = timestamp;
    let dt = (timestamp - game.lastTimestamp) / 1000;
    game.lastTimestamp = timestamp;
    if (dt > 0.05) dt = 0.05;

    if (game.mode === "playing") {
      if (game.freeze > 0) {
        game.freeze -= dt;
      } else {
        update(dt);
      }
    }

    render();
    updateHud();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    game.time += dt;
    const p = game.player;

    handlePhaseProgression();

    p.fireCooldown -= dt;
    p.dashCooldown -= dt;
    p.pulseCooldown -= dt;
    p.invuln -= dt;
    p.heat = Math.max(0, p.heat - dt * 10);
    if (game.settings.assistRegen) {
      p.hp = Math.min(p.maxHp, p.hp + dt * 1.2);
      game.core.hp = Math.min(game.core.maxHp, game.core.hp + dt * 0.55);
    }

    const move = { x: 0, y: 0 };
    if (key("w") || key("arrowup")) move.y -= 1;
    if (key("s") || key("arrowdown")) move.y += 1;
    if (key("a") || key("arrowleft")) move.x -= 1;
    if (key("d") || key("arrowright")) move.x += 1;

    const length = Math.hypot(move.x, move.y) || 1;
    const speed = p.speed + (p.dashWindow > 0 ? p.dashPower : 0);
    p.x += (move.x / length) * speed * dt;
    p.y += (move.y / length) * speed * dt;
    p.dashWindow = Math.max(0, p.dashWindow - dt);

    p.x = clamp(p.x, 20, canvas.width - 20);
    p.y = clamp(p.y, 20, canvas.height - 20);

    if ((key("shift") || key("shiftleft") || key("shiftright")) && p.dashCooldown <= 0) {
      p.dashCooldown = 2.8;
      p.dashWindow = 0.15;
      p.invuln = 0.16;
      p.heat = Math.max(0, p.heat - 15);
      burst(p.x, p.y, "#74d7ff", 18, 80);
      playSfx("dash", 520, 0.09, "sawtooth");
    }

    if ((key("e") || key("q")) && p.pulseCooldown <= 0) {
      p.pulseCooldown = 8;
      emitPulse();
    }

    if ((game.input.firing || key(" ")) && p.fireCooldown <= 0) {
      fireBullet();
    }

    updateSpawning(dt);
    updateHazards(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateParticles(dt);

    if (game.core.hp <= 0 || game.player.hp <= 0) {
      endRun(false);
    }
  }

  function key(name) {
    return game.input.keys.has(name);
  }

  function handlePhaseProgression() {
    let phase = 1;
    if (game.time >= 180) phase = 2;
    if (game.time >= 420) phase = 3;
    if (game.time >= 600) phase = 4;

    if (phase !== game.phase) {
      game.phase = phase;
      notifyPhase(phase);
    }

    [120, 360, 540].forEach((moment) => {
      if (game.time >= moment && !game.upgradeMoments.has(moment)) {
        game.upgradeMoments.add(moment);
        openUpgradeMoment();
      }
    });
  }

  function notifyPhase(phase) {
    if (phase === 2) {
      showToast("2단계 돌입: 스톰 유닛 출현. 지뢰 구역 주의!", 2800);
      playSfx("warn", 180, 0.11, "square");
    } else if (phase === 3) {
      showToast("3단계 돌입: 중장갑 침투대와 균열 폭풍이 시작됩니다.", 3000);
      playSfx("warn", 160, 0.12, "sawtooth");
    } else if (phase === 4 && !game.bossActive) {
      spawnBoss();
      showToast("지휘자 등장: Ember Tyrant를 격파하라!", 3400);
      playSfx("warn", 110, 0.16, "triangle");
    }
  }

  function openUpgradeMoment() {
    game.pausedForUpgrade = true;
    game.mode = "paused";
    const all = [
      { name: "Overclock", text: "사격 속도 +18%", apply: () => (game.player.shotRate *= 0.82) },
      { name: "Flux Barrel", text: "탄환 피해 +4", apply: () => (game.player.bulletDamage += 4) },
      { name: "Reinforced Mesh", text: "쉴드 최대치 +18", apply: () => { game.player.maxHp += 18; game.player.hp += 18; } },
      { name: "Core Bond", text: "코어 최대치 +20", apply: () => { game.core.maxHp += 20; game.core.hp += 20; } },
      { name: "Vector Pierce", text: "탄환 관통 +1", apply: () => (game.player.pierce += 1) },
      { name: "Thermal Vent", text: "열 감소 속도 +35%", apply: () => (game.player.coreLink += 0.35) },
      { name: "Pulse Lens", text: "펄스 반경·피해 증가", apply: () => { game.player.pulseRadius += 30; game.player.pulseDamage += 14; } },
      { name: "Critical Weave", text: "치명타 확률 +8%", apply: () => (game.player.critChance += 0.08) }
    ];

    const choices = pickRandom(all, 3);
    const panel = overlays.pause.querySelector(".menu");
    panel.innerHTML = "";
    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.className = "menu-btn";
      btn.textContent = `${choice.name} · ${choice.text}`;
      btn.addEventListener("click", () => {
        choice.apply();
        game.mode = "playing";
        overlays.pause.classList.remove("active");
        showToast(`${choice.name} 활성화`, 1800);
        playSfx("reward", 720, 0.12, "triangle");
      });
      panel.appendChild(btn);
    });
    const skip = document.createElement("button");
    skip.className = "menu-btn primary";
    skip.textContent = "유지하고 계속 진행";
    skip.addEventListener("click", () => {
      game.mode = "playing";
      overlays.pause.classList.remove("active");
    });
    panel.appendChild(skip);

    overlays.pause.querySelector("h2").textContent = "Tactical Upgrade";
    overlays.pause.querySelector(".subtitle").textContent = "침공 파고를 넘기기 위한 강화를 선택하십시오.";
    showOverlay("pause");
  }

  function updateSpawning(dt) {
    const t = difficultyTuning[game.settings.difficulty];
    game.spawnTimer -= dt;
    if (game.spawnTimer > 0) return;

    const baseRate = game.phase === 1 ? 0.9 : game.phase === 2 ? 0.7 : game.phase === 3 ? 0.52 : 0.8;
    game.spawnTimer = baseRate / t.spawnRate;

    if (game.phase === 4) {
      if (Math.random() < 0.6) spawnEnemy("striker");
      if (Math.random() < 0.4) spawnEnemy("elite");
      return;
    }

    spawnEnemy("drone");
    if (game.time > 90 && Math.random() < 0.4) spawnEnemy("striker");
    if (game.phase >= 2 && Math.random() < 0.35) spawnEnemy("mine");
    if (game.phase >= 3 && Math.random() < 0.28) spawnEnemy("elite");
  }

  function spawnEnemy(type) {
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = Math.random() * canvas.width;
      y = -20;
    } else if (edge === 1) {
      x = canvas.width + 20;
      y = Math.random() * canvas.height;
    } else if (edge === 2) {
      x = Math.random() * canvas.width;
      y = canvas.height + 20;
    } else {
      x = -20;
      y = Math.random() * canvas.height;
    }

    const tune = difficultyTuning[game.settings.difficulty];
    const stats = {
      drone: { hp: 32, speed: 76, dmg: 8, radius: 10, color: "#ff6f9e", score: 24 },
      striker: { hp: 48, speed: 114, dmg: 10, radius: 12, color: "#ff9f6c", score: 36 },
      mine: { hp: 28, speed: 58, dmg: 16, radius: 11, color: "#ffd96f", score: 40, mine: true },
      elite: { hp: 120, speed: 82, dmg: 16, radius: 16, color: "#bc7bff", score: 96 }
    }[type];

    game.enemies.push({
      type,
      x,
      y,
      hp: stats.hp * tune.enemyHp,
      maxHp: stats.hp * tune.enemyHp,
      speed: stats.speed,
      damage: stats.dmg * tune.enemyDamage,
      radius: stats.radius,
      color: stats.color,
      score: stats.score,
      mine: Boolean(stats.mine),
      cooldown: 0
    });
  }

  function spawnBoss() {
    game.bossActive = true;
    game.boss = {
      x: canvas.width / 2,
      y: 90,
      radius: 36,
      hp: 4100 * difficultyTuning[game.settings.difficulty].enemyHp,
      maxHp: 4100 * difficultyTuning[game.settings.difficulty].enemyHp,
      angle: 0,
      attackTimer: 1.2,
      phase: 1
    };
  }

  function updateHazards(dt) {
    if (game.phase >= 2) {
      game.hazardTimer -= dt;
      if (game.hazardTimer <= 0) {
        game.hazardTimer = game.phase === 2 ? 7.6 : 5.8;
        game.hazards.push({
          x: Math.random() * (canvas.width - 140) + 70,
          y: Math.random() * (canvas.height - 140) + 70,
          radius: game.phase === 2 ? 52 : 66,
          life: game.phase === 2 ? 4.2 : 5.2,
          damage: game.phase === 2 ? 10 : 14
        });
      }
    }

    for (let i = game.hazards.length - 1; i >= 0; i -= 1) {
      const hz = game.hazards[i];
      hz.life -= dt;
      if (hz.life <= 0) {
        game.hazards.splice(i, 1);
        continue;
      }
      const dPlayer = dist(hz, game.player);
      const dCore = dist(hz, game.core);
      if (dPlayer < hz.radius + game.player.radius) {
        damagePlayer(hz.damage * dt);
      }
      if (dCore < hz.radius + game.core.radius) {
        game.core.hp -= hz.damage * 0.6 * dt;
      }
    }
  }

  function fireBullet() {
    const p = game.player;
    const angle = Math.atan2(game.input.mouseY - p.y, game.input.mouseX - p.x);
    const spread = (Math.random() - 0.5) * p.bulletSpread;
    const finalAngle = angle + spread;
    const speed = p.bulletSpeed;
    const heatPenalty = p.heat > 85 ? 0.65 : 1;

    game.bullets.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      life: 1.6,
      damage: p.bulletDamage * heatPenalty,
      pierce: p.pierce,
      crit: Math.random() < p.critChance
    });

    p.fireCooldown = p.shotRate;
    p.heat = Math.min(100, p.heat + 6);

    if (p.coreLink > 0) {
      p.heat = Math.max(0, p.heat - p.coreLink * 1.3);
    }

    playSfx("shoot", 420 + Math.random() * 80, 0.03, "square");
  }

  function emitPulse() {
    const p = game.player;
    burst(p.x, p.y, "#77e7ff", 28, p.pulseRadius);
    game.enemies.forEach((enemy) => {
      const d = dist(enemy, p);
      if (d < p.pulseRadius) {
        enemy.hp -= p.pulseDamage;
        const n = normalize(enemy.x - p.x, enemy.y - p.y);
        enemy.x += n.x * 18;
        enemy.y += n.y * 18;
      }
    });
    if (game.boss) {
      const d = dist(game.boss, p);
      if (d < p.pulseRadius + 40) {
        game.boss.hp -= p.pulseDamage * 0.75;
      }
    }
    game.freeze = 0.03;
    playSfx("pulse", 220, 0.11, "sine");
  }

  function updateBullets(dt) {
    for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
      const b = game.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > canvas.width + 20 || b.y < -20 || b.y > canvas.height + 20) {
        game.bullets.splice(i, 1);
        continue;
      }

      for (let j = game.enemies.length - 1; j >= 0; j -= 1) {
        const e = game.enemies[j];
        if (dist(b, e) < e.radius + 4) {
          const dmg = b.crit ? b.damage * 1.65 : b.damage;
          e.hp -= dmg;
          burst(b.x, b.y, b.crit ? "#7ff7a2" : "#77e7ff", 6, 24);
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            game.bullets.splice(i, 1);
          }
          break;
        }
      }

      if (game.boss && dist(b, game.boss) < game.boss.radius + 5) {
        game.boss.hp -= b.damage;
        burst(b.x, b.y, "#ffb3e0", 6, 24);
        if (b.pierce > 0) b.pierce -= 1;
        else game.bullets.splice(i, 1);
      }
    }
  }

  function updateEnemies(dt) {
    for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = game.enemies[i];
      const target = dist(enemy, game.player) < 180 ? game.player : game.core;
      const n = normalize(target.x - enemy.x, target.y - enemy.y);
      enemy.x += n.x * enemy.speed * dt;
      enemy.y += n.y * enemy.speed * dt;

      enemy.cooldown -= dt;
      const touchPlayer = dist(enemy, game.player) < enemy.radius + game.player.radius;
      const touchCore = dist(enemy, game.core) < enemy.radius + game.core.radius;

      if (touchPlayer && enemy.cooldown <= 0) {
        damagePlayer(enemy.damage);
        enemy.cooldown = 0.7;
        if (enemy.mine) enemy.hp = 0;
      }

      if (touchCore && enemy.cooldown <= 0) {
        game.core.hp -= enemy.damage;
        enemy.cooldown = 0.9;
        if (enemy.mine) enemy.hp = 0;
        burst(enemy.x, enemy.y, "#ff5a8f", 10, 30);
        playSfx("hit", 160, 0.07, "sawtooth");
      }

      if (enemy.hp <= 0) {
        game.score += Math.round(enemy.score * difficultyTuning[game.settings.difficulty].scoreMult);
        game.kills += 1;
        if (Math.random() < 0.08) {
          game.pickups.push({ x: enemy.x, y: enemy.y, r: 7, type: Math.random() < 0.5 ? "repair" : "cool" });
        }
        burst(enemy.x, enemy.y, enemy.color, 12, 44);
        game.enemies.splice(i, 1);
        playSfx("kill", 360, 0.06, "triangle");
      }
    }

    if (game.boss) {
      const b = game.boss;
      b.angle += dt;
      b.x = canvas.width / 2 + Math.cos(b.angle * 0.75) * 180;
      b.attackTimer -= dt;
      if (b.hp < b.maxHp * 0.45) b.phase = 2;

      if (b.attackTimer <= 0) {
        b.attackTimer = b.phase === 1 ? 1.1 : 0.72;
        for (let k = 0; k < (b.phase === 1 ? 6 : 10); k += 1) {
          const angle = (Math.PI * 2 * k) / (b.phase === 1 ? 6 : 10) + b.angle;
          game.hazards.push({
            x: b.x + Math.cos(angle) * 40,
            y: b.y + Math.sin(angle) * 40,
            radius: 26,
            life: 2.1,
            damage: b.phase === 1 ? 11 : 16
          });
        }
        playSfx("warn", 130, 0.09, "square");
      }

      if (dist(b, game.player) < b.radius + game.player.radius + 5) {
        damagePlayer(18 * dt);
      }
      if (dist(b, game.core) < b.radius + game.core.radius + 8) {
        game.core.hp -= 12 * dt;
      }

      if (b.hp <= 0) {
        game.score += 1800;
        burst(b.x, b.y, "#7ff7a2", 80, 220);
        game.boss = null;
        endRun(true);
      }
    }
  }

  function damagePlayer(amount) {
    if (game.player.invuln > 0) return;
    game.player.hp -= amount;
    game.player.invuln = 0.24;
    game.shake = Math.min(12, game.shake + 3.4);
    playSfx("hit", 190, 0.06, "sawtooth");
  }

  function updatePickups(dt) {
    for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
      const pk = game.pickups[i];
      pk.r += Math.sin(game.time * 4 + i) * 0.04;
      if (dist(pk, game.player) < game.player.radius + pk.r + 3) {
        if (pk.type === "repair") {
          game.player.hp = Math.min(game.player.maxHp, game.player.hp + 16);
          game.core.hp = Math.min(game.core.maxHp, game.core.hp + 8);
        } else {
          game.player.heat = Math.max(0, game.player.heat - 30);
          game.player.pulseCooldown = Math.max(0, game.player.pulseCooldown - 1.5);
        }
        playSfx("reward", 680, 0.09, "triangle");
        game.pickups.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const p = game.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) game.particles.splice(i, 1);
    }
  }

  function endRun(victory) {
    game.mode = "result";

    if (game.score > game.save.bestScore) game.save.bestScore = game.score;
    if (game.time > game.save.bestTime) game.save.bestTime = game.time;
    if (victory) game.save.clears += 1;
    game.save.lastRun = null;
    persistSave();

    ui.resultHeading.textContent = victory ? "Mission Clear" : "System Collapse";
    ui.resultLead.textContent = victory
      ? "지휘자를 격파해 균열 요새를 안정화했습니다."
      : "코어 붕괴로 작전이 중단되었습니다.";
    ui.resultScore.textContent = String(Math.round(game.score));
    ui.resultTime.textContent = formatTime(game.time);
    ui.resultKills.textContent = String(game.kills);
    ui.resultPhase.textContent = `${game.phase}`;

    showOverlay("result");
    updateHubStats();
    playSfx(victory ? "reward" : "warn", victory ? 900 : 150, 0.15, "triangle");
  }

  function updateHubStats() {
    ui.bestText.textContent = `Best Score: ${Math.round(game.save.bestScore)}`;
    ui.runText.textContent = `Best Survival: ${formatTime(game.save.bestTime)} · Clears: ${game.save.clears}`;

    const continueBtn = overlays.title.querySelector('[data-action="continue"]');
    continueBtn.disabled = !game.save.lastRun;
  }

  function render() {
    const shakeX = game.settings.reducedFlash ? 0 : (Math.random() - 0.5) * game.shake;
    const shakeY = game.settings.reducedFlash ? 0 : (Math.random() - 0.5) * game.shake;
    game.shake = Math.max(0, game.shake - 0.9);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(shakeX, shakeY);

    drawBackground();
    drawArena();
    drawHazards();
    drawCore();
    drawPickups();
    drawEnemies();
    drawBoss();
    drawBullets();
    drawPlayer();
    drawParticles();

    ctx.restore();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, "#0c1530");
    g.addColorStop(1, "#090d1c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(120,145,255,0.13)";
    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(game.time + x * 0.02) * 4, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }

  function drawArena() {
    ctx.strokeStyle = "rgba(119, 231, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  }

  function drawCore() {
    const c = game.core;
    if (!c) return;
    const pulse = 1 + Math.sin(game.time * 3.2) * 0.05;
    ctx.beginPath();
    ctx.fillStyle = "rgba(86, 240, 182, 0.16)";
    ctx.arc(c.x, c.y, c.radius * 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#7ff7a2";
    ctx.arc(c.x, c.y, c.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(127, 247, 162, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPlayer() {
    const p = game.player;
    if (!p) return;

    const angle = Math.atan2(game.input.mouseY - p.y, game.input.mouseX - p.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    ctx.fillStyle = p.invuln > 0 ? "#ffffff" : "#77e7ff";
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, 9);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, -9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(119, 231, 255, 0.3)";
    ctx.fillRect(-14, -2, 12, 4);
    ctx.restore();

    if (p.pulseCooldown <= 0) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(119, 231, 255, 0.24)";
      ctx.arc(p.x, p.y, p.pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const e of game.enemies) {
      ctx.beginPath();
      ctx.fillStyle = e.color;
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(6, 8, 16, 0.7)";
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, e.radius * 2, 4);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(e.x - e.radius, e.y - e.radius - 8, (e.hp / e.maxHp) * e.radius * 2, 4);
    }
  }

  function drawBullets() {
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.fillStyle = b.crit ? "#7ff7a2" : "#77e7ff";
      ctx.arc(b.x, b.y, b.crit ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHazards() {
    for (const h of game.hazards) {
      const alpha = Math.min(0.35, h.life * 0.09);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 90, 143, ${alpha})`;
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 142, 180, 0.7)";
      ctx.stroke();
    }
  }

  function drawPickups() {
    for (const p of game.pickups) {
      ctx.beginPath();
      ctx.fillStyle = p.type === "repair" ? "#7ff7a2" : "#6fd7ff";
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoss() {
    if (!game.boss) return;
    const b = game.boss;
    ctx.beginPath();
    ctx.fillStyle = "#ff86c4";
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffe4f4";
    ctx.lineWidth = 3;
    ctx.stroke();

    const barW = 360;
    const barX = canvas.width / 2 - barW / 2;
    const barY = 24;
    ctx.fillStyle = "rgba(7, 10, 19, 0.76)";
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = "#ff6ab0";
    ctx.fillRect(barX, barY, (b.hp / b.maxHp) * barW, 14);
    ctx.strokeStyle = "rgba(255, 224, 242, 0.85)";
    ctx.strokeRect(barX, barY, barW, 14);

    ctx.fillStyle = "#ffe4f4";
    ctx.font = "700 12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("EMBER TYRANT", canvas.width / 2, 20);
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }

  function burst(x, y, color, count, force) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = Math.random() * force;
      game.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.4 + Math.random() * 0.4,
        size: 2 + Math.random() * 3,
        color
      });
    }
  }

  function updateHud() {
    if (!game.player || !game.core) return;
    const p = game.player;
    const c = game.core;

    ui.shieldFill.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`;
    ui.coreFill.style.width = `${clamp((c.hp / c.maxHp) * 100, 0, 100)}%`;
    ui.shieldText.textContent = `${Math.max(0, Math.round(p.hp))} / ${Math.round(p.maxHp)}`;
    ui.coreText.textContent = `${Math.max(0, Math.round(c.hp))} / ${Math.round(c.maxHp)}`;
    ui.heatText.textContent = `${Math.round(p.heat)}%`;
    ui.timeText.textContent = formatTime(game.time);
    ui.scoreText.textContent = `${Math.round(game.score)}`;

    const phaseMap = {
      1: "1 · Breach",
      2: "2 · Storm",
      3: "3 · Siege",
      4: "4 · Tyrant"
    };
    ui.phaseText.textContent = phaseMap[game.phase] || "4 · Tyrant";
  }

  let toastTimer;
  function showToast(text, duration = 2000) {
    ui.objectiveToast.textContent = text;
    ui.objectiveToast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.objectiveToast.classList.remove("show"), duration);
  }

  function formatTime(seconds) {
    const sec = Math.max(0, Math.floor(seconds));
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  function pickRandom(arr, amount) {
    const copy = [...arr];
    const out = [];
    for (let i = 0; i < amount && copy.length; i += 1) {
      const index = Math.floor(Math.random() * copy.length);
      out.push(copy.splice(index, 1)[0]);
    }
    return out;
  }

  function ensureAudio() {
    if (audio.ready) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return;
    }
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.masterGain = audio.ctx.createGain();
    audio.masterGain.connect(audio.ctx.destination);
    audio.ready = true;
    syncAudioGain();
  }

  function syncAudioGain() {
    if (!audio.ready) return;
    const gain = game.settings.muted ? 0 : game.settings.masterVolume / 100;
    audio.masterGain.gain.value = gain;
  }

  function playSfx(type, freq, duration, wave) {
    if (!audio.ready || game.settings.muted || game.settings.masterVolume <= 0) return;
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);

    if (type === "warn") {
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.8), now + duration);
    } else if (type === "reward") {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + duration);
    } else if (type === "hit") {
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.6), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(audio.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  boot();
})();
