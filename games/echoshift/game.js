(() => {
  "use strict";

  const STORAGE_KEY = "echoshift_night_circuit_v1";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    phaseLabel: document.getElementById("phaseLabel"),
    objectiveLabel: document.getElementById("objectiveLabel"),
    timeLabel: document.getElementById("timeLabel"),
    scoreLabel: document.getElementById("scoreLabel"),
    bestLabel: document.getElementById("bestLabel"),
    hpFill: document.getElementById("hpFill"),
    hpText: document.getElementById("hpText"),
    energyFill: document.getElementById("energyFill"),
    energyText: document.getElementById("energyText"),
    title: document.getElementById("titleScreen"),
    option: document.getElementById("optionScreen"),
    upgrade: document.getElementById("upgradeScreen"),
    upgradeGrid: document.getElementById("upgradeGrid"),
    pause: document.getElementById("pauseScreen"),
    result: document.getElementById("resultScreen"),
    resultTitle: document.getElementById("resultTitle"),
    resultDesc: document.getElementById("resultDesc"),
    resultStats: document.getElementById("resultStats"),
    credit: document.getElementById("creditScreen"),
    toast: document.getElementById("toast"),
    difficulty: document.getElementById("difficulty"),
    volume: document.getElementById("masterVolume"),
    mute: document.getElementById("muteToggle"),
    shake: document.getElementById("shakeToggle"),
    flash: document.getElementById("flashToggle")
  };

  const state = {
    screen: "title",
    score: 0,
    bestScore: 0,
    startTime: 0,
    elapsed: 0,
    kills: 0,
    chapters: [
      { name: "구역 I · 네온 골목", goal: "드론 40기 처치", reqKills: 40, bg: [12, 24, 56] },
      { name: "구역 II · 펄스 통로", goal: "데이터 노드 4개 확보", reqNodes: 4, bg: [28, 18, 48] },
      { name: "구역 III · 붕괴 중심", goal: "생존 + 센티넬 대비", duration: 210, bg: [40, 10, 26] },
      { name: "최종전 · 루인 센티넬", goal: "보스 격파", boss: true, bg: [8, 8, 16] }
    ],
    chapterIndex: 0,
    chapterTime: 0,
    nodesCaptured: 0,
    gameOverReason: "",
    options: {
      difficulty: "normal",
      volume: 0.7,
      muted: false,
      shake: true,
      flash: true
    },
    player: null,
    bullets: [],
    enemies: [],
    enemyBullets: [],
    particles: [],
    texts: [],
    boss: null,
    spawnTimer: 0,
    fireTimer: 0,
    invulnTimer: 0,
    pulseCooldown: 0,
    combo: 1,
    comboTimer: 0,
    shakePower: 0,
    upgradePool: [
      { id: "firerate", name: "오버클럭", desc: "발사 속도 +20%", apply: (p) => (p.fireRate *= 0.8) },
      { id: "power", name: "플라즈마 렌즈", desc: "피해량 +1", apply: (p) => (p.damage += 1) },
      { id: "shield", name: "탄성 장갑", desc: "최대 내구도 +20", apply: (p) => ((p.maxHp += 20), (p.hp += 20)) },
      { id: "speed", name: "서보 부스터", desc: "이동 속도 +14%", apply: (p) => (p.speed *= 1.14) },
      { id: "energy", name: "에너지 코일", desc: "에너지 획득 +35%", apply: (p) => (p.energyGain *= 1.35) },
      { id: "dash", name: "제트 루프", desc: "대시 재사용 -0.35초", apply: (p) => (p.dashCooldown = Math.max(1.2, p.dashCooldown - 0.35)) }
    ]
  };

  const keys = new Set();
  let raf = 0;
  let last = performance.now();
  let audioCtx;

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.bestScore = Number.isFinite(data.bestScore) ? data.bestScore : 0;
      Object.assign(state.options, data.options || {});
    } catch (_) {}
  }

  function saveData() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bestScore: state.bestScore, options: state.options })
    );
  }

  function difficultyScale() {
    return state.options.difficulty === "hard" ? 1.25 : state.options.difficulty === "assist" ? 0.82 : 1;
  }

  function setupPlayer() {
    const scale = difficultyScale();
    state.player = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      r: 15,
      speed: 250,
      maxHp: Math.round(100 / (scale > 1 ? 1.12 : 0.96)),
      hp: Math.round(100 / (scale > 1 ? 1.12 : 0.96)),
      damage: 4,
      fireRate: 0.22,
      energy: 0,
      energyGain: 1,
      dashTimer: 0,
      dashCooldown: 2.5
    };
  }

  function resetRun() {
    state.score = 0;
    state.kills = 0;
    state.chapterIndex = 0;
    state.chapterTime = 0;
    state.nodesCaptured = 0;
    state.gameOverReason = "";
    state.bullets = [];
    state.enemies = [];
    state.enemyBullets = [];
    state.particles = [];
    state.texts = [];
    state.boss = null;
    state.spawnTimer = 0;
    state.fireTimer = 0;
    state.invulnTimer = 0;
    state.pulseCooldown = 0;
    state.combo = 1;
    state.comboTimer = 0;
    setupPlayer();
    state.startTime = performance.now();
  }

  function showToast(text, ms = 1500) {
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    setTimeout(() => ui.toast.classList.remove("show"), ms);
  }

  function openOverlay(name) {
    [ui.title, ui.option, ui.upgrade, ui.pause, ui.result, ui.credit].forEach((el) => el.classList.remove("visible"));
    if (name && ui[name]) ui[name].classList.add("visible");
  }

  function startGame() {
    ensureAudio();
    resetRun();
    state.screen = "playing";
    openOverlay(null);
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playSound(type) {
    if (state.options.muted || state.options.volume <= 0 || !audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1300;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    let freq = 420;
    let duration = 0.08;
    let wave = "sawtooth";
    if (type === "shoot") {
      freq = 520;
      duration = 0.04;
      wave = "square";
    } else if (type === "hit") {
      freq = 180;
      duration = 0.1;
      wave = "triangle";
    } else if (type === "dash") {
      freq = 690;
      duration = 0.1;
    } else if (type === "pulse") {
      freq = 150;
      duration = 0.28;
    } else if (type === "upgrade") {
      freq = 840;
      duration = 0.14;
      wave = "sine";
    } else if (type === "danger") {
      freq = 92;
      duration = 0.4;
    } else if (type === "clear") {
      freq = 980;
      duration = 0.2;
      wave = "triangle";
    }

    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15 * state.options.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.start(now);
    osc.stop(now + duration);
  }

  function spawnEnemy(kind = "drone") {
    const margin = 30;
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = Math.random() * canvas.width;
      y = -margin;
    } else if (edge === 1) {
      x = canvas.width + margin;
      y = Math.random() * canvas.height;
    } else if (edge === 2) {
      x = Math.random() * canvas.width;
      y = canvas.height + margin;
    } else {
      x = -margin;
      y = Math.random() * canvas.height;
    }

    const scale = difficultyScale();
    if (kind === "node") {
      state.enemies.push({ x, y, r: 20, hp: 28 * scale, speed: 65, type: "node", hue: 60, worth: 70 });
      return;
    }

    const heavy = kind === "tank";
    state.enemies.push({
      x,
      y,
      r: heavy ? 22 : 13,
      hp: heavy ? 26 * scale : 12 * scale,
      speed: heavy ? 68 : 106,
      type: heavy ? "tank" : "drone",
      worth: heavy ? 45 : 20,
      cooldown: Math.random() * 2,
      hue: heavy ? 340 : 200
    });
  }

  function shootFromPlayer() {
    if (state.fireTimer > 0) return;
    let target = null;
    let minDist = Infinity;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
      if (d < minDist) {
        minDist = d;
        target = e;
      }
    }
    if (state.boss) {
      const d = Math.hypot(state.boss.x - state.player.x, state.boss.y - state.player.y);
      if (d < minDist) target = state.boss;
    }
    if (!target) return;

    const angle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    state.bullets.push({ x: state.player.x, y: state.player.y, vx: Math.cos(angle) * 520, vy: Math.sin(angle) * 520, life: 1.2, damage: state.player.damage });
    state.fireTimer = state.player.fireRate;
    playSound("shoot");
  }

  function pulse() {
    if (state.player.energy < 55 || state.pulseCooldown > 0) return;
    state.player.energy -= 55;
    state.pulseCooldown = 2.2;
    state.shakePower = 8;
    playSound("pulse");

    const killZone = 145;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
      if (d <= killZone) {
        e.hp -= 20;
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => Math.hypot(b.x - state.player.x, b.y - state.player.y) > 170);
    spawnParticles(state.player.x, state.player.y, 22, "#80ffff");
  }

  function spawnParticles(x, y, amount, color) {
    for (let i = 0; i < amount; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 240;
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, color });
    }
  }

  function addFloating(text, x, y, color = "#ffffff") {
    state.texts.push({ text, x, y, color, life: 0.9 });
  }

  function enterNextChapter() {
    state.chapterIndex += 1;
    state.chapterTime = 0;
    state.nodesCaptured = 0;

    if (state.chapterIndex === 3) {
      state.boss = {
        x: canvas.width / 2,
        y: 130,
        r: 42,
        hp: 900 * difficultyScale(),
        maxHp: 900 * difficultyScale(),
        phase: 1,
        timer: 0
      };
      playSound("danger");
      showToast("루인 센티넬 접근! 패턴을 읽고 생존하세요.", 2200);
      return;
    }

    if (state.chapterIndex > 3) {
      endRun(true);
      return;
    }

    state.screen = "upgrade";
    openOverlay("upgrade");
    renderUpgradeChoices();
    playSound("upgrade");
  }

  function renderUpgradeChoices() {
    ui.upgradeGrid.innerHTML = "";
    const pool = [...state.upgradePool].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const up of pool) {
      const btn = document.createElement("button");
      btn.className = "upgrade-card";
      btn.innerHTML = `<h3>${up.name}</h3><p>${up.desc}</p>`;
      btn.addEventListener("click", () => {
        up.apply(state.player);
        state.screen = "playing";
        openOverlay(null);
        showToast(`${up.name} 장착 완료`, 1200);
      });
      ui.upgradeGrid.appendChild(btn);
    }
  }

  function endRun(victory) {
    state.screen = "result";
    openOverlay("result");

    if (state.score > state.bestScore) {
      state.bestScore = state.score;
      saveData();
    }

    ui.resultTitle.textContent = victory ? "작전 성공" : "작전 실패";
    ui.resultDesc.textContent = victory
      ? "나이트 서킷의 코어를 안정화했습니다. 도시가 다시 깨어납니다."
      : state.gameOverReason || "기체가 파괴되어 임무가 중단되었습니다.";

    const survived = Math.floor(state.elapsed);
    ui.resultStats.innerHTML = `
      <div>점수: <strong>${Math.floor(state.score)}</strong></div>
      <div>처치: <strong>${state.kills}</strong></div>
      <div>생존 시간: <strong>${Math.floor(survived / 60)}:${String(survived % 60).padStart(2, "0")}</strong></div>
      <div>난이도: <strong>${state.options.difficulty}</strong></div>
    `;

    playSound(victory ? "clear" : "hit");
  }

  function hitPlayer(dmg) {
    if (state.invulnTimer > 0 || state.screen !== "playing") return;
    state.player.hp -= dmg;
    state.invulnTimer = 0.5;
    state.shakePower = Math.max(state.shakePower, 4);
    playSound("hit");
    addFloating(`-${Math.round(dmg)}`, state.player.x, state.player.y - 20, "#ff8aaa");
    if (state.player.hp <= 0) {
      state.gameOverReason = "기체 내구도가 0이 되었습니다.";
      endRun(false);
    }
  }

  function update(dt) {
    if (state.screen !== "playing") return;

    state.elapsed = (performance.now() - state.startTime) / 1000;
    state.chapterTime += dt;
    state.fireTimer -= dt;
    state.invulnTimer -= dt;
    state.pulseCooldown -= dt;
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.combo = 1;

    const move = { x: 0, y: 0 };
    if (keys.has("w") || keys.has("arrowup")) move.y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) move.y += 1;
    if (keys.has("a") || keys.has("arrowleft")) move.x -= 1;
    if (keys.has("d") || keys.has("arrowright")) move.x += 1;

    const len = Math.hypot(move.x, move.y) || 1;
    const speedMul = state.player.dashTimer > 0 ? 2.5 : 1;
    state.player.x += (move.x / len) * state.player.speed * speedMul * dt;
    state.player.y += (move.y / len) * state.player.speed * speedMul * dt;
    state.player.x = Math.max(20, Math.min(canvas.width - 20, state.player.x));
    state.player.y = Math.max(20, Math.min(canvas.height - 20, state.player.y));

    state.player.dashTimer -= dt;
    state.player.energy = Math.min(100, state.player.energy + dt * 8 * state.player.energyGain);

    shootFromPlayer();

    const chapter = state.chapters[state.chapterIndex];
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && !chapter.boss) {
      const base = 0.92 / difficultyScale();
      state.spawnTimer = Math.max(0.26, base - state.chapterIndex * 0.14 + Math.random() * 0.18);
      if (chapter.reqNodes && Math.random() < 0.22) spawnEnemy("node");
      spawnEnemy(Math.random() < 0.2 + state.chapterIndex * 0.12 ? "tank" : "drone");
    }

    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    state.bullets = state.bullets.filter((b) => b.life > 0 && b.x > -30 && b.y > -30 && b.x < canvas.width + 30 && b.y < canvas.height + 30);

    for (const e of state.enemies) {
      const angle = Math.atan2(state.player.y - e.y, state.player.x - e.x);
      e.x += Math.cos(angle) * e.speed * dt;
      e.y += Math.sin(angle) * e.speed * dt;
      e.cooldown -= dt;
      if (e.type !== "node" && e.cooldown <= 0) {
        e.cooldown = 2.6 - state.chapterIndex * 0.25 + Math.random() * 0.6;
        state.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 170, vy: Math.sin(angle) * 170, life: 4, r: 4, dmg: 7 });
      }
      if (Math.hypot(e.x - state.player.x, e.y - state.player.y) < e.r + state.player.r) {
        hitPlayer(e.type === "tank" ? 12 : e.type === "node" ? 8 : 9);
      }
    }

    for (const b of state.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (Math.hypot(b.x - state.player.x, b.y - state.player.y) <= b.r + state.player.r) {
        hitPlayer(b.dmg);
        b.life = -1;
      }
    }
    state.enemyBullets = state.enemyBullets.filter((b) => b.life > 0);

    for (const e of state.enemies) {
      for (const b of state.bullets) {
        if (Math.hypot(e.x - b.x, e.y - b.y) <= e.r + 4) {
          e.hp -= b.damage;
          b.life = -1;
        }
      }
    }

    if (state.boss) {
      state.boss.timer += dt;
      const pivotX = canvas.width / 2 + Math.sin(state.boss.timer * 0.8) * 240;
      state.boss.x += (pivotX - state.boss.x) * dt * 1.8;

      if (state.boss.hp < state.boss.maxHp * 0.5) state.boss.phase = 2;
      if (state.boss.hp < state.boss.maxHp * 0.22) state.boss.phase = 3;

      const burstFreq = state.boss.phase === 1 ? 1.25 : state.boss.phase === 2 ? 0.85 : 0.58;
      if (state.boss.timer % burstFreq < dt) {
        const count = state.boss.phase === 1 ? 8 : state.boss.phase === 2 ? 13 : 18;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + state.boss.timer * 0.5;
          const speed = 120 + state.boss.phase * 35;
          state.enemyBullets.push({ x: state.boss.x, y: state.boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 5, r: 5, dmg: 8 + state.boss.phase });
        }
        if (state.boss.phase > 1) playSound("danger");
      }

      for (const b of state.bullets) {
        if (Math.hypot(state.boss.x - b.x, state.boss.y - b.y) <= state.boss.r + 4) {
          state.boss.hp -= b.damage;
          b.life = -1;
        }
      }
      if (Math.hypot(state.boss.x - state.player.x, state.boss.y - state.player.y) <= state.boss.r + state.player.r) hitPlayer(16);

      if (state.boss.hp <= 0) {
        state.score += 1200;
        spawnParticles(state.boss.x, state.boss.y, 35, "#ffe27f");
        state.boss = null;
        enterNextChapter();
      }
    }

    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      if (e.hp <= 0) {
        state.kills += 1;
        state.score += e.worth * state.combo;
        state.combo = Math.min(5, state.combo + 0.07);
        state.comboTimer = 2.4;
        state.player.energy = Math.min(100, state.player.energy + 5 * state.player.energyGain);
        spawnParticles(e.x, e.y, e.type === "tank" ? 10 : 6, e.type === "node" ? "#fef08a" : "#7dd3fc");
        addFloating(`+${Math.round(e.worth * state.combo)}`, e.x, e.y, "#9ef9ff");
        if (e.type === "node") {
          state.nodesCaptured += 1;
          showToast(`데이터 노드 확보 ${state.nodesCaptured}/4`, 950);
        }
        state.enemies.splice(i, 1);
      }
    }

    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    for (const t of state.texts) {
      t.y -= 32 * dt;
      t.life -= dt;
    }
    state.texts = state.texts.filter((t) => t.life > 0);

    if (chapter.reqKills && state.kills >= chapter.reqKills) enterNextChapter();
    if (chapter.reqNodes && state.nodesCaptured >= chapter.reqNodes) enterNextChapter();
    if (chapter.duration && state.chapterTime >= chapter.duration) enterNextChapter();

    if (state.options.flash && state.player.hp < state.player.maxHp * 0.25 && Math.sin(performance.now() * 0.02) > 0.9) {
      state.shakePower = Math.max(state.shakePower, 2);
    }

    state.shakePower *= 0.86;
  }

  function draw() {
    const chapter = state.chapters[state.chapterIndex] || state.chapters[state.chapters.length - 1];
    const [r, g, b] = chapter.bg;
    ctx.save();
    if (state.options.shake && state.shakePower > 0.2) {
      ctx.translate((Math.random() - 0.5) * state.shakePower, (Math.random() - 0.5) * state.shakePower);
    }

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 60; i++) {
      const x = (i * 179 + state.elapsed * 30) % canvas.width;
      const y = (i * 97 + state.elapsed * 22) % canvas.height;
      ctx.fillStyle = i % 2 ? "rgba(110,231,255,0.08)" : "rgba(255,92,170,0.06)";
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = "rgba(99,167,255,0.15)";
    for (let x = 0; x < canvas.width; x += 72) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    drawCircle(state.player.x, state.player.y, state.player.r + 4, "rgba(78,233,255,0.2)");
    drawCircle(state.player.x, state.player.y, state.player.r, state.invulnTimer > 0 ? "#ffe082" : "#7de4ff");

    for (const b of state.bullets) drawCircle(b.x, b.y, 3.5, "#9ae6ff");

    for (const e of state.enemies) {
      const color = e.type === "tank" ? "#ff6da1" : e.type === "node" ? "#fde68a" : "#78b7ff";
      drawCircle(e.x, e.y, e.r, color);
      const hpRatio = Math.max(0, e.hp / (e.type === "tank" ? 26 * difficultyScale() : e.type === "node" ? 28 * difficultyScale() : 12 * difficultyScale()));
      ctx.fillStyle = "rgba(17,17,30,0.9)";
      ctx.fillRect(e.x - 18, e.y - e.r - 10, 36, 4);
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(e.x - 18, e.y - e.r - 10, 36 * hpRatio, 4);
    }

    for (const b of state.enemyBullets) drawCircle(b.x, b.y, b.r, "#ff82b7");

    if (state.boss) {
      drawCircle(state.boss.x, state.boss.y, state.boss.r + 8, "rgba(255,130,183,0.18)");
      drawCircle(state.boss.x, state.boss.y, state.boss.r, "#ff5ea5");
      ctx.fillStyle = "rgba(2,6,23,0.9)";
      ctx.fillRect(canvas.width / 2 - 220, 16, 440, 12);
      ctx.fillStyle = "#f472b6";
      ctx.fillRect(canvas.width / 2 - 220, 16, 440 * Math.max(0, state.boss.hp / state.boss.maxHp), 12);
      ctx.fillStyle = "#fdf2f8";
      ctx.font = "14px sans-serif";
      ctx.fillText("루인 센티넬", canvas.width / 2 - 34, 12);
    }

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      drawCircle(p.x, p.y, 2, p.color);
      ctx.globalAlpha = 1;
    }

    for (const t of state.texts) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.color;
      ctx.font = "14px sans-serif";
      ctx.fillText(t.text, t.x, t.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    ui.phaseLabel.textContent = chapter.name;
    if (chapter.reqKills) ui.objectiveLabel.textContent = `${state.kills}/${chapter.reqKills}`;
    else if (chapter.reqNodes) ui.objectiveLabel.textContent = `${state.nodesCaptured}/${chapter.reqNodes}`;
    else if (chapter.duration) ui.objectiveLabel.textContent = `${Math.max(0, Math.ceil(chapter.duration - state.chapterTime))}초 방어`;
    else ui.objectiveLabel.textContent = state.boss ? `${Math.max(0, Math.round((state.boss.hp / state.boss.maxHp) * 100))}%` : "-";

    ui.timeLabel.textContent = `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, "0")}`;
    ui.scoreLabel.textContent = Math.floor(state.score).toLocaleString();
    ui.bestLabel.textContent = Math.floor(state.bestScore).toLocaleString();
    ui.hpFill.style.width = `${Math.max(0, (state.player.hp / state.player.maxHp) * 100)}%`;
    ui.hpText.textContent = `${Math.max(0, Math.floor(state.player.hp))} / ${Math.floor(state.player.maxHp)}`;
    ui.energyFill.style.width = `${state.player.energy}%`;
    ui.energyText.textContent = `${Math.floor(state.player.energy)}%`;
  }

  function drawCircle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function togglePause() {
    if (state.screen === "playing") {
      state.screen = "pause";
      openOverlay("pause");
    } else if (state.screen === "pause") {
      state.screen = "playing";
      openOverlay(null);
    }
  }

  function bindEvents() {
    window.addEventListener("keydown", (e) => {
      keys.add(e.key.toLowerCase());
      if (e.key === " ") {
        e.preventDefault();
        pulse();
      }
      if (e.key.toLowerCase() === "p" || e.key === "Escape") {
        if (state.screen === "playing" || state.screen === "pause") togglePause();
      }
      if (e.key === "Shift" && state.screen === "playing") {
        if (state.player.energy >= 35 && state.player.dashTimer <= 0) {
          state.player.energy -= 35;
          state.player.dashTimer = 0.22;
          playSound("dash");
        }
      }
    });

    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

    document.getElementById("startBtn").addEventListener("click", startGame);
    document.getElementById("openOptionBtn").addEventListener("click", () => {
      state.screen = "option";
      openOverlay("option");
    });
    document.getElementById("openCreditBtn").addEventListener("click", () => openOverlay("credit"));
    document.getElementById("closeCreditBtn").addEventListener("click", () => openOverlay("title"));
    document.getElementById("closeOptionBtn").addEventListener("click", () => openOverlay(state.screen === "option" ? "title" : "pause"));
    document.getElementById("resumeBtn").addEventListener("click", togglePause);
    document.getElementById("retryBtn").addEventListener("click", startGame);
    document.getElementById("pauseOptionBtn").addEventListener("click", () => {
      state.screen = "option";
      openOverlay("option");
    });
    document.getElementById("playAgainBtn").addEventListener("click", startGame);
    document.getElementById("toTitleBtn").addEventListener("click", () => {
      state.screen = "title";
      openOverlay("title");
    });

    ui.difficulty.addEventListener("change", () => {
      state.options.difficulty = ui.difficulty.value;
      saveData();
      showToast(`난이도: ${ui.difficulty.options[ui.difficulty.selectedIndex].text}`);
    });
    ui.volume.addEventListener("input", () => {
      state.options.volume = Number(ui.volume.value) / 100;
      saveData();
    });
    ui.mute.addEventListener("change", () => {
      state.options.muted = ui.mute.checked;
      saveData();
    });
    ui.shake.addEventListener("change", () => {
      state.options.shake = ui.shake.checked;
      saveData();
    });
    ui.flash.addEventListener("change", () => {
      state.options.flash = ui.flash.checked;
      saveData();
    });
  }

  function init() {
    loadData();
    ui.bestLabel.textContent = state.bestScore;
    ui.difficulty.value = state.options.difficulty;
    ui.volume.value = Math.round(state.options.volume * 100);
    ui.mute.checked = state.options.muted;
    ui.shake.checked = state.options.shake;
    ui.flash.checked = state.options.flash;
    setupPlayer();
    bindEvents();
    openOverlay("title");
    raf = requestAnimationFrame(frame);
  }

  init();

  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(raf);
  });
})();
