(() => {
  'use strict';

  const STORAGE_KEY = 'sealkeeper_save_v1';
  const DIFFICULTY = {
    story: { speed: 0.83, damage: 0.75, quotaScale: 0.9 },
    standard: { speed: 1, damage: 1, quotaScale: 1 },
    hard: { speed: 1.2, damage: 1.25, quotaScale: 1.12 },
  };

  const CHAPTERS = [
    { id: 1, name: 'I. Dust Intake', quota: 36, spawn: 1400, speed: 48 },
    { id: 2, name: 'II. Corruption Ledger', quota: 56, spawn: 1180, speed: 58 },
    { id: 3, name: 'III. Fracture Court', quota: 76, spawn: 1040, speed: 66 },
    { id: 4, name: 'IV. Abyss Audit', quota: 96, spawn: 960, speed: 72 },
  ];

  const SHAPES = ['CROWN', 'SPIRE', 'WELL', 'VEIL'];
  const AURAS = ['ASH', 'EMBER', 'VOID'];
  const SEALS = [
    { key: 'j', name: 'Dawn Seal' },
    { key: 'k', name: 'Mirror Seal' },
    { key: 'l', name: 'Anchor Seal' },
    { key: ';', name: 'Null Seal' },
  ];

  const state = {
    scene: 'title',
    selectedLane: 0,
    lanes: [[], [], []],
    chapterIndex: 0,
    score: 0,
    integrity: 100,
    focus: 100,
    combo: 0,
    maxCombo: 0,
    sealed: 0,
    runStart: 0,
    elapsed: 0,
    spawnTimer: 0,
    tickHandle: null,
    paused: false,
    tutorialDone: false,
    slowMode: false,
    bossPulseTimer: 0,
    logLines: [],
    focusedRelicId: 0,
    bestScore: 0,
    settings: {
      masterVolume: 0.7,
      sfxVolume: 0.85,
      mute: false,
      difficulty: 'standard',
      flash: true,
      shake: true,
      largeText: false,
    },
  };

  const ui = {
    screens: {
      title: document.getElementById('titleScreen'),
      options: document.getElementById('optionsScreen'),
      credits: document.getElementById('creditsScreen'),
      game: document.getElementById('gameScreen'),
    },
    overlays: {
      pause: document.getElementById('pauseOverlay'),
      result: document.getElementById('resultOverlay'),
    },
    laneGrid: document.getElementById('laneGrid'),
    ruleList: document.getElementById('ruleList'),
    goalText: document.getElementById('goalText'),
    dangerText: document.getElementById('dangerText'),
    toast: document.getElementById('toast'),
    scoreText: document.getElementById('scoreText'),
    integrityText: document.getElementById('integrityText'),
    chapterText: document.getElementById('chapterText'),
    focusText: document.getElementById('focusText'),
    comboText: document.getElementById('comboText'),
    eventLog: document.getElementById('eventLog'),
    sealMap: document.getElementById('sealMap'),
    pauseBtn: document.getElementById('pauseBtn'),
    resultTitle: document.getElementById('resultTitle'),
    resultSubtitle: document.getElementById('resultSubtitle'),
    resultFlavor: document.getElementById('resultFlavor'),
    finalScore: document.getElementById('finalScore'),
    finalCombo: document.getElementById('finalCombo'),
    finalTime: document.getElementById('finalTime'),
    bestScore: document.getElementById('bestScore'),
    options: {
      masterVolume: document.getElementById('masterVolume'),
      sfxVolume: document.getElementById('sfxVolume'),
      muteToggle: document.getElementById('muteToggle'),
      difficultySelect: document.getElementById('difficultySelect'),
      flashToggle: document.getElementById('flashToggle'),
      screenShakeToggle: document.getElementById('screenShakeToggle'),
      largeTextToggle: document.getElementById('largeTextToggle'),
    },
  };

  const audioCtx = window.AudioContext ? new AudioContext() : null;

  function saveState() {
    const save = {
      bestScore: state.bestScore,
      settings: state.settings,
      hasRun: Boolean(state.sealed || state.scene === 'game'),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof parsed.bestScore === 'number') state.bestScore = parsed.bestScore;
      if (parsed.settings && typeof parsed.settings === 'object') {
        state.settings = { ...state.settings, ...parsed.settings };
      }
      applySettingsToUI();
    } catch (error) {
      console.warn('save load failed', error);
    }
  }

  function applySettingsToUI() {
    const s = state.settings;
    ui.options.masterVolume.value = Math.round(s.masterVolume * 100);
    ui.options.sfxVolume.value = Math.round(s.sfxVolume * 100);
    ui.options.muteToggle.checked = s.mute;
    ui.options.difficultySelect.value = s.difficulty;
    ui.options.flashToggle.checked = s.flash;
    ui.options.screenShakeToggle.checked = s.shake;
    ui.options.largeTextToggle.checked = s.largeText;
    document.body.classList.toggle('large-text', s.largeText);
  }

  function beep({ freq = 440, len = 0.08, type = 'sine', gain = 0.03, sweep = 0 }) {
    if (!audioCtx || state.settings.mute) return;
    const vol = state.settings.masterVolume * state.settings.sfxVolume;
    if (vol <= 0) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (sweep !== 0) osc.frequency.linearRampToValueAtTime(freq + sweep, now + len);
    amp.gain.setValueAtTime(gain * vol, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + len);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + len);
  }

  function switchScreen(next) {
    Object.entries(ui.screens).forEach(([name, el]) => el.classList.toggle('active', name === next));
    state.scene = next;
  }

  function setOverlay(name, active) {
    ui.overlays[name].classList.toggle('active', active);
    if (name === 'pause') state.paused = active;
  }

  function chapter() {
    return CHAPTERS[state.chapterIndex];
  }

  function mapSeal(relic) {
    let idx = SHAPES.indexOf(relic.shape);
    if (state.chapterIndex >= 1 && relic.aura === 'EMBER') idx = (idx + 1) % 4;
    if (state.chapterIndex >= 2 && relic.fractured) idx = (idx + 2) % 4;
    if (state.chapterIndex >= 3 && relic.abyssMark) idx = 3 - idx;
    return SEALS[idx].key;
  }

  function newRelic(lane) {
    const c = chapter();
    const id = ++state.focusedRelicId;
    const rel = {
      id,
      lane,
      y: -72,
      speed: c.speed * DIFFICULTY[state.settings.difficulty].speed,
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      aura: AURAS[Math.floor(Math.random() * AURAS.length)],
      corrupted: state.chapterIndex >= 1 && Math.random() < 0.35,
      fractured: state.chapterIndex >= 2 && Math.random() < 0.22,
      abyssMark: state.chapterIndex >= 3 && Math.random() < 0.28,
      needsPurge: false,
      dom: null,
    };
    state.lanes[lane].push(rel);
  }

  function pushLog(text) {
    state.logLines.unshift(`${formatTime(state.elapsed)} · ${text}`);
    state.logLines = state.logLines.slice(0, 11);
    ui.eventLog.innerHTML = state.logLines.map((line) => `<li>${line}</li>`).join('');
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    setTimeout(() => ui.toast.classList.remove('show'), 700);
  }

  function applyDamage(amount, reason) {
    const dmg = Math.round(amount * DIFFICULTY[state.settings.difficulty].damage);
    state.integrity = Math.max(0, state.integrity - dmg);
    state.combo = 0;
    beep({ freq: 150, len: 0.2, type: 'sawtooth', gain: 0.05, sweep: -70 });
    showToast(`장막 손상 -${dmg}`);
    pushLog(`실패: ${reason}`);
    if (state.settings.flash) ui.screens.game.classList.add('flash-danger');
    if (state.settings.shake) ui.laneGrid.classList.add('shake');
    setTimeout(() => {
      ui.screens.game.classList.remove('flash-danger');
      ui.laneGrid.classList.remove('shake');
    }, 240);
  }

  function sealSuccess(rel, bonus = 0) {
    state.score += 75 + state.combo * 3 + bonus;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.sealed += 1;
    state.focus = Math.min(100, state.focus + 2);
    beep({ freq: 300 + state.combo * 5, len: 0.06, type: 'triangle', gain: 0.03, sweep: 90 });
    if (rel.fractured) {
      rel.needsPurge = true;
      showToast('균열 유물: Space로 추방');
    } else {
      removeRelic(rel);
    }
  }

  function purgeTopRelic() {
    const target = state.lanes[state.selectedLane][0];
    if (!target || !target.needsPurge) {
      applyDamage(3, '허공 추방');
      return;
    }
    state.score += 45;
    state.focus = Math.min(100, state.focus + 4);
    beep({ freq: 590, len: 0.09, type: 'square', gain: 0.04, sweep: -200 });
    pushLog('균열 유물 추방 완료');
    removeRelic(target);
  }

  function removeRelic(rel) {
    const laneList = state.lanes[rel.lane];
    const index = laneList.findIndex((r) => r.id === rel.id);
    if (index >= 0) laneList.splice(index, 1);
    if (rel.dom) rel.dom.remove();
  }

  function attemptSeal(key) {
    const target = state.lanes[state.selectedLane][0];
    if (!target) {
      applyDamage(2, '빈 레인에 각인');
      return;
    }
    if (target.needsPurge) {
      applyDamage(5, '추방 전 각인 시도');
      return;
    }
    const expected = mapSeal(target);
    if (key === expected) {
      sealSuccess(target, target.abyssMark ? 30 : 0);
    } else {
      applyDamage(8, `오각인 (${target.shape}/${target.aura})`);
      removeRelic(target);
    }
  }

  function updateRulesUI() {
    const c = chapter();
    const rules = [
      '기본 규칙: 형상(CROWN/SPIRE/WELL/VEIL)을 봉인 키 J/K/L/;에 대응',
      state.chapterIndex >= 1 ? 'EMBER 오라는 한 칸 오른쪽 봉인으로 반전됨' : 'EMBER 오라 반전은 2챕터에서 활성화',
      state.chapterIndex >= 2 ? 'Fractured는 봉인 후 Space 추방까지 해야 완전 격리' : 'Fractured 추방 규칙은 3챕터에서 등장',
      state.chapterIndex >= 3 ? 'Abyss Mark는 봉인 매핑이 좌우 반전됨' : 'Abyss Mark 반전은 4챕터에서 등장',
    ];
    ui.ruleList.innerHTML = rules.map((r) => `<li>${r}</li>`).join('');
    const quota = Math.round(c.quota * DIFFICULTY[state.settings.difficulty].quotaScale);
    ui.goalText.textContent = `목표: ${c.name}에서 ${quota}개 봉인`;
    ui.dangerText.textContent = state.chapterIndex < 3
      ? '경고: 레인 바닥의 코어 존에 닿으면 장막이 손상됩니다.'
      : '최종 경고: 심연 낙인 유물은 높은 피해를 유발합니다.';
  }

  function renderSealMap() {
    const lines = SHAPES.map((shape, i) => `${shape} → ${SEALS[i].key.toUpperCase()}`);
    ui.sealMap.innerHTML = lines.map((line) => `<div class="seal-chip">${line}</div>`).join('');
  }

  function resetRun() {
    state.selectedLane = 0;
    state.lanes = [[], [], []];
    state.chapterIndex = 0;
    state.score = 0;
    state.integrity = 100;
    state.focus = 100;
    state.combo = 0;
    state.maxCombo = 0;
    state.sealed = 0;
    state.elapsed = 0;
    state.runStart = performance.now();
    state.spawnTimer = 400;
    state.logLines = [];
    state.slowMode = false;
    state.bossPulseTimer = 0;
    ui.laneGrid.innerHTML = '';
    for (let i = 0; i < 3; i += 1) {
      const laneEl = document.createElement('div');
      laneEl.className = 'lane';
      laneEl.dataset.lane = String(i);
      laneEl.innerHTML = `<div class="lane-header"><span>Lane ${String.fromCharCode(65 + i)}</span><span>${['A','S','D'][i]}</span></div><div class="core-zone">CORE</div>`;
      ui.laneGrid.appendChild(laneEl);
    }
    pushLog('작전 시작: 봉인 준비 완료');
    updateRulesUI();
    renderSealMap();
    selectLane(0);
  }

  function selectLane(index) {
    state.selectedLane = Math.max(0, Math.min(2, index));
    [...ui.laneGrid.children].forEach((laneEl, i) => laneEl.classList.toggle('selected', i === state.selectedLane));
    beep({ freq: 220 + state.selectedLane * 40, len: 0.03, type: 'triangle', gain: 0.02 });
  }

  function updateHUD() {
    ui.integrityText.textContent = `${state.integrity}%`;
    ui.scoreText.textContent = String(Math.floor(state.score));
    ui.chapterText.textContent = chapter().name;
    ui.focusText.textContent = String(Math.floor(state.focus));
    ui.comboText.textContent = `x${state.combo}`;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function finishRun(win) {
    clearInterval(state.tickHandle);
    state.tickHandle = null;
    setOverlay('pause', false);
    setOverlay('result', true);
    const elapsed = state.elapsed;
    if (state.score > state.bestScore) {
      state.bestScore = Math.floor(state.score);
      saveState();
    }
    ui.resultTitle.textContent = win ? '격리 성공' : '격리 실패';
    ui.resultSubtitle.textContent = win
      ? '심연 장부의 오염 파동이 봉인되었습니다.'
      : '장막이 붕괴하여 금서고가 개방되었습니다.';
    ui.resultFlavor.textContent = win
      ? '보상: 금서고 마스터 인장 해금. 더 높은 난이도에 도전하세요.'
      : '분석: 규칙 반전 구간과 추방 타이밍을 재훈련하면 돌파 가능합니다.';
    ui.finalScore.textContent = String(Math.floor(state.score));
    ui.finalCombo.textContent = String(state.maxCombo);
    ui.finalTime.textContent = formatTime(elapsed);
    ui.bestScore.textContent = String(state.bestScore);
    state.scene = 'result';
  }

  function maybeAdvanceChapter() {
    const c = chapter();
    const quota = Math.round(c.quota * DIFFICULTY[state.settings.difficulty].quotaScale);
    if (state.sealed < quota) return;
    if (state.chapterIndex === CHAPTERS.length - 1) {
      finishRun(true);
      return;
    }
    state.chapterIndex += 1;
    state.sealed = 0;
    state.focus = Math.min(100, state.focus + 25);
    updateRulesUI();
    showToast(`챕터 상승: ${chapter().name}`);
    pushLog(`구간 전환: ${chapter().name}`);
    beep({ freq: 520, len: 0.15, type: 'triangle', gain: 0.05, sweep: 240 });
  }

  function tick(dt) {
    if (state.paused || state.scene !== 'game') return;
    const speedScale = state.slowMode && state.focus > 0 ? 0.56 : 1;
    if (state.slowMode && state.focus > 0) state.focus = Math.max(0, state.focus - dt * 9.5);
    if (!state.slowMode) state.focus = Math.min(100, state.focus + dt * 2.5);
    if (state.focus <= 1) state.slowMode = false;

    state.elapsed = (performance.now() - state.runStart) / 1000;
    state.spawnTimer -= dt * 1000;
    const c = chapter();
    const spawnGap = c.spawn / speedScale / DIFFICULTY[state.settings.difficulty].speed;
    if (state.spawnTimer <= 0) {
      newRelic(Math.floor(Math.random() * 3));
      state.spawnTimer = spawnGap * (0.85 + Math.random() * 0.4);
    }

    if (state.chapterIndex === 3) {
      state.bossPulseTimer += dt;
      if (state.bossPulseTimer > 14) {
        state.bossPulseTimer = 0;
        state.lanes.forEach((lane) => {
          lane.forEach((rel) => {
            rel.abyssMark = true;
          });
        });
        pushLog('심연 파동: 전 유물 반전 각인');
        showToast('심연 파동 발생! 반전 각인 주의');
        beep({ freq: 120, len: 0.35, type: 'sawtooth', gain: 0.06, sweep: -50 });
      }
    }

    state.lanes.forEach((lane, laneIndex) => {
      const laneEl = ui.laneGrid.children[laneIndex];
      lane.forEach((rel) => {
        rel.y += rel.speed * dt * speedScale;
        if (rel.y > 538) {
          applyDamage(rel.abyssMark ? 16 : 11, '코어 유입');
          removeRelic(rel);
        }
      });
      lane.sort((a, b) => b.y - a.y);
      renderLane(laneEl, lane);
    });

    maybeAdvanceChapter();
    updateHUD();

    if (state.integrity <= 0) finishRun(false);
  }

  function renderLane(laneEl, relics) {
    relics.forEach((rel) => {
      if (!rel.dom) {
        const node = document.createElement('div');
        node.className = 'relic';
        rel.dom = node;
        laneEl.appendChild(node);
      }
      rel.dom.style.top = `${rel.y}px`;
      rel.dom.className = `relic${rel.corrupted ? ' corrupt' : ''}${rel.fractured ? ' fractured' : ''}`;
      const hint = `${rel.shape} · ${rel.aura}${rel.abyssMark ? ' · ABYSS' : ''}`;
      rel.dom.innerHTML = `<div>${hint}</div><div class="hint">${rel.needsPurge ? 'SPACE 추방 필요' : '봉인 입력 대기'}</div>`;
    });
  }

  function startRun() {
    resetRun();
    switchScreen('game');
    setOverlay('result', false);
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    state.tickHandle = setInterval(() => tick(1 / 60), 1000 / 60);
  }

  function togglePause() {
    if (state.scene !== 'game') return;
    setOverlay('pause', !state.paused);
  }

  function bindMenus() {
    document.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'new':
          case 'playAgain':
          case 'restart':
            startRun();
            break;
          case 'continue':
            startRun();
            break;
          case 'options':
          case 'toOptions':
            switchScreen('options');
            setOverlay('pause', false);
            break;
          case 'credits':
            switchScreen('credits');
            break;
          case 'backToTitle':
          case 'quitToTitle':
            clearInterval(state.tickHandle);
            setOverlay('pause', false);
            setOverlay('result', false);
            switchScreen('title');
            saveState();
            break;
          case 'resume':
            setOverlay('pause', false);
            break;
          default:
            break;
        }
      });
    });

    ui.pauseBtn.addEventListener('click', togglePause);

    Object.entries(ui.options).forEach(([key, input]) => {
      input.addEventListener('input', () => {
        if (key === 'masterVolume' || key === 'sfxVolume') {
          state.settings[key] = Number(input.value) / 100;
          beep({ freq: 420, len: 0.03, gain: 0.03 });
        } else if (key === 'difficultySelect') {
          state.settings.difficulty = input.value;
        } else if (key === 'muteToggle') {
          state.settings.mute = input.checked;
        } else if (key === 'flashToggle') {
          state.settings.flash = input.checked;
        } else if (key === 'screenShakeToggle') {
          state.settings.shake = input.checked;
        } else if (key === 'largeTextToggle') {
          state.settings.largeText = input.checked;
          document.body.classList.toggle('large-text', state.settings.largeText);
        }
        saveState();
      });
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        if (state.scene === 'game') togglePause();
        return;
      }
      if (state.scene !== 'game' || state.paused) return;
      if (key === 'a') selectLane(0);
      else if (key === 's') selectLane(1);
      else if (key === 'd') selectLane(2);
      else if (key === ' ') {
        event.preventDefault();
        purgeTopRelic();
      } else if (key === 'shift') {
        state.slowMode = true;
      } else if (SEALS.some((seal) => seal.key === key)) attemptSeal(key);
    });

    document.addEventListener('keyup', (event) => {
      if (event.key.toLowerCase() === 'shift') state.slowMode = false;
    });
  }

  function init() {
    loadState();
    bindMenus();
    bindKeyboard();
    switchScreen('title');
    renderSealMap();
    pushLog('대기: 신규 작전을 시작하십시오');
    updateHUD();
  }

  init();
})();
