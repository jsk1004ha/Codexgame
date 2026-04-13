(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    hpText: document.getElementById("hpText"),
    hpBar: document.getElementById("hpBar"),
    coreText: document.getElementById("coreText"),
    coreBar: document.getElementById("coreBar"),
    heatText: document.getElementById("heatText"),
    sectorText: document.getElementById("sectorText"),
    timeText: document.getElementById("timeText"),
    scoreText: document.getElementById("scoreText"),
    eventFeed: document.getElementById("eventFeed"),
    title: document.getElementById("titleScreen"),
    options: document.getElementById("optionsScreen"),
    pause: document.getElementById("pauseScreen"),
    credits: document.getElementById("creditsScreen"),
    result: document.getElementById("resultScreen"),
    resultTitle: document.getElementById("resultTitle"),
    resultSummary: document.getElementById("resultSummary"),
    resultStats: document.getElementById("resultStats"),
    continueBtn: document.getElementById("continueBtn"),
    masterVolume: document.getElementById("masterVolume"),
    sfxVolume: document.getElementById("sfxVolume"),
    shakeToggle: document.getElementById("shakeToggle"),
    contrastToggle: document.getElementById("contrastToggle"),
    difficultySelect: document.getElementById("difficultySelect")
  };

  const SETTINGS_KEY = "sunshard.settings";
  const SAVE_KEY = "sunshard.save";
  const BEST_KEY = "sunshard.best";

  const keys = new Set();
  const pointer = { x: canvas.width / 2, y: canvas.height / 2 };

  const stageData = [
    { name: "I", duration: 180, tint: "#2b1711", enemyBias: ["raider", "runner"] },
    { name: "II", duration: 210, tint: "#1f1f12", enemyBias: ["runner", "artillery", "raider"] },
    { name: "III", duration: 240, tint: "#131a22", enemyBias: ["wisp", "artillery", "raider"] },
    { name: "IV", duration: 240, tint: "#2b121f", enemyBias: ["wisp", "hunter", "artillery"] }
  ];

  const difficultyTuning = {
    story: { enemyHp: 0.8, enemyDmg: 0.75, spawn: 0.86, coreDrain: 0.8 },
    normal: { enemyHp: 1, enemyDmg: 1, spawn: 1, coreDrain: 1 },
    veteran: { enemyHp: 1.2, enemyDmg: 1.25, spawn: 1.18, coreDrain: 1.2 }
  };

  let settings = loadSettings();
  applySettingsToControls();

  const game = {
    state: "title",
    player: null,
    core: null,
    enemies: [],
    projectiles: [],
    effects: [],
    pickups: [],
    score: 0,
    elapsed: 0,
    runSeed: Math.random(),
    stageIndex: 0,
    stageTime: 0,
    spawnTimer: 1.8,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    upgradesTaken: [],
    tutorialStep: 0,
    boss: null,
    bossSpawned: false,
    shake: 0,
    runSaved: false
  };

  const audio = createAudio();
  pushEvent("성소 연결 완료. 코어를 지켜내십시오.");

  function startNewRun() {
    game.state = "playing";
    game.player = { x: 640, y: 530, vx: 0, vy: 0, hp: 100, maxHp: 100, speed: 240, radius: 15, cooldown: 0, dash: 0, pulse: 0, invuln: 0, heat: 0, chain: 1, piercing: 0, regen: 0 };
    game.core = { x: 640, y: 360, hp: 100, maxHp: 100, radius: 30 };
    game.enemies = [];
    game.projectiles = [];
    game.effects = [];
    game.pickups = [];
    game.score = 0;
    game.elapsed = 0;
    game.stageIndex = 0;
    game.stageTime = 0;
    game.spawnTimer = 1.4;
    game.combo = 0;
    game.comboTimer = 0;
    game.kills = 0;
    game.upgradesTaken = [];
    game.tutorialStep = 0;
    game.boss = null;
    game.bossSpawned = false;
    hideAllOverlays();
    pushEvent("작전 개시: Sector I");
  }

  function update(dt) {
    if (game.state !== "playing") return;
    game.elapsed += dt;
    game.stageTime += dt;
    const stage = stageData[Math.min(game.stageIndex, stageData.length - 1)];

    if (game.stageIndex < stageData.length && game.stageTime > stage.duration) {
      game.stageIndex += 1;
      game.stageTime = 0;
      if (game.stageIndex < stageData.length) {
        pushEvent(`Sector ${stageData[game.stageIndex].name} 진입: 적 패턴 변화 감지`);
        grantStageUpgrade();
      } else {
        pushEvent("Apex Arbiter 접근 중 — 최종 전투 준비");
      }
    }

    if (!game.bossSpawned && game.stageIndex >= stageData.length) {
      spawnBoss();
    }

    updatePlayer(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updatePickups(dt);
    updateCombo(dt);

    if (game.player.regen > 0) {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + game.player.regen * dt);
    }

    if (game.player.hp <= 0 || game.core.hp <= 0) {
      endRun(false);
    }

    if (game.boss && game.boss.hp <= 0) {
      endRun(true);
    }

    saveRunSnapshot();
    syncHUD();
  }

  function updatePlayer(dt) {
    const p = game.player;
    const moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    const moveY = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
    const mag = Math.hypot(moveX, moveY) || 1;
    const boost = p.dash > 0 ? 1.9 : 1;
    p.vx = (moveX / mag) * p.speed * boost;
    p.vy = (moveY / mag) * p.speed * boost;
    p.x = clamp(p.x + p.vx * dt, 32, canvas.width - 32);
    p.y = clamp(p.y + p.vy * dt, 42, canvas.height - 32);

    p.cooldown = Math.max(0, p.cooldown - dt);
    p.dash = Math.max(0, p.dash - dt);
    p.pulse = Math.max(0, p.pulse - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.heat = Math.max(0, p.heat - 24 * dt);

    if (keys.has(" ") && p.cooldown <= 0 && p.heat < 100) {
      const target = findTarget();
      const angle = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(pointer.y - p.y, pointer.x - p.x);
      fireSlash(angle);
      p.cooldown = 0.21;
      p.heat = Math.min(100, p.heat + 18);
    }

    if ((keys.has("shift") || keys.has("shiftleft") || keys.has("shiftright")) && p.dash <= 0 && p.heat < 90) {
      p.dash = 0.18;
      p.invuln = 0.2;
      p.heat = Math.min(100, p.heat + 15);
      spawnEffect(p.x, p.y, 32, "#ffd76a", 0.22);
      audio.beep(200, 0.04, 0.15, "triangle");
    }

    if (keys.has("e") && p.pulse <= 0) {
      p.pulse = 8;
      emitPulse();
    }

    if (p.heat >= 100) {
      p.hp -= 10 * dt;
    }

    if (game.tutorialStep === 0 && game.elapsed > 8) {
      pushEvent("팁: Space 공격으로 파편을 모아 강화 선택을 해금하세요.");
      game.tutorialStep = 1;
    }
    if (game.tutorialStep === 1 && game.kills >= 12) {
      pushEvent("팁: Shift 대시는 무적 판정을 가집니다.");
      game.tutorialStep = 2;
    }
  }

  function fireSlash(angle) {
    const p = game.player;
    for (let i = 0; i < p.chain; i += 1) {
      const spread = (i - (p.chain - 1) / 2) * 0.16;
      game.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(angle + spread) * 560, vy: Math.sin(angle + spread) * 560, life: 0.8, damage: 18 + p.piercing * 4, radius: 6, friendly: true, pierce: p.piercing });
    }
    spawnEffect(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16, 18, "#ff8a3d", 0.14);
    audio.beep(320, 0.03, 0.16, "square");
  }

  function emitPulse() {
    const p = game.player;
    spawnEffect(p.x, p.y, 120, "#83ffb2", 0.55);
    for (const enemy of game.enemies) {
      const d = dist(p, enemy);
      if (d < 170) {
        enemy.hp -= 30;
        enemy.vx += (enemy.x - p.x) / Math.max(1, d) * 120;
        enemy.vy += (enemy.y - p.y) / Math.max(1, d) * 120;
      }
    }
    pushEvent("Sigil Pulse 발동: 근접 적을 밀어냈습니다.");
    audio.beep(140, 0.08, 0.22, "sawtooth");
  }

  function updateSpawning(dt) {
    const diff = difficultyTuning[settings.difficulty];
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      const stage = stageData[Math.min(game.stageIndex, stageData.length - 1)];
      const count = 1 + Math.floor(game.elapsed / 140);
      for (let i = 0; i < count; i += 1) {
        spawnEnemy(stage.enemyBias[Math.floor(Math.random() * stage.enemyBias.length)], diff);
      }
      game.spawnTimer = Math.max(0.38, (1.55 - game.stageIndex * 0.18 - game.elapsed / 900) / diff.spawn);
    }
  }

  function spawnEnemy(type, diff) {
    const edge = Math.floor(Math.random() * 4);
    const pos = [
      { x: Math.random() * canvas.width, y: -30 },
      { x: canvas.width + 30, y: Math.random() * canvas.height },
      { x: Math.random() * canvas.width, y: canvas.height + 30 },
      { x: -30, y: Math.random() * canvas.height }
    ][edge];
    const base = {
      raider: { hp: 42, speed: 76, damage: 13, radius: 13, color: "#d97e55" },
      runner: { hp: 26, speed: 132, damage: 9, radius: 10, color: "#f6bf5d" },
      artillery: { hp: 46, speed: 52, damage: 16, radius: 14, color: "#8aa7ff", shoot: 2.4 },
      wisp: { hp: 33, speed: 98, damage: 14, radius: 11, color: "#7ce3db", phase: true },
      hunter: { hp: 70, speed: 112, damage: 22, radius: 16, color: "#ff5c8f", rush: 3.2 }
    }[type] || { hp: 40, speed: 80, damage: 12, radius: 12, color: "#ddd" };
    game.enemies.push({ type, x: pos.x, y: pos.y, vx: 0, vy: 0, hp: base.hp * diff.enemyHp, maxHp: base.hp * diff.enemyHp, speed: base.speed, damage: base.damage * diff.enemyDmg, radius: base.radius, color: base.color, shoot: base.shoot || 0, rush: base.rush || 0, cool: Math.random() * 2 });
  }

  function spawnBoss() {
    game.bossSpawned = true;
    game.boss = { x: 640, y: -120, vx: 0, vy: 45, hp: 2200, maxHp: 2200, radius: 52, phase: 1, cool: 2.6 };
    game.enemies.push(game.boss);
    pushEvent("⚠ Apex Arbiter 강하! 패턴을 읽고 코어를 사수하라.");
    audio.beep(90, 0.18, 0.35, "triangle");
  }

  function updateEnemies(dt) {
    const p = game.player;
    const core = game.core;
    for (const e of game.enemies) {
      if (e === game.boss) {
        updateBoss(dt, e);
        continue;
      }
      const target = Math.random() < 0.65 ? core : p;
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * e.speed * dt;
      e.vy += (dy / d) * e.speed * dt;
      e.vx *= 0.9;
      e.vy *= 0.9;
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      e.cool -= dt;
      if (e.type === "artillery" && e.cool <= 0) {
        e.cool = 2.8;
        const angle = Math.atan2(core.y - e.y, core.x - e.x);
        game.projectiles.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 190, vy: Math.sin(angle) * 190, life: 4, damage: e.damage, radius: 7, friendly: false, pierce: 0 });
      }
      if (e.type === "hunter" && e.cool <= 0) {
        e.cool = 3.4;
        const angle = Math.atan2(p.y - e.y, p.x - e.x);
        e.vx += Math.cos(angle) * 280;
        e.vy += Math.sin(angle) * 280;
      }

      const hitPlayer = dist(e, p) < e.radius + p.radius;
      const hitCore = dist(e, core) < e.radius + core.radius;
      if (hitPlayer && p.invuln <= 0) {
        p.hp -= e.damage;
        p.invuln = 0.28;
        spawnEffect(p.x, p.y, 22, "#ff4d57", 0.2);
        audio.beep(130, 0.05, 0.2, "square");
      }
      if (hitCore) {
        core.hp -= e.damage * 0.26;
        e.hp = -1;
        spawnEffect(core.x, core.y, 26, "#ff4d57", 0.22);
      }
    }

    for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
      const e = game.enemies[i];
      if (e.hp <= 0) {
        if (e !== game.boss) {
          game.score += 18;
          game.kills += 1;
          game.combo += 1;
          game.comboTimer = 3.2;
          if (Math.random() < 0.14) {
            game.pickups.push({ x: e.x, y: e.y, type: Math.random() < 0.65 ? "scrap" : "heal", ttl: 14 });
          }
        }
        game.enemies.splice(i, 1);
      }
    }
  }

  function updateBoss(dt, b) {
    const core = game.core;
    if (b.y < 180) {
      b.y += 52 * dt;
      return;
    }
    const t = game.elapsed;
    const targetX = 640 + Math.sin(t * 0.5) * 280;
    const targetY = 160 + Math.cos(t * 0.4) * 60;
    b.x += (targetX - b.x) * 0.8 * dt;
    b.y += (targetY - b.y) * 0.8 * dt;

    if (b.hp < b.maxHp * 0.65) b.phase = 2;
    if (b.hp < b.maxHp * 0.3) b.phase = 3;

    b.cool -= dt;
    if (b.cool <= 0) {
      const burst = 7 + b.phase * 2;
      for (let i = 0; i < burst; i += 1) {
        const a = ((Math.PI * 2) / burst) * i + t;
        game.projectiles.push({ x: b.x, y: b.y, vx: Math.cos(a) * (150 + b.phase * 28), vy: Math.sin(a) * (150 + b.phase * 28), life: 6, damage: 12 + b.phase * 4, radius: 8, friendly: false, pierce: 0 });
      }
      b.cool = Math.max(0.58, 1.6 - b.phase * 0.22);
      pushEvent(`Arbiter 패턴 ${b.phase} 발동`);
      audio.beep(95, 0.07, 0.27, "triangle");
    }

    if (dist(b, core) < b.radius + core.radius + 10) {
      core.hp -= 30 * dt;
    }
  }

  function updateProjectiles(dt) {
    const p = game.player;
    const core = game.core;
    for (let i = game.projectiles.length - 1; i >= 0; i -= 1) {
      const pr = game.projectiles[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0 || pr.x < -30 || pr.y < -30 || pr.x > canvas.width + 30 || pr.y > canvas.height + 30) {
        game.projectiles.splice(i, 1);
        continue;
      }

      if (pr.friendly) {
        for (const e of game.enemies) {
          if (dist(pr, e) < pr.radius + e.radius) {
            e.hp -= pr.damage;
            spawnEffect(pr.x, pr.y, 14, "#ffd76a", 0.1);
            if (pr.pierce > 0) {
              pr.pierce -= 1;
            } else {
              pr.life = 0;
            }
            break;
          }
        }
      } else {
        if (dist(pr, p) < pr.radius + p.radius && p.invuln <= 0) {
          p.hp -= pr.damage;
          p.invuln = 0.16;
          pr.life = 0;
          spawnEffect(p.x, p.y, 18, "#ff4d57", 0.16);
        }
        if (dist(pr, core) < pr.radius + core.radius) {
          core.hp -= pr.damage * 0.6 * difficultyTuning[settings.difficulty].coreDrain;
          pr.life = 0;
        }
      }
    }
  }

  function updateEffects(dt) {
    for (let i = game.effects.length - 1; i >= 0; i -= 1) {
      game.effects[i].ttl -= dt;
      if (game.effects[i].ttl <= 0) game.effects.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = game.player;
    for (let i = game.pickups.length - 1; i >= 0; i -= 1) {
      const it = game.pickups[i];
      it.ttl -= dt;
      if (it.ttl <= 0) {
        game.pickups.splice(i, 1);
        continue;
      }
      if (dist(it, p) < 24) {
        if (it.type === "scrap") {
          game.score += 40;
          if (game.score % 300 < 55) grantRandomUpgrade();
          audio.beep(520, 0.04, 0.18, "triangle");
        } else {
          p.hp = Math.min(p.maxHp, p.hp + 14);
          audio.beep(380, 0.05, 0.17, "sine");
        }
        game.pickups.splice(i, 1);
      }
    }
  }

  function grantStageUpgrade() {
    grantRandomUpgrade(true);
    game.core.hp = Math.min(game.core.maxHp, game.core.hp + 12);
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + 12);
  }

  function grantRandomUpgrade(guaranteed = false) {
    const pool = [
      { id: "chain", name: "Twin Arc", apply: () => game.player.chain = Math.min(3, game.player.chain + 1) },
      { id: "pierce", name: "Molten Pierce", apply: () => game.player.piercing = Math.min(3, game.player.piercing + 1) },
      { id: "regen", name: "Ash Regen", apply: () => game.player.regen = Math.min(2.2, game.player.regen + 0.55) },
      { id: "speed", name: "Rush Servo", apply: () => game.player.speed = Math.min(320, game.player.speed + 18) },
      { id: "core", name: "Core Seal", apply: () => game.core.maxHp += 8 }
    ];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    pick.apply();
    game.upgradesTaken.push(pick.id);
    pushEvent(`강화 획득: ${pick.name}`);
    spawnEffect(game.player.x, game.player.y, 36, "#83ffb2", 0.4);
    if (guaranteed) audio.beep(640, 0.09, 0.22, "sine");
  }

  function updateCombo(dt) {
    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
    } else {
      game.combo = 0;
    }
  }

  function endRun(victory) {
    game.state = "result";
    const best = loadBest();
    const runData = { score: game.score, time: game.elapsed, kills: game.kills, victory };
    if (runData.score > best.score) localStorage.setItem(BEST_KEY, JSON.stringify(runData));
    localStorage.removeItem(SAVE_KEY);

    ui.resultTitle.textContent = victory ? "Victory: Ashen Loop Sealed" : "Defeat: Core Lost";
    ui.resultSummary.textContent = victory ? "최종 심판자를 격파하고 성소를 안정화했습니다." : "침공을 막지 못했습니다. 빌드와 포지션을 재정비하십시오.";
    ui.resultStats.innerHTML = `
      <div>Score: <strong>${Math.floor(game.score)}</strong></div>
      <div>Elapsed: <strong>${formatTime(game.elapsed)}</strong></div>
      <div>Kills: <strong>${game.kills}</strong></div>
      <div>Upgrades: <strong>${game.upgradesTaken.length}</strong></div>
    `;
    showOverlay(ui.result);
    audio.beep(victory ? 780 : 150, 0.2, 0.3, victory ? "sine" : "sawtooth");
  }

  function render() {
    const stage = stageData[Math.min(game.stageIndex, stageData.length - 1)];
    const bg = stage ? stage.tint : "#120d0a";
    const shakeX = settings.shake ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = settings.shake ? (Math.random() - 0.5) * game.shake : 0;
    game.shake = Math.max(0, game.shake - 0.8);

    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawCore();
    drawPickups();
    drawProjectiles();
    drawEnemies();
    drawPlayer();
    drawEffects();
    drawSignatures();

    if (game.boss) drawBossBar();

    ctx.restore();
  }

  function drawGrid() {
    ctx.strokeStyle = "rgba(255,220,160,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawCore() {
    const c = game.core;
    if (!c) return;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius + Math.sin(game.elapsed * 3) * 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,138,61,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd76a";
    ctx.fill();
  }

  function drawPlayer() {
    const p = game.player;
    if (!p) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    const facing = Math.atan2(pointer.y - p.y, pointer.x - p.x);
    ctx.rotate(facing);
    ctx.fillStyle = p.invuln > 0 ? "#fff2bf" : "#ff8a3d";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, 10);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of game.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
      if (e === game.boss) {
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawProjectiles() {
    for (const pr of game.projectiles) {
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
      ctx.fillStyle = pr.friendly ? "#ffd76a" : "#ff4d57";
      ctx.fill();
    }
  }

  function drawPickups() {
    for (const p of game.pickups) {
      ctx.fillStyle = p.type === "scrap" ? "#83ffb2" : "#7ce3db";
      ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
    }
  }

  function drawEffects() {
    for (const fx of game.effects) {
      ctx.globalAlpha = Math.max(0, fx.ttl / fx.max);
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1 - fx.ttl / fx.max + 0.2), 0, Math.PI * 2);
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSignatures() {
    ctx.fillStyle = "rgba(255,138,61,0.06)";
    const r = 260 + Math.sin(game.elapsed * 0.3) * 14;
    ctx.beginPath();
    ctx.arc(640, 360, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBossBar() {
    const b = game.boss;
    const w = 760;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - 32;
    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = "#ff4d57";
    ctx.fillRect(x, y, w * (b.hp / b.maxHp), 14);
    ctx.strokeStyle = "#ffd76a";
    ctx.strokeRect(x, y, w, 14);
    ctx.fillStyle = "#f8eedd";
    ctx.fillText("APEX ARBITER", x, y - 6);
  }

  function pushEvent(text) {
    const p = document.createElement("p");
    p.textContent = text;
    ui.eventFeed.prepend(p);
    while (ui.eventFeed.childElementCount > 4) ui.eventFeed.lastElementChild.remove();
  }

  function syncHUD() {
    const p = game.player;
    const c = game.core;
    if (!p || !c) return;
    ui.hpText.textContent = `${Math.max(0, Math.round(p.hp))}`;
    ui.hpBar.style.width = `${(p.hp / p.maxHp) * 100}%`;
    ui.coreText.textContent = `${Math.max(0, Math.round(c.hp))}`;
    ui.coreBar.style.width = `${(c.hp / c.maxHp) * 100}%`;
    ui.heatText.textContent = `${Math.round(p.heat)}%`;
    ui.sectorText.textContent = game.stageIndex < stageData.length ? stageData[game.stageIndex].name : "FINAL";
    ui.timeText.textContent = formatTime(game.elapsed);
    ui.scoreText.textContent = `${Math.floor(game.score)}`;
  }

  function showOverlay(target) {
    [ui.title, ui.options, ui.pause, ui.credits, ui.result].forEach((el) => el.classList.add("hidden"));
    target.classList.remove("hidden");
  }

  function hideAllOverlays() {
    [ui.title, ui.options, ui.pause, ui.credits, ui.result].forEach((el) => el.classList.add("hidden"));
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function findTarget() {
    let nearest = null;
    let nearestDist = Infinity;
    for (const e of game.enemies) {
      const d = dist(e, game.player);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    return nearest;
  }

  function spawnEffect(x, y, radius, color, ttl) {
    game.effects.push({ x, y, radius, color, ttl, max: ttl });
    game.shake += radius * 0.04;
  }

  function loadSettings() {
    try {
      return { master: 70, sfx: 75, shake: true, contrast: false, difficulty: "normal", ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
    } catch {
      return { master: 70, sfx: 75, shake: true, contrast: false, difficulty: "normal" };
    }
  }

  function applySettingsToControls() {
    ui.masterVolume.value = settings.master;
    ui.sfxVolume.value = settings.sfx;
    ui.shakeToggle.checked = settings.shake;
    ui.contrastToggle.checked = settings.contrast;
    ui.difficultySelect.value = settings.difficulty;
    document.body.classList.toggle("high-contrast", settings.contrast);
    audio.setVolume(settings.master / 100, settings.sfx / 100);
  }

  function persistSettings() {
    settings = {
      master: Number(ui.masterVolume.value),
      sfx: Number(ui.sfxVolume.value),
      shake: ui.shakeToggle.checked,
      contrast: ui.contrastToggle.checked,
      difficulty: ui.difficultySelect.value
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applySettingsToControls();
    pushEvent("옵션 적용 완료");
  }

  function saveRunSnapshot() {
    if (game.state !== "playing") return;
    if (game.elapsed % 5 < 0.02 && !game.runSaved) {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ active: true, stamp: Date.now() }));
      game.runSaved = true;
    }
    if (game.elapsed % 5 > 0.2) {
      game.runSaved = false;
    }
  }

  function hasSave() {
    try {
      return Boolean((JSON.parse(localStorage.getItem(SAVE_KEY)) || {}).active);
    } catch {
      return false;
    }
  }

  function loadBest() {
    try {
      return { score: 0, ...(JSON.parse(localStorage.getItem(BEST_KEY)) || {}) };
    } catch {
      return { score: 0 };
    }
  }

  function createAudio() {
    const ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctxAudio.createGain();
    gain.connect(ctxAudio.destination);
    gain.gain.value = 0.2;
    let m = 0.7;
    let s = 0.75;
    return {
      setVolume(master, sfx) {
        m = master;
        s = sfx;
        gain.gain.value = 0.3 * m;
      },
      beep(freq, dur, vol = 0.16, type = "sine") {
        if (m <= 0 || s <= 0) return;
        const o = ctxAudio.createOscillator();
        const g = ctxAudio.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(gain);
        const now = ctxAudio.currentTime;
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * s), now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.start(now);
        o.stop(now + dur + 0.02);
      }
    };
  }

  document.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === "Escape") {
      if (game.state === "playing") {
        game.state = "paused";
        showOverlay(ui.pause);
      } else if (game.state === "paused") {
        game.state = "playing";
        hideAllOverlays();
      }
    }
    if (e.key.toLowerCase() === "m") {
      ui.masterVolume.value = Number(ui.masterVolume.value) > 0 ? 0 : 70;
      persistSettings();
    }
  });

  document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    pointer.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  });

  document.addEventListener("click", () => {
    if (audio && audio.beep) {
      audio.beep(440, 0.01, 0.001, "sine");
    }
  }, { once: true });

  document.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "new") startNewRun();
      if (action === "continue") {
        startNewRun();
        pushEvent("이전 전술 로그를 바탕으로 작전 재개.");
      }
      if (action === "options") showOverlay(ui.options);
      if (action === "credits") showOverlay(ui.credits);
      if (action === "back-title" || action === "quit") {
        game.state = "title";
        showOverlay(ui.title);
      }
      if (action === "save-options") {
        persistSettings();
        if (game.state === "paused") showOverlay(ui.pause);
        else showOverlay(ui.title);
      }
      if (action === "resume") {
        game.state = "playing";
        hideAllOverlays();
      }
      if (action === "restart") {
        startNewRun();
      }
      audio.beep(260, 0.03, 0.08, "triangle");
    });
  });

  function updateContinueButton() {
    ui.continueBtn.disabled = !hasSave();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    updateContinueButton();
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  showOverlay(ui.title);
  syncHUD();
  requestAnimationFrame(frame);
})();
