(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const hpBar = document.getElementById('hpBar');
  const focusBar = document.getElementById('focusBar');
  const chapterLabel = document.getElementById('chapterLabel');
  const objectiveLabel = document.getElementById('objectiveLabel');
  const timeLabel = document.getElementById('timeLabel');
  const decoyLabel = document.getElementById('decoyLabel');
  const toast = document.getElementById('toast');

  const titleScreen = document.getElementById('titleScreen');
  const overlayScreen = document.getElementById('overlayScreen');
  const overlayPanel = document.getElementById('overlayPanel');
  const optionsScreen = document.getElementById('optionsScreen');
  const creditsScreen = document.getElementById('creditsScreen');

  const continueBtn = document.getElementById('continueBtn');
  const difficultySelect = document.getElementById('difficultySelect');
  const volumeRange = document.getElementById('volumeRange');
  const muteToggle = document.getElementById('muteToggle');
  const shakeToggle = document.getElementById('shakeToggle');
  const assistToggle = document.getElementById('assistToggle');
  const textScaleSelect = document.getElementById('textScaleSelect');

  const KEY = {};
  const STORAGE_KEY = 'nightCourierSave_v1';
  const DIFF = {
    story: { dmg: 0.7, detect: 0.85, timer: 1.25 },
    standard: { dmg: 1, detect: 1, timer: 1 },
    veteran: { dmg: 1.3, detect: 1.2, timer: 0.9 },
  };

  const state = {
    mode: 'title',
    settings: { difficulty: 'standard', volume: 0.7, muted: false, lowShake: false, assist: true, textScale: 1 },
    best: { rank: '-', time: 99999, runs: 0 },
    save: null,
    run: null,
    toastTimer: 0,
    flash: 0,
    shake: 0,
    last: performance.now(),
  };

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playTone(freq, duration = 0.1, type = 'sine', gain = 0.05) {
    if (state.settings.muted || state.settings.volume <= 0) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain * state.settings.volume;
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }

  const chapters = [
    {
      name: 'Old Market',
      timer: 210,
      terminals: 3,
      color: '#2f2618',
      walls: [{ x: 170, y: 130, w: 210, h: 16 }, { x: 400, y: 260, w: 280, h: 20 }, { x: 220, y: 390, w: 480, h: 16 }],
      terminalsPos: [{ x: 120, y: 90 }, { x: 760, y: 200 }, { x: 760, y: 450 }],
      guards: 3,
      cameras: 0,
      drones: 0,
    },
    {
      name: 'Archive Hall',
      timer: 240,
      terminals: 4,
      color: '#1f2b20',
      walls: [{ x: 130, y: 110, w: 700, h: 14 }, { x: 120, y: 250, w: 640, h: 14 }, { x: 200, y: 390, w: 680, h: 14 }],
      terminalsPos: [{ x: 110, y: 70 }, { x: 840, y: 200 }, { x: 100, y: 340 }, { x: 860, y: 470 }],
      guards: 4,
      cameras: 3,
      drones: 0,
    },
    {
      name: 'Transit Core',
      timer: 255,
      terminals: 4,
      color: '#2a1f2d',
      walls: [{ x: 240, y: 70, w: 16, h: 400 }, { x: 460, y: 70, w: 16, h: 400 }, { x: 680, y: 70, w: 16, h: 400 }],
      terminalsPos: [{ x: 140, y: 470 }, { x: 340, y: 100 }, { x: 560, y: 430 }, { x: 840, y: 100 }],
      guards: 4,
      cameras: 3,
      drones: 2,
    },
    {
      name: 'Sky Dock',
      timer: 300,
      terminals: 5,
      color: '#2a2320',
      walls: [{ x: 160, y: 140, w: 620, h: 16 }, { x: 160, y: 280, w: 620, h: 16 }, { x: 160, y: 420, w: 620, h: 16 }],
      terminalsPos: [{ x: 90, y: 80 }, { x: 860, y: 80 }, { x: 90, y: 500 }, { x: 860, y: 500 }, { x: 480, y: 250 }],
      guards: 5,
      cameras: 4,
      drones: 2,
      hunter: true,
    },
  ];

  function loadStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (data.settings) Object.assign(state.settings, data.settings);
      if (data.best) state.best = data.best;
      if (data.save) state.save = data.save;
    } catch (e) {
      console.warn(e);
    }
    applySettingsToUI();
    continueBtn.disabled = !state.save;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: state.settings, best: state.best, save: state.save }));
  }

  function applySettingsToUI() {
    difficultySelect.value = state.settings.difficulty;
    volumeRange.value = state.settings.volume;
    muteToggle.checked = state.settings.muted;
    shakeToggle.checked = state.settings.lowShake;
    assistToggle.checked = state.settings.assist;
    textScaleSelect.value = String(state.settings.textScale);
    document.documentElement.style.setProperty('--text-scale', state.settings.textScale);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    state.toastTimer = 2;
  }

  function makeRun(fromSave = null) {
    const base = {
      chapter: 0,
      phase: 'infiltrate',
      globalTime: 0,
      score: 0,
      upgrades: [],
      player: { x: 60, y: 270, r: 10, hp: 100, focus: 100, decoy: 2, pulseCd: 0, speed: 180, hackRate: 1 },
      guards: [],
      cameras: [],
      drones: [],
      hunter: null,
      terminals: [],
      exit: { x: 920, y: 270, r: 20 },
      decoys: [],
      alert: 0,
      chapterTime: 0,
      chapterLimit: 0,
      hacksDone: 0,
      hackingId: -1,
      detected: false,
      stats: { detections: 0, hits: 0 },
    };
    state.run = fromSave ? Object.assign(base, fromSave) : base;
    setupChapter(state.run.chapter, true);
    state.mode = 'playing';
    hud.style.display = '';
    hideAllScreens();
    saveCheckpoint();
    showToast(`CHAPTER ${state.run.chapter + 1}: ${chapters[state.run.chapter].name}`);
  }

  function saveCheckpoint() {
    const safe = JSON.parse(JSON.stringify({
      chapter: state.run.chapter,
      globalTime: state.run.globalTime,
      score: state.run.score,
      upgrades: state.run.upgrades,
      player: state.run.player,
      stats: state.run.stats,
    }));
    state.save = safe;
    continueBtn.disabled = false;
    persist();
  }

  function setupChapter(index, resetPlayerPos = false) {
    const c = chapters[index];
    const diff = DIFF[state.settings.difficulty];
    state.run.chapter = index;
    state.run.chapterTime = 0;
    state.run.chapterLimit = c.timer * diff.timer;
    state.run.hacksDone = 0;
    state.run.hackingId = -1;
    state.run.alert = 0;
    state.run.decoys = [];
    if (resetPlayerPos) {
      state.run.player.x = 60;
      state.run.player.y = 270;
    }
    state.run.terminals = c.terminalsPos.map((p, i) => ({ ...p, hacked: false, progress: 0, id: i }));
    state.run.exit = { x: 920, y: 270, r: 20 };
    state.run.guards = Array.from({ length: c.guards }).map((_, i) => {
      const y = 80 + i * (420 / Math.max(1, c.guards - 1));
      return { x: 300 + i * 80, y, r: 10, dir: 1, spd: 70 + Math.random() * 30, alert: 0, target: null };
    });
    state.run.cameras = Array.from({ length: c.cameras }).map((_, i) => ({ x: 220 + i * 180, y: 30 + (i % 2) * 480, angle: Math.random() * Math.PI * 2 }));
    state.run.drones = Array.from({ length: c.drones }).map((_, i) => ({ x: 780 - i * 140, y: 80 + i * 160, dir: i % 2 ? -1 : 1, r: 9 }));
    state.run.hunter = c.hunter ? { x: 900, y: 90, r: 14, spd: 90, rage: 0 } : null;
  }

  function showOverlay(html) {
    overlayPanel.innerHTML = html;
    overlayScreen.classList.add('active');
  }
  function hideOverlay() { overlayScreen.classList.remove('active'); }
  function hideAllScreens() {
    titleScreen.classList.remove('active');
    optionsScreen.classList.remove('active');
    creditsScreen.classList.remove('active');
    hideOverlay();
  }

  function openOptions() {
    optionsScreen.classList.add('active');
    titleScreen.classList.remove('active');
    overlayScreen.classList.remove('active');
    setTimeout(() => document.getElementById('saveOptionsBtn').focus(), 0);
  }

  function update(dt) {
    if (state.mode !== 'playing') return;
    const run = state.run;
    const p = run.player;
    const diff = DIFF[state.settings.difficulty];
    const c = chapters[run.chapter];

    const focusHeld = KEY.ShiftLeft || KEY.ShiftRight;
    const scale = focusHeld && p.focus > 0 ? 0.65 : 1;
    if (focusHeld && p.focus > 0) p.focus = Math.max(0, p.focus - 24 * dt);
    else p.focus = Math.min(100, p.focus + 15 * dt);

    const speed = p.speed * scale;
    let dx = (KEY.KeyD ? 1 : 0) - (KEY.KeyA ? 1 : 0);
    let dy = (KEY.KeyS ? 1 : 0) - (KEY.KeyW ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    p.x += (dx / len) * speed * dt;
    p.y += (dy / len) * speed * dt;
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(20, Math.min(canvas.height - 20, p.y));

    for (const w of c.walls) {
      if (p.x > w.x - p.r && p.x < w.x + w.w + p.r && p.y > w.y - p.r && p.y < w.y + w.h + p.r) {
        if (Math.abs((p.x - w.x) - w.w / 2) > Math.abs((p.y - w.y) - w.h / 2)) p.x += p.x < w.x + w.w / 2 ? -4 : 4;
        else p.y += p.y < w.y + w.h / 2 ? -4 : 4;
      }
    }

    run.chapterTime += dt;
    run.globalTime += dt;
    if (run.chapterTime > run.chapterLimit) {
      damagePlayer(30, '시간 초과로 경계가 강화되었습니다!');
      run.chapterTime = run.chapterLimit - 8;
    }

    if (p.pulseCd > 0) p.pulseCd -= dt;

    run.terminals.forEach((t, idx) => {
      const near = Math.hypot(p.x - t.x, p.y - t.y) < 32;
      if (!t.hacked && near && KEY.KeyE) {
        run.hackingId = idx;
        t.progress += dt * p.hackRate;
        if (t.progress >= 2.4) {
          t.hacked = true;
          run.hacksDone += 1;
          run.score += 150;
          playTone(840, 0.15, 'triangle', 0.09);
          showToast(`단말 해킹 완료 (${run.hacksDone}/${run.terminals.length})`);
        }
      } else if (!near) {
        t.progress = Math.max(0, t.progress - dt * 0.7);
      }
    });

    if (run.hacksDone >= run.terminals.length && Math.hypot(p.x - run.exit.x, p.y - run.exit.y) < 28) {
      run.score += Math.max(0, Math.floor((run.chapterLimit - run.chapterTime) * 2));
      nextChapterOrWin();
      return;
    }

    for (const g of run.guards) {
      const target = run.decoys[0] || { x: p.x, y: p.y };
      const detected = Math.hypot(g.x - p.x, g.y - p.y) < 140 * diff.detect;
      if (detected || g.alert > 0) {
        g.alert = Math.max(g.alert, 2.5);
        const angle = Math.atan2(target.y - g.y, target.x - g.x);
        g.x += Math.cos(angle) * (g.spd + 40) * dt;
        g.y += Math.sin(angle) * (g.spd + 40) * dt;
      } else {
        g.x += g.dir * g.spd * dt;
        if (g.x > 900 || g.x < 60) g.dir *= -1;
      }
      g.alert = Math.max(0, g.alert - dt);
      if (Math.hypot(g.x - p.x, g.y - p.y) < g.r + p.r) damagePlayer(14 * diff.dmg, '경비와 충돌!');
      if (detected) onDetected();
    }

    for (const cam of run.cameras) {
      cam.angle += dt * 0.8;
      const dirX = Math.cos(cam.angle);
      const dirY = Math.sin(cam.angle);
      const vx = p.x - cam.x;
      const vy = p.y - cam.y;
      const dot = (vx * dirX + vy * dirY) / (Math.hypot(vx, vy) || 1);
      if (Math.hypot(vx, vy) < 210 && dot > 0.83) {
        onDetected();
        damagePlayer(8 * dt * diff.dmg, '카메라 추적 중');
      }
    }

    for (const d of run.drones) {
      d.y += d.dir * 65 * dt;
      if (d.y < 50 || d.y > 490) d.dir *= -1;
      if (Math.hypot(d.x - p.x, d.y - p.y) < 60) {
        onDetected();
        damagePlayer(10 * dt * diff.dmg, '드론 전류 손상');
      }
    }

    if (run.hunter) {
      run.hunter.rage += dt;
      const speedBoost = 1 + Math.min(0.6, run.hunter.rage / 30);
      const a = Math.atan2(p.y - run.hunter.y, p.x - run.hunter.x);
      run.hunter.x += Math.cos(a) * run.hunter.spd * speedBoost * dt;
      run.hunter.y += Math.sin(a) * run.hunter.spd * speedBoost * dt;
      if (Math.hypot(run.hunter.x - p.x, run.hunter.y - p.y) < run.hunter.r + p.r) damagePlayer(25 * diff.dmg, '헌터에게 추적당했습니다!');
    }

    run.decoys = run.decoys.filter((d) => (d.life -= dt) > 0);
    run.alert = Math.max(0, run.alert - dt * 0.7);
  }

  function nextChapterOrWin() {
    playTone(620, 0.14, 'square', 0.08);
    if (state.run.chapter >= chapters.length - 1) {
      const rank = scoreToRank(state.run.score, state.run.stats.detections);
      state.best.runs += 1;
      if (rankOrder(rank) > rankOrder(state.best.rank)) state.best.rank = rank;
      if (state.run.globalTime < state.best.time) state.best.time = state.run.globalTime;
      state.save = null;
      continueBtn.disabled = true;
      persist();
      state.mode = 'victory';
      showOverlay(`<h2>MISSION COMPLETE</h2><p>랭크: <strong>${rank}</strong> · 점수: ${Math.floor(state.run.score)}</p><p>시간 ${fmtTime(state.run.globalTime)} · 탐지 ${state.run.stats.detections}회</p><div class="menu horizontal"><button id="retryBtn">다시 도전</button><button id="menuBtn">메인 메뉴</button></div>`);
      bindResultButtons();
      return;
    }

    state.mode = 'upgrade';
    const options = [
      { name: 'Steady Hand', desc: '해킹 속도 +35%', apply: () => (state.run.player.hackRate += 0.35) },
      { name: 'Ghost Soles', desc: '이동 속도 +18%', apply: () => (state.run.player.speed += 32) },
      { name: 'Decoy Kit', desc: '미끼 +1, 최대치 +1', apply: () => (state.run.player.decoy = Math.min(5, state.run.player.decoy + 1)) },
    ];
    showOverlay(`<h2>구역 돌파 성공</h2><p>강화 1개를 선택하세요.</p><div class="menu">${options
      .map((o, i) => `<button data-up="${i}"><strong>${o.name}</strong><br/><small>${o.desc}</small></button>`)
      .join('')}</div>`);
    overlayPanel.querySelectorAll('button[data-up]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.dataset.up);
        options[idx].apply();
        state.run.upgrades.push(options[idx].name);
        state.run.player.hp = Math.min(100, state.run.player.hp + 25);
        state.run.player.focus = 100;
        state.run.chapter += 1;
        setupChapter(state.run.chapter, true);
        saveCheckpoint();
        state.mode = 'playing';
        hideOverlay();
        showToast(`강화 획득: ${options[idx].name}`);
        playTone(930, 0.13, 'triangle', 0.08);
      });
    });
  }

  function rankOrder(r) { return ['-', 'C', 'B', 'A', 'S'].indexOf(r); }
  function scoreToRank(score, det) {
    const v = score - det * 90;
    if (v > 1800) return 'S';
    if (v > 1300) return 'A';
    if (v > 900) return 'B';
    return 'C';
  }

  function onDetected() {
    if (!state.run.detected) {
      state.run.stats.detections += 1;
      state.run.detected = true;
      showToast('탐지됨! 시야를 끊으세요');
      playTone(220, 0.2, 'sawtooth', 0.08);
    }
    state.run.alert = 2.8;
  }

  function damagePlayer(amount, msg) {
    const p = state.run.player;
    p.hp = Math.max(0, p.hp - amount);
    state.run.stats.hits += 1;
    state.flash = 0.35;
    state.shake = state.settings.lowShake ? 2 : 7;
    if (msg) showToast(msg);
    playTone(120, 0.12, 'square', 0.09);
    if (p.hp <= 0) {
      state.mode = 'gameover';
      showOverlay(`<h2>MISSION FAILED</h2><p>작전이 중단되었습니다.</p><p>진행 시간 ${fmtTime(state.run.globalTime)} · 점수 ${Math.floor(state.run.score)}</p><div class="menu horizontal"><button id="retryBtn">다시 시작</button><button id="menuBtn">메인 메뉴</button></div>`);
      bindResultButtons();
    }
  }

  function bindResultButtons() {
    const retry = document.getElementById('retryBtn');
    const menu = document.getElementById('menuBtn');
    retry?.addEventListener('click', () => makeRun());
    menu?.addEventListener('click', () => backToTitle());
  }

  function backToTitle() {
    state.mode = 'title';
    hideAllScreens();
    titleScreen.classList.add('active');
    hud.style.display = 'none';
    continueBtn.focus();
  }

  function render() {
    const run = state.run;
    const c = run ? chapters[run.chapter] : chapters[0];
    const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    state.shake = Math.max(0, state.shake - 0.6);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.fillStyle = c.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#4f4335';
    ctx.lineWidth = 2;
    for (let x = 0; x < canvas.width; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    c.walls.forEach((w) => {
      ctx.fillStyle = '#4a3f31';
      ctx.fillRect(w.x, w.y, w.w, w.h);
    });

    if (run) {
      run.terminals.forEach((t) => {
        ctx.fillStyle = t.hacked ? '#72c188' : '#e2a94a';
        ctx.fillRect(t.x - 11, t.y - 11, 22, 22);
        if (!t.hacked && t.progress > 0) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(t.x - 13, t.y - 18, 26 * (t.progress / 2.4), 3);
        }
      });

      ctx.beginPath();
      ctx.arc(run.exit.x, run.exit.y, run.exit.r, 0, Math.PI * 2);
      ctx.strokeStyle = run.hacksDone >= run.terminals.length ? '#87f7a4' : '#8e7d63';
      ctx.lineWidth = 4;
      ctx.stroke();

      run.cameras.forEach((cam) => {
        ctx.fillStyle = '#d6b97b';
        ctx.beginPath();
        ctx.arc(cam.x, cam.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d6b97b66';
        ctx.beginPath();
        ctx.moveTo(cam.x, cam.y);
        ctx.lineTo(cam.x + Math.cos(cam.angle) * 200, cam.y + Math.sin(cam.angle) * 200);
        ctx.stroke();
      });

      run.guards.forEach((g) => {
        ctx.fillStyle = g.alert > 0 ? '#e67a63' : '#c9cabd';
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fill();
      });

      run.drones.forEach((d) => {
        ctx.strokeStyle = '#9ec0ee';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.stroke();
      });

      if (run.hunter) {
        ctx.fillStyle = '#b44739';
        ctx.beginPath();
        ctx.arc(run.hunter.x, run.hunter.y, run.hunter.r, 0, Math.PI * 2);
        ctx.fill();
      }

      run.decoys.forEach((d) => {
        ctx.fillStyle = '#85c9c0';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 7, 0, Math.PI * 2);
        ctx.fill();
      });

      const p = run.player;
      ctx.fillStyle = '#f5e9d6';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      if (state.settings.assist && run.alert > 0) {
        ctx.strokeStyle = '#ff7a6b';
        ctx.lineWidth = 5;
        ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      }

      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255,80,80,${state.flash})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        state.flash = Math.max(0, state.flash - 0.03);
      }
    }

    ctx.restore();

    if (run) {
      hpBar.style.width = `${run.player.hp}%`;
      focusBar.style.width = `${run.player.focus}%`;
      chapterLabel.textContent = `CHAPTER ${run.chapter + 1} · ${chapters[run.chapter].name}`;
      objectiveLabel.textContent = `단말 ${run.hacksDone} / ${run.terminals.length}`;
      timeLabel.textContent = fmtTime(run.chapterTime) + ' / ' + fmtTime(run.chapterLimit);
      decoyLabel.textContent = `미끼 ${run.player.decoy}`;
      run.detected = run.alert > 0;
    }
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - state.last) / 1000);
    state.last = now;
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) toast.classList.remove('show');
    }
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', (e) => {
    KEY[e.code] = true;
    if (e.code === 'Escape') {
      if (state.mode === 'playing') {
        state.mode = 'paused';
        showOverlay('<h2>PAUSED</h2><div class="menu horizontal"><button id="resumeBtn">계속</button><button id="quitBtn">메인 메뉴</button></div>');
        document.getElementById('resumeBtn').addEventListener('click', () => { state.mode = 'playing'; hideOverlay(); });
        document.getElementById('quitBtn').addEventListener('click', () => backToTitle());
      } else if (state.mode === 'paused') {
        state.mode = 'playing';
        hideOverlay();
      }
    }

    if (state.mode === 'playing' && e.code === 'Space') {
      e.preventDefault();
      if (state.run.player.decoy > 0) {
        state.run.decoys.push({ x: state.run.player.x, y: state.run.player.y, life: 4 });
        state.run.player.decoy -= 1;
        playTone(580, 0.1, 'triangle', 0.07);
        showToast('미끼 배치');
      }
    }
    if (state.mode === 'playing' && e.code === 'KeyQ') {
      if (state.run.player.pulseCd <= 0) {
        state.run.player.pulseCd = 8;
        state.run.score += 10;
        playTone(700, 0.12, 'sine', 0.06);
        showToast('스캔: 적 위치 강조');
        state.run.alert = Math.max(0, state.run.alert - 1.1);
      }
    }
  });
  document.addEventListener('keyup', (e) => (KEY[e.code] = false));

  titleScreen.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'new') makeRun();
      if (action === 'continue' && state.save) makeRun(state.save);
      if (action === 'options') openOptions();
      if (action === 'credits') {
        titleScreen.classList.remove('active');
        creditsScreen.classList.add('active');
        document.getElementById('creditsBackBtn').focus();
      }
      playTone(360, 0.06, 'square', 0.05);
    });
  });

  document.getElementById('saveOptionsBtn').addEventListener('click', () => {
    state.settings.difficulty = difficultySelect.value;
    state.settings.volume = Number(volumeRange.value);
    state.settings.muted = muteToggle.checked;
    state.settings.lowShake = shakeToggle.checked;
    state.settings.assist = assistToggle.checked;
    state.settings.textScale = Number(textScaleSelect.value);
    persist();
    applySettingsToUI();
    showToast('옵션이 저장되었습니다.');
    backToTitle();
  });

  document.getElementById('backOptionsBtn').addEventListener('click', () => backToTitle());
  document.getElementById('creditsBackBtn').addEventListener('click', () => backToTitle());

  loadStorage();
  hud.style.display = 'none';
  titleScreen.classList.add('active');
  requestAnimationFrame(loop);
})();
