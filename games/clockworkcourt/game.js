(() => {
  'use strict';

  const STORAGE_KEY = 'ironJunctionSaveV1';
  const DIFF = {
    story: { spawn: 0.8, speed: 0.9, quota: 0.85, focusDrain: 0.75 },
    standard: { spawn: 1, speed: 1, quota: 1, focusDrain: 1 },
    veteran: { spawn: 1.2, speed: 1.12, quota: 1.15, focusDrain: 1.2 },
  };

  const CHAPTERS = [
    { name: 'Commuter Dawn', sec: 240, quota: 22, spawnBase: 2.8, leftRate: 1, rightRate: 0.12, hazards: false, hint: '기본 운행. 분기 타이밍과 오버테이크 간격을 익히세요.' },
    { name: 'Freight Surge', sec: 240, quota: 28, spawnBase: 2.3, leftRate: 0.85, rightRate: 0.36, hazards: true, hint: '반대편 열차 증가. Q/W/E 신호 정지로 충돌을 예방하세요.' },
    { name: 'Storm Diversion', sec: 240, quota: 33, spawnBase: 1.9, leftRate: 0.7, rightRate: 0.7, hazards: true, hint: '폭풍 구간. 고속열차와 선로 결함을 Focus Slow로 통제하세요.' },
    { name: 'Terminal Lockdown', sec: 300, quota: 42, spawnBase: 1.7, leftRate: 0.75, rightRate: 0.88, hazards: true, hint: '최종 관제. 실패 없이 목표를 달성하면 도시망이 복구됩니다.' },
  ];

  const UPGRADE_POOL = [
    { id: 'focusCell', title: 'Focus Cell', desc: '집중 게이지 최대치 +25%.', apply: (g) => { g.focusMax *= 1.25; g.focus = g.focusMax; } },
    { id: 'signalRelay', title: 'Signal Relay', desc: '신호 정지 중 페널티 감소, 처리 점수 +20%.', apply: (g) => { g.signalBonus += 0.2; } },
    { id: 'shockBuffer', title: 'Shock Buffer', desc: '충돌 발생 시 무결성 손실 1회 완화.', apply: (g) => { g.crashBuffer += 1; } },
    { id: 'turboDispatch', title: 'Turbo Dispatch', desc: '정확한 라우팅 점수 +35%, 열차 속도 +8%.', apply: (g) => { g.scoreBonus += 0.35; g.speedMult += 0.08; } },
    { id: 'forecastHUD', title: 'Forecast HUD', desc: '위협 게이지 상승 완화, Focus 회복 +20%.', apply: (g) => { g.threatGain *= 0.78; g.focusRegen *= 1.2; } },
    { id: 'steelSwitch', title: 'Steel Switch', desc: '분기 스위치 재입력 쿨다운 감소.', apply: (g) => { g.switchCooldown = Math.max(0.12, g.switchCooldown - 0.09); } },
  ];

  const app = document.getElementById('app');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    chapter: document.getElementById('hudChapter'),
    time: document.getElementById('hudTime'),
    quota: document.getElementById('hudQuota'),
    integrity: document.getElementById('hudIntegrity'),
    score: document.getElementById('hudScore'),
    focusFill: document.getElementById('focusFill'),
    threatFill: document.getElementById('threatFill'),
    chapterHint: document.getElementById('chapterHint'),
    toast: document.getElementById('toast'),
    resultTitle: document.getElementById('resultTitle'),
    resultDesc: document.getElementById('resultDesc'),
    resultStats: document.getElementById('resultStats'),
    upgradeList: document.getElementById('upgradeList'),
    options: {
      difficulty: document.getElementById('optDifficulty'),
      volume: document.getElementById('optVolume'),
      mute: document.getElementById('optMute'),
      reduceMotion: document.getElementById('optReduceMotion'),
      highContrast: document.getElementById('optHighContrast'),
      textScale: document.getElementById('optTextScale'),
    },
  };

  const screens = {
    title: document.getElementById('menuTitle'),
    options: document.getElementById('menuOptions'),
    pause: document.getElementById('menuPause'),
    upgrade: document.getElementById('menuUpgrade'),
    result: document.getElementById('menuResult'),
    credits: document.getElementById('menuCredits'),
  };

  const laneY = [140, 270, 400];
  const junctions = [250, 500, 760];
  const tracks = [[0, 1], [1, 2], [0, 1]];

  const state = {
    mode: 'title',
    settings: {
      difficulty: 'standard', volume: 70, mute: false, reduceMotion: false, highContrast: false, textScale: 1,
    },
    bestScore: 0,
    lastScore: 0,
    chapter: 0,
    chapterTime: 0,
    chapterQuota: 0,
    delivered: 0,
    integrity: 3,
    score: 0,
    focus: 100,
    focusMax: 100,
    threat: 0,
    threatGain: 1,
    focusRegen: 13,
    signalBonus: 0,
    crashBuffer: 0,
    speedMult: 1,
    scoreBonus: 0,
    switchCooldown: 0.2,
    totalCrashes: 0,
    totalMisroutes: 0,
    totalDelivered: 0,
    trains: [],
    particles: [],
    holds: [false, false, false],
    switches: [false, false, false],
    switchCd: [0, 0, 0],
    spawnTimer: 0,
    chapterClock: 0,
    selectedUpgrades: [],
    previousRun: false,
  };

  const input = new Set();
  let toastTimer = 0;

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.settings) Object.assign(state.settings, data.settings);
      state.bestScore = Number(data.bestScore || 0);
      state.previousRun = Boolean(data.previousRun);
    } catch (_) {}
  }

  function saveState() {
    const data = { settings: state.settings, bestScore: state.bestScore, previousRun: state.previousRun };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function applySettings() {
    document.body.classList.toggle('high-contrast', state.settings.highContrast);
    document.documentElement.style.setProperty('--font-scale', state.settings.textScale);
    ui.options.difficulty.value = state.settings.difficulty;
    ui.options.volume.value = state.settings.volume;
    ui.options.mute.checked = state.settings.mute;
    ui.options.reduceMotion.checked = state.settings.reduceMotion;
    ui.options.highContrast.checked = state.settings.highContrast;
    ui.options.textScale.value = String(state.settings.textScale);
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    if (screens[name]) {
      screens[name].classList.add('active');
      const firstButton = screens[name].querySelector('button,select,input');
      if (firstButton) firstButton.focus();
    }
  }

  function toMode(mode) {
    state.mode = mode;
    if (mode === 'title') showScreen('title');
    if (mode === 'options') showScreen('options');
    if (mode === 'pause') showScreen('pause');
    if (mode === 'upgrade') showScreen('upgrade');
    if (mode === 'result') showScreen('result');
    if (mode === 'credits') showScreen('credits');
    if (mode === 'play') Object.values(screens).forEach((s) => s.classList.remove('active'));
  }

  function showToast(text, duration = 2.2) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    toastTimer = duration;
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function newRun() {
    const diff = DIFF[state.settings.difficulty];
    state.chapter = 0;
    state.integrity = state.settings.difficulty === 'story' ? 4 : 3;
    state.score = 0;
    state.lastScore = 0;
    state.delivered = 0;
    state.focusMax = 100;
    state.focus = 100;
    state.threat = 0;
    state.threatGain = 1;
    state.focusRegen = 13 / diff.focusDrain;
    state.signalBonus = 0;
    state.crashBuffer = 0;
    state.speedMult = 1;
    state.scoreBonus = 0;
    state.switchCooldown = 0.2;
    state.totalCrashes = 0;
    state.totalMisroutes = 0;
    state.totalDelivered = 0;
    state.selectedUpgrades = [];
    startChapter(0);
    toMode('play');
    showToast('관제 시작. 1~3 분기, QWE 신호 정지.', 3.3);
    state.previousRun = true;
    saveState();
  }

  function startChapter(index) {
    const diff = DIFF[state.settings.difficulty];
    const ch = CHAPTERS[index];
    state.chapter = index;
    state.chapterTime = ch.sec;
    state.chapterQuota = Math.ceil(ch.quota * diff.quota);
    state.delivered = 0;
    state.chapterClock = 0;
    state.spawnTimer = 1.4;
    state.trains = [];
    state.holds = [false, false, false];
    state.switches = [false, false, false];
    state.switchCd = [0, 0, 0];
    ui.chapterHint.textContent = ch.hint;
    showToast(`CHAPTER ${index + 1}: ${ch.name}`);
  }

  function spawnTrain() {
    const diff = DIFF[state.settings.difficulty];
    const ch = CHAPTERS[state.chapter];
    const fromRight = Math.random() < ch.rightRate;
    const lane = (Math.random() * 3) | 0;
    const targetLane = (Math.random() * 3) | 0;
    const fastChance = state.chapter >= 2 ? 0.23 : 0.1;
    const speedBase = (65 + Math.random() * 30) * diff.speed * state.speedMult;
    const speed = (Math.random() < fastChance ? speedBase * 1.35 : speedBase) * (fromRight ? -1 : 1);
    const x = fromRight ? 980 : -20;

    if (state.holds[lane]) return;

    state.trains.push({ x, lane, targetLane, speed, fromRight, hp: 1, alarm: 0, stuck: 0, diverged: false });
  }

  function toggleSwitch(i) {
    if (state.switchCd[i] > 0) return;
    state.switches[i] = !state.switches[i];
    state.switchCd[i] = state.switchCooldown;
    beep(190 + i * 35, 0.05, 'square', 0.12);
  }

  function toggleHold(i) {
    state.holds[i] = !state.holds[i];
    showToast(state.holds[i] ? `Lane ${i + 1} 진입 정지` : `Lane ${i + 1} 진입 허용`, 1.1);
    beep(state.holds[i] ? 120 : 240, 0.08, 'triangle', 0.12);
  }

  function handleGameplayInput() {
    if (input.has('Digit1')) toggleSwitch(0);
    if (input.has('Digit2')) toggleSwitch(1);
    if (input.has('Digit3')) toggleSwitch(2);
    if (input.has('KeyQ')) toggleHold(0);
    if (input.has('KeyW')) toggleHold(1);
    if (input.has('KeyE')) toggleHold(2);
    input.clear();
  }

  function applyJunction(train, jIndex) {
    const jx = junctions[jIndex];
    if (train.fromRight ? train.x <= jx : train.x >= jx) {
      if (train.diverged) return;
      train.diverged = true;
      if (state.switches[jIndex]) {
        const map = tracks[jIndex];
        if (train.lane === map[0]) train.lane = map[1];
        else if (train.lane === map[1]) train.lane = map[0];
      }
    }
  }

  function processTrain(train, dt) {
    train.alarm = Math.max(0, train.alarm - dt * 2.8);
    train.x += train.speed * dt;
    if (state.settings.reduceMotion) {
      train.x += 0;
    }

    train.diverged = false;
    for (let j = 0; j < junctions.length; j += 1) applyJunction(train, j);

    const reached = (!train.fromRight && train.x > 990) || (train.fromRight && train.x < -30);
    if (reached) {
      const perfect = train.lane === train.targetLane;
      if (perfect) {
        state.delivered += 1;
        state.totalDelivered += 1;
        const points = Math.round(130 * (1 + state.scoreBonus + state.signalBonus));
        state.score += points;
        emitParticle(train.x, laneY[train.lane], '#6fd68a', 16);
        beep(680, 0.05, 'triangle', 0.08);
      } else {
        state.totalMisroutes += 1;
        state.threat += 8 * state.threatGain;
        state.score = Math.max(0, state.score - 40);
        emitParticle(train.x, laneY[train.lane], '#ff9a57', 20);
        beep(170, 0.1, 'sawtooth', 0.13);
      }
      return false;
    }
    return true;
  }

  function collisionCheck() {
    state.trains.sort((a, b) => a.lane - b.lane || a.x - b.x);
    for (let i = 0; i < state.trains.length; i += 1) {
      for (let j = i + 1; j < state.trains.length; j += 1) {
        const a = state.trains[i];
        const b = state.trains[j];
        if (a.lane !== b.lane) break;
        if (Math.abs(a.x - b.x) < 30) {
          state.totalCrashes += 1;
          if (state.crashBuffer > 0) {
            state.crashBuffer -= 1;
            showToast('Shock Buffer 사용! 무결성 손실 방지', 1.7);
          } else {
            state.integrity -= 1;
          }
          state.threat += 22 * state.threatGain;
          state.score = Math.max(0, state.score - 140);
          emitParticle((a.x + b.x) * 0.5, laneY[a.lane], '#ff3a3a', 36);
          beep(90, 0.18, 'square', 0.2);
          state.trains.splice(j, 1);
          state.trains.splice(i, 1);
          return;
        }
      }
    }
  }

  function emitParticle(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({ x, y, vx: (Math.random() - 0.5) * 150, vy: (Math.random() - 0.5) * 150, t: 0.35 + Math.random() * 0.5, color });
    }
  }

  function updateParticles(dt) {
    state.particles = state.particles.filter((p) => {
      p.t -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.t > 0;
    });
  }

  function updateGameplay(dt) {
    handleGameplayInput();

    if (inputHold.Space && state.focus > 0) {
      dt *= 0.45;
      state.focus -= 34 * DIFF[state.settings.difficulty].focusDrain * (1 / 60);
      if (state.focus < 0) state.focus = 0;
    } else {
      state.focus = Math.min(state.focusMax, state.focus + state.focusRegen * dt);
    }

    for (let i = 0; i < state.switchCd.length; i += 1) state.switchCd[i] = Math.max(0, state.switchCd[i] - dt);

    const chapter = CHAPTERS[state.chapter];
    const diff = DIFF[state.settings.difficulty];
    state.chapterTime -= dt;
    state.chapterClock += dt;

    let dynamicSpawn = chapter.spawnBase / diff.spawn;
    if (state.chapterClock > chapter.sec * 0.66) dynamicSpawn *= 0.83;
    if (state.chapter === 3 && state.chapterTime < 80) dynamicSpawn *= 0.76;

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnTrain();
      if (Math.random() < 0.34 + state.chapter * 0.1) spawnTrain();
      state.spawnTimer = dynamicSpawn;
    }

    state.trains = state.trains.filter((t) => processTrain(t, dt));
    collisionCheck();

    state.threat = Math.max(0, state.threat - 6 * dt);
    const crowd = Math.max(0, state.trains.length - 12);
    state.threat += crowd * dt * 2.4;

    updateParticles(dt);

    if (state.integrity <= 0 || state.threat >= 100) {
      endRun(false, state.integrity <= 0 ? '관제실 손상으로 작전 실패' : '위협 지수가 폭주해 도시망 붕괴');
      return;
    }

    if (state.chapterTime <= 0) {
      if (state.delivered >= state.chapterQuota) {
        if (state.chapter < CHAPTERS.length - 1) {
          openUpgrade();
        } else {
          endRun(true, '모든 챕터를 완수하고 터미널 네트워크를 복구했습니다.');
        }
      } else {
        endRun(false, '할당 수송량 미달로 작전이 중단되었습니다.');
      }
    }
  }

  function openUpgrade() {
    toMode('upgrade');
    ui.upgradeList.innerHTML = '';
    const options = [...UPGRADE_POOL]
      .filter((u) => !state.selectedUpgrades.includes(u.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    options.forEach((up) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn';
      btn.innerHTML = `<b>${up.title}</b>${up.desc}`;
      btn.addEventListener('click', () => {
        state.selectedUpgrades.push(up.id);
        up.apply(state);
        beep(420, 0.08, 'sine', 0.14);
        startChapter(state.chapter + 1);
        toMode('play');
      });
      ui.upgradeList.appendChild(btn);
    });
  }

  function endRun(victory, message) {
    state.lastScore = state.score;
    state.bestScore = Math.max(state.bestScore, state.score);
    saveState();
    ui.resultTitle.textContent = victory ? 'Network Stabilized' : 'Operation Failed';
    ui.resultDesc.textContent = message;
    ui.resultStats.innerHTML = '';
    const stats = [
      `최종 점수: ${state.score}`,
      `최고 기록: ${state.bestScore}`,
      `총 수송 성공: ${state.totalDelivered}`,
      `충돌 횟수: ${state.totalCrashes}`,
      `오배송 횟수: ${state.totalMisroutes}`,
      `선택한 강화: ${state.selectedUpgrades.length}개`,
    ];
    stats.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      ui.resultStats.appendChild(li);
    });
    beep(victory ? 660 : 130, 0.2, victory ? 'triangle' : 'sawtooth', 0.2);
    toMode('result');
  }

  function drawTrack() {
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < laneY.length; i += 1) {
      ctx.strokeStyle = '#5f6577';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, laneY[i]);
      ctx.lineTo(canvas.width, laneY[i]);
      ctx.stroke();

      if (state.holds[i]) {
        ctx.fillStyle = '#ff6363';
        ctx.fillRect(90, laneY[i] - 24, 16, 48);
      } else {
        ctx.fillStyle = '#68db8a';
        ctx.fillRect(90, laneY[i] - 24, 16, 48);
      }
    }

    junctions.forEach((x, idx) => {
      const [a, b] = tracks[idx];
      ctx.strokeStyle = state.switches[idx] ? '#f0c35a' : '#6e7486';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 26, laneY[a]);
      ctx.lineTo(x + 26, laneY[b]);
      ctx.stroke();

      ctx.fillStyle = '#d5dae8';
      ctx.fillText(String(idx + 1), x - 4, 58);
    });

    if (!state.settings.reduceMotion) {
      const t = performance.now() * 0.001;
      ctx.strokeStyle = `rgba(245, 195, 90, ${0.25 + Math.sin(t * 2.5) * 0.13})`;
      ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
    }
  }

  function drawTrains() {
    state.trains.forEach((t) => {
      const y = laneY[t.lane];
      const body = t.fromRight ? '#b6c1ff' : '#8de2ff';
      ctx.fillStyle = body;
      ctx.fillRect(t.x - 18, y - 13, 36, 26);
      ctx.strokeStyle = '#0d1325';
      ctx.strokeRect(t.x - 18, y - 13, 36, 26);
      ctx.fillStyle = ['#7edb86', '#e5c56e', '#d78bf5'][t.targetLane];
      ctx.beginPath();
      ctx.arc(t.x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    state.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.t);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    });
  }

  function updateHud() {
    ui.chapter.textContent = `${state.chapter + 1} / ${CHAPTERS.length}`;
    ui.time.textContent = formatTime(state.chapterTime);
    ui.quota.textContent = `${state.delivered} / ${state.chapterQuota}`;
    ui.integrity.textContent = String(state.integrity);
    ui.score.textContent = String(state.score);
    ui.focusFill.style.width = `${(state.focus / state.focusMax) * 100}%`;
    ui.threatFill.style.width = `${Math.min(100, state.threat)}%`;
  }

  function drawTitleBackdrop() {
    ctx.fillStyle = '#100f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const t = performance.now() * 0.001;
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 120 + (t * 80 * (i % 3 + 1))) % (canvas.width + 120) - 60;
      const y = 90 + (i % 3) * 130;
      ctx.fillStyle = i % 2 ? '#6c7388' : '#2f3446';
      ctx.fillRect(x, y, 86, 20);
    }
    ctx.fillStyle = '#f6d37b';
    ctx.font = '700 48px Segoe UI';
    ctx.fillText('CLOCKWORK COURT', 272, 260);
    ctx.font = '400 20px Segoe UI';
    ctx.fillStyle = '#c8cede';
    ctx.fillText('Signalmaster Network Crisis', 330, 295);
  }

  const inputHold = { Space: false };

  function onKeyDown(e) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.mode === 'play') {
        toMode('pause');
      } else if (state.mode === 'pause') {
        toMode('play');
      }
      e.preventDefault();
      return;
    }

    if (e.code === 'Space') inputHold.Space = true;
    if (state.mode === 'play') {
      if (['Digit1', 'Digit2', 'Digit3', 'KeyQ', 'KeyW', 'KeyE'].includes(e.code)) {
        input.add(e.code);
        e.preventDefault();
      }
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') inputHold.Space = false;
  }

  function bindButtons() {
    document.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'new') newRun();
        if (action === 'continue') {
          if (state.previousRun) newRun();
          else showToast('저장된 런이 없습니다. New Run을 시작하세요.', 1.8);
        }
        if (action === 'options') toMode('options');
        if (action === 'credits') toMode('credits');
        if (action === 'backTitle' || action === 'toTitle') toMode('title');
        if (action === 'resume') toMode('play');
        if (action === 'restart') newRun();
        if (action === 'saveOptions') {
          state.settings.difficulty = ui.options.difficulty.value;
          state.settings.volume = Number(ui.options.volume.value);
          state.settings.mute = ui.options.mute.checked;
          state.settings.reduceMotion = ui.options.reduceMotion.checked;
          state.settings.highContrast = ui.options.highContrast.checked;
          state.settings.textScale = Number(ui.options.textScale.value);
          applySettings();
          saveState();
          showToast('옵션 적용 완료', 1.3);
          toMode('title');
        }
      });
    });
  }

  let audioCtx = null;
  function beep(freq, dur, type = 'sine', vol = 0.1) {
    if (state.settings.mute || state.settings.volume <= 0) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime((vol * state.settings.volume) / 100, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.03);
    } catch (_) {}
  }

  function loop(ts) {
    const dtRaw = Math.min(0.05, (ts - loop.prev) / 1000 || 0.016);
    loop.prev = ts;
    let dt = dtRaw;

    if (state.mode === 'play') updateGameplay(dt);
    if (state.mode === 'title') drawTitleBackdrop();
    else {
      drawTrack();
      drawTrains();
    }
    updateHud();

    if (toastTimer > 0) {
      toastTimer -= dtRaw;
      if (toastTimer <= 0) ui.toast.classList.remove('show');
    }

    requestAnimationFrame(loop);
  }
  loop.prev = performance.now();

  canvas.addEventListener('click', (e) => {
    if (state.mode !== 'play') return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    if (Math.abs(x - junctions[0]) < 30) toggleSwitch(0);
    else if (Math.abs(x - junctions[1]) < 30) toggleSwitch(1);
    else if (Math.abs(x - junctions[2]) < 30) toggleSwitch(2);
  });

  loadSave();
  applySettings();
  bindButtons();
  toMode('title');
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  requestAnimationFrame(loop);
})();
