(() => {
  "use strict";

  const STORAGE_KEY = "fps-mouse-lab-v1";
  const HEALTH_DURATION = 10000;
  const CPS_DURATION = 5000;
  const ANGLE_TRIALS = 5;
  const REACTION_ROUNDS = 5;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const percentile = (values, fraction) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  };
  const standardDeviation = (values) => {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
  };
  const round = (value, digits = 1) => Number(value.toFixed(digits));
  const nowLabel = () => new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const state = {
    activeView: "overview",
    sound: true,
    audio: null,
    history: [],
    eventLog: [],
    globalIntervals: [],
    globalLastMoveAt: 0,
    globalEvents: 0,
    lastClientBySurface: new WeakMap(),
    canvasPaths: new WeakMap(),
    overviewSaved: false,
    overview: {
      buttons: [0, 0, 0, 0, 0],
      wheelUp: 0,
      wheelDown: 0,
      distance: 0,
      events: 0
    },
    health: {
      active: false,
      startedAt: 0,
      endAt: 0,
      lastMoveAt: 0,
      intervals: [],
      samples: 0,
      distance: 0,
      raf: 0
    },
    angle: {
      active: false,
      dx: 0,
      dy: 0,
      distance: 0,
      points: [],
      trials: []
    },
    cps: {
      active: false,
      startedAt: 0,
      endAt: 0,
      clicks: [],
      raf: 0
    },
    latency: {
      handlerSamples: [],
      frameSamples: [],
      complete: false
    },
    reaction: {
      phase: "idle",
      results: [],
      falseStarts: 0,
      signalAt: 0,
      timer: 0,
      nextTimer: 0
    }
  };

  function showToast(message) {
    const toast = $("labToast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function ensureAudio() {
    if (!state.audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) state.audio = new Context();
    }
    if (state.audio?.state === "suspended") state.audio.resume();
  }

  function tone(frequency = 620, duration = .045, gain = .025) {
    if (!state.sound) return;
    ensureAudio();
    if (!state.audio) return;
    const oscillator = state.audio.createOscillator();
    const volume = state.audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, state.audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(.0001, state.audio.currentTime + duration);
    oscillator.connect(volume).connect(state.audio.destination);
    oscillator.start();
    oscillator.stop(state.audio.currentTime + duration);
  }

  function logEvent(kind, detail, level = "") {
    state.eventLog.unshift({ time: nowLabel(), kind, detail, level });
    state.eventLog = state.eventLog.slice(0, 50);
    renderEventLog();
  }

  function renderEventLog() {
    const list = $("eventLog");
    if (!state.eventLog.length) {
      list.innerHTML = "<li><span>—</span><span>等待</span><span>尚无事件</span></li>";
      return;
    }
    list.replaceChildren(...state.eventLog.map((entry) => {
      const item = document.createElement("li");
      item.className = entry.level;
      item.innerHTML = `<span>${entry.time}</span><span>${entry.kind}</span><span>${entry.detail}</span>`;
      return item;
    }));
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.history = Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      state.history = [];
    }
    renderCompletion();
  }

  function persistHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: state.history.slice(0, 60) }));
      return true;
    } catch {
      showToast("浏览器未允许保存本地档案。");
      return false;
    }
  }

  function saveRecord(kind, summary, conclusion) {
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      kind,
      summary
    };
    state.history.unshift(record);
    state.history = state.history.slice(0, 60);
    if (persistHistory()) {
      setConclusion(conclusion.tone, conclusion.title, conclusion.detail);
      renderCompletion();
    }
    return record;
  }

  function renderCompletion() {
    const knownTests = new Set(["overview", "health", "angle", "cps", "latency", "reaction"]);
    const completed = new Set(state.history.map((record) => record.kind).filter((kind) => knownTests.has(kind)));
    if (state.overviewSaved) completed.add("overview");
    $$(".lab-nav-item").forEach((button) => {
      const key = button.dataset.labView;
      const lamp = button.querySelector(".lamp");
      button.classList.toggle("complete", completed.has(key));
      if (lamp) lamp.className = `lamp ${completed.has(key) ? "live" : key === state.activeView ? "warn" : ""}`;
    });
    $("completedCount").textContent = `${completed.size} / 6`;
    $("profileCountReadout").textContent = `${state.history.length} 条`;
  }

  function setConclusion(toneName, title, detail) {
    const container = $("conclusionState");
    container.className = `conclusion-state ${toneName}`;
    container.innerHTML = `
      <span class="conclusion-mark">${toneName === "pass" ? "✓" : toneName === "warn" ? "!" : "○"}</span>
      <div><strong>${title}</strong><p>${detail}</p></div>`;
  }

  function switchView(view) {
    if (view === state.activeView) return;
    cancelTransientTests();
    state.activeView = view;
    $$(".lab-nav-item").forEach((button) => {
      const active = button.dataset.labView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$(".lab-view").forEach((panel) => {
      const active = panel.dataset.view === view;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    renderCompletion();
    $("diagState").textContent = "等待输入";
    logEvent("导航", `进入${document.querySelector(`[data-lab-view="${view}"] strong`)?.textContent || view}`);
    requestAnimationFrame(() => {
      if (view === "overview") clearCanvas($("overviewCanvas"));
      if (view === "health") clearCanvas($("healthCanvas"));
      if (view === "angle") drawAngleCanvas();
    });
  }

  function cancelTransientTests() {
    if (state.health.active) {
      state.health.active = false;
      cancelAnimationFrame(state.health.raf);
      $("startHealthBtn").disabled = false;
      $("startHealthBtn").textContent = "开始 10 秒检查";
      logEvent("中止", "输入链路检查未完成", "warn");
    }
    if (state.cps.active) finishCps(true);
    clearTimeout(state.reaction.timer);
    clearTimeout(state.reaction.nextTimer);
    state.reaction.phase = "idle";
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function setInputPresence(active, label = "") {
    $("labInputLamp").className = `lamp ${active ? "live" : ""}`;
    $("labInputState").textContent = active ? (label || "正在接收鼠标输入") : "等待鼠标进入测试台";
    $("surfacePresence").textContent = active ? "正在接收输入" : "等待鼠标进入";
  }

  function movementFor(event, surface) {
    let dx = Number(event.movementX) || 0;
    let dy = Number(event.movementY) || 0;
    const previous = state.lastClientBySurface.get(surface);
    if (!dx && !dy && previous) {
      dx = event.clientX - previous.x;
      dy = event.clientY - previous.y;
    }
    state.lastClientBySurface.set(surface, { x: event.clientX, y: event.clientY });
    return { dx, dy };
  }

  function registerGlobalMove(now) {
    if (state.globalLastMoveAt) {
      const interval = now - state.globalLastMoveAt;
      if (interval > .04 && interval < 100) {
        state.globalIntervals.push(interval);
        if (state.globalIntervals.length > 360) state.globalIntervals.shift();
      }
    }
    state.globalLastMoveAt = now;
    state.globalEvents += 1;
  }

  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const path = { x: width / 2, y: height / 2 };
      state.canvasPaths.set(canvas, path);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function clearCanvas(canvas) {
    const { ctx, width, height } = canvasContext(canvas);
    ctx.clearRect(0, 0, width, height);
    state.canvasPaths.set(canvas, { x: width / 2, y: height / 2 });
  }

  function drawMotion(canvas, dx, dy, color = "#9be564") {
    const { ctx, width, height } = canvasContext(canvas);
    const path = state.canvasPaths.get(canvas) || { x: width / 2, y: height / 2 };
    const nextX = clamp(path.x + dx, 4, width - 4);
    const nextY = clamp(path.y + dy, 4, height - 4);
    ctx.beginPath();
    ctx.moveTo(path.x, path.y);
    ctx.lineTo(nextX, nextY);
    ctx.strokeStyle = color;
    ctx.globalAlpha = .72;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    state.canvasPaths.set(canvas, { x: nextX, y: nextY });
  }

  function handleOverviewMove(event) {
    const captureArea = $("overviewCaptureArea");
    const { dx, dy } = movementFor(event, captureArea);
    const now = performance.now();
    registerGlobalMove(now);
    state.overview.distance += Math.hypot(dx, dy);
    state.overview.events += 1;
    drawMotion($("overviewCanvas"), dx, dy);
    $("overviewEmpty").classList.add("hidden");
    renderOverview();
    maybeCompleteOverview();
  }

  function renderOverview() {
    $("overviewDistance").textContent = `${Math.round(state.overview.distance)} px`;
    $("wheelUpCount").textContent = state.overview.wheelUp;
    $("wheelDownCount").textContent = state.overview.wheelDown;
    $("overviewEvents").textContent = state.overview.events;
    state.overview.buttons.forEach((count, index) => {
      const readout = document.querySelector(`[data-button-count="${index}"]`);
      if (readout) readout.textContent = count;
    });
  }

  function maybeCompleteOverview() {
    const actions = state.overview.buttons.reduce((sum, value) => sum + value, 0) +
      state.overview.wheelUp + state.overview.wheelDown;
    if (state.overviewSaved || state.overview.events < 30 || actions < 1) return;
    state.overviewSaved = true;
    saveRecord("overview", {
      events: state.overview.events,
      distance: Math.round(state.overview.distance),
      buttons: state.overview.buttons,
      wheelUp: state.overview.wheelUp,
      wheelDown: state.overview.wheelDown
    }, {
      tone: "pass",
      title: "综合输入已通过",
      detail: "浏览器已接收到移动与至少一种按键或滚轮事件。"
    });
    logEvent("结论", "综合输入样本已记录");
  }

  function flashMousePart(button) {
    const part = document.querySelector(`[data-mouse-part="${button}"]`);
    if (!part) return;
    part.classList.add("active");
    setTimeout(() => part.classList.remove("active"), 130);
  }

  function handleOverviewButton(event) {
    event.preventDefault();
    const button = clamp(Number(event.button) || 0, 0, 4);
    state.overview.buttons[button] += 1;
    flashMousePart(button);
    tone(button === 0 ? 720 : 520 + button * 45);
    logEvent("按键", ["左键", "中键", "右键", "后退", "前进"][button] || `按钮 ${button}`);
    renderOverview();
    maybeCompleteOverview();
  }

  function handleOverviewWheel(event) {
    event.preventDefault();
    if (event.deltaY < 0) state.overview.wheelUp += 1;
    else state.overview.wheelDown += 1;
    const wheel = document.querySelector('[data-mouse-part="1"]');
    wheel?.classList.add("active");
    setTimeout(() => wheel?.classList.remove("active"), 130);
    tone(event.deltaY < 0 ? 760 : 580);
    logEvent("滚轮", event.deltaY < 0 ? "向上" : "向下");
    renderOverview();
    maybeCompleteOverview();
  }

  function resetOverview() {
    state.overview = { buttons: [0, 0, 0, 0, 0], wheelUp: 0, wheelDown: 0, distance: 0, events: 0 };
    state.overviewSaved = false;
    clearCanvas($("overviewCanvas"));
    $("overviewEmpty").classList.remove("hidden");
    renderOverview();
    renderCompletion();
    logEvent("重置", "综合输入计数已清零");
  }

  async function requestPointerLockFor(element) {
    if (!element.requestPointerLock) {
      $("pointerLockReadout").textContent = "浏览器不支持";
      return false;
    }
    try {
      const result = element.requestPointerLock({ unadjustedMovement: true });
      if (result?.catch) await result;
      return true;
    } catch {
      try {
        const fallback = element.requestPointerLock();
        if (fallback?.catch) await fallback;
        return true;
      } catch {
        $("pointerLockReadout").textContent = "兼容移动模式";
        return false;
      }
    }
  }

  function handleHealthMove(event) {
    if (!state.health.active) return;
    const surface = $("healthSurface");
    const { dx, dy } = movementFor(event, surface);
    const now = performance.now();
    registerGlobalMove(now);
    if (state.health.lastMoveAt) {
      const interval = now - state.health.lastMoveAt;
      if (interval > .04 && interval < 250) state.health.intervals.push(interval);
    }
    state.health.lastMoveAt = now;
    state.health.samples += 1;
    state.health.distance += Math.hypot(dx, dy);
    drawMotion($("healthCanvas"), dx, dy, "#c9f6a6");
    $("healthEmpty").classList.add("hidden");
    if (state.health.samples % 12 === 0) renderHealthLive();
  }

  async function startHealth() {
    ensureAudio();
    state.health.active = true;
    state.health.startedAt = performance.now();
    state.health.endAt = state.health.startedAt + HEALTH_DURATION;
    state.health.lastMoveAt = 0;
    state.health.intervals = [];
    state.health.samples = 0;
    state.health.distance = 0;
    clearCanvas($("healthCanvas"));
    $("healthEmpty").classList.remove("hidden");
    $("startHealthBtn").disabled = true;
    $("startHealthBtn").textContent = "检查进行中";
    $("healthSampleState").textContent = "持续移动鼠标";
    logEvent("开始", "10 秒输入链路健康检查");
    tone(680, .08);
    await requestPointerLockFor($("healthSurface"));
    cancelAnimationFrame(state.health.raf);
    state.health.raf = requestAnimationFrame(tickHealth);
  }

  function renderHealthLive() {
    const intervals = state.health.intervals;
    const med = median(intervals);
    const rate = med ? Math.round(1000 / med) : 0;
    $("healthSamples").textContent = state.health.samples;
    $("healthLiveRate").textContent = rate ? `≈ ${rate} Hz*` : "≈ 0 Hz*";
    $("healthRate").textContent = rate ? `≈ ${rate} Hz*` : "—";
  }

  function tickHealth(now) {
    if (!state.health.active) return;
    const remaining = Math.max(0, state.health.endAt - now);
    $("healthClock").textContent = `${(remaining / 1000).toFixed(1)} s`;
    if (remaining <= 0) {
      finishHealth();
      return;
    }
    state.health.raf = requestAnimationFrame(tickHealth);
  }

  function finishHealth() {
    state.health.active = false;
    cancelAnimationFrame(state.health.raf);
    if (document.pointerLockElement) document.exitPointerLock();
    $("startHealthBtn").disabled = false;
    $("startHealthBtn").textContent = "重新检查";
    $("healthClock").textContent = "0.0 s";
    const intervals = state.health.intervals;
    const med = median(intervals);
    const p95 = percentile(intervals, .95);
    const average = mean(intervals);
    const jitter = average ? standardDeviation(intervals) / average : 1;
    const longThreshold = Math.max(8, med * 2.5);
    const longGaps = intervals.filter((value) => value > longThreshold).length;
    const longRatio = intervals.length ? longGaps / intervals.length : 1;
    const rate = med ? 1000 / med : 0;
    const enough = intervals.length >= 60 && state.health.distance >= 500;
    const score = enough ? clamp(
      100 - jitter * 58 - longRatio * 260 - Math.max(0, p95 / Math.max(med, .01) - 2) * 10,
      0,
      100
    ) : 0;
    const toneName = !enough || score < 58 ? "warn" : "pass";
    const title = !enough ? "样本不足" : score >= 82 ? "输入链路稳定" : score >= 58 ? "输入链路可用" : "建议排查输入链路";
    const detail = !enough
      ? "移动样本不足，请重新测试并持续、均匀地画圈。"
      : `浏览器事件频率约 ${Math.round(rate)} Hz，P95 ${p95.toFixed(2)} ms，长间隔 ${longGaps} 次。`;
    $("healthSampleState").textContent = title;
    $("healthSamples").textContent = state.health.samples;
    $("healthRate").textContent = rate ? `≈ ${Math.round(rate)} Hz*` : "—";
    $("healthP95").textContent = p95 ? `${p95.toFixed(2)} ms` : "—";
    $("healthJitter").textContent = intervals.length ? `${Math.round(jitter * 100)}%` : "—";
    $("healthLongGaps").textContent = intervals.length ? `${longGaps} 次` : "—";
    if (enough) {
      saveRecord("health", {
        samples: state.health.samples,
        distance: Math.round(state.health.distance),
        estimatedEventRate: round(rate),
        medianIntervalMs: round(med, 2),
        p95IntervalMs: round(p95, 2),
        jitterRatio: round(jitter, 3),
        longGaps,
        longGapThresholdMs: round(longThreshold, 2),
        score: round(score)
      }, { tone: toneName, title, detail });
      tone(toneName === "pass" ? 780 : 430, .12);
      logEvent("结论", `${title} · ${Math.round(score)} 分`, toneName === "warn" ? "warn" : "");
    } else {
      setConclusion("warn", title, detail);
      tone(360, .12);
      logEvent("样本", "输入链路移动样本不足", "warn");
    }
  }

  function startAngleTrial() {
    if (state.angle.trials.length >= ANGLE_TRIALS) {
      showToast("五条直线已经完成；如需重测，请先重新校准。");
      return;
    }
    state.angle.active = true;
    state.angle.dx = 0;
    state.angle.dy = 0;
    state.angle.distance = 0;
    state.angle.points = [{ x: 0, y: 0 }];
    clearCanvas($("angleCanvas"));
    $("startAngleBtn").disabled = true;
    $("finishAngleBtn").disabled = false;
    $("angleInstruction").innerHTML = "<strong>正在记录</strong><span>沿真实水平边缘完成一次自然直线移动</span>";
    $("diagState").textContent = "记录直线移动";
    logEvent("开始", `角度直线 ${state.angle.trials.length + 1}`);
    tone(660);
  }

  function handleAngleMove(event) {
    if (!state.angle.active) return;
    const surface = $("angleCanvas");
    const { dx, dy } = movementFor(event, surface);
    const now = performance.now();
    registerGlobalMove(now);
    state.angle.dx += dx;
    state.angle.dy += dy;
    state.angle.distance += Math.hypot(dx, dy);
    state.angle.points.push({ x: state.angle.dx, y: state.angle.dy });
    if (state.angle.points.length > 500) state.angle.points.shift();
    drawAngleCanvas();
  }

  function drawAngleCanvas() {
    const canvas = $("angleCanvas");
    const { ctx, width, height } = canvasContext(canvas);
    ctx.clearRect(0, 0, width, height);
    const points = state.angle.points;
    if (!points.length) return;
    const maxX = Math.max(1, ...points.map((point) => Math.abs(point.x)));
    const maxY = Math.max(1, ...points.map((point) => Math.abs(point.y)));
    const scale = Math.min(width * .4 / maxX, height * .32 / maxY, 1);
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = width / 2 + point.x * scale;
      const y = height / 2 + point.y * scale;
      if (!index) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#9be564";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#f1f0df";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function finishAngleTrial() {
    if (!state.angle.active) return;
    state.angle.active = false;
    $("startAngleBtn").disabled = false;
    $("finishAngleBtn").disabled = true;
    let dx = state.angle.dx;
    let dy = state.angle.dy;
    if (dx < 0) {
      dx *= -1;
      dy *= -1;
    }
    const sufficient = Math.abs(dx) >= 120 && state.angle.distance >= 180;
    if (!sufficient) {
      $("angleInstruction").innerHTML = "<strong>本条样本太短</strong><span>请完成一次更长、更连续的水平扫动</span>";
      setConclusion("warn", "角度样本不足", "横向位移或累计距离不足，本条直线没有计入结果。");
      tone(350, .11);
      logEvent("样本", "角度直线距离不足，未计入", "warn");
      return;
    }
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    state.angle.trials.push({
      angle,
      distance: state.angle.distance,
      horizontal: Math.abs(dx)
    });
    renderAngleTrials();
    const remaining = ANGLE_TRIALS - state.angle.trials.length;
    $("angleInstruction").innerHTML = remaining
      ? `<strong>本条 ${angle >= 0 ? "向下" : "向上"}偏 ${Math.abs(angle).toFixed(2)}°</strong><span>还需要 ${remaining} 条有效直线</span>`
      : "<strong>五条直线已完成</strong><span>右侧已生成角度偏移结论</span>";
    tone(760);
    logEvent("样本", `角度 ${angle >= 0 ? "+" : ""}${angle.toFixed(2)}°`);
    if (!remaining) finishAngleCalibration();
  }

  function renderAngleTrials() {
    $("angleTrialCount").textContent = `${state.angle.trials.length} / ${ANGLE_TRIALS}`;
    const list = $("angleTrials");
    const items = Array.from({ length: ANGLE_TRIALS }, (_, index) => {
      const item = document.createElement("li");
      const trial = state.angle.trials[index];
      item.innerHTML = trial
        ? `<span>直线 ${index + 1}</span><strong>${trial.angle >= 0 ? "+" : ""}${trial.angle.toFixed(2)}°</strong>`
        : `<span>直线 ${index + 1}</span><strong>—</strong>`;
      return item;
    });
    list.replaceChildren(...items);
  }

  function finishAngleCalibration() {
    const angles = state.angle.trials.map((trial) => trial.angle);
    const central = median(angles);
    const mad = median(angles.map((angle) => Math.abs(angle - central)));
    const compensation = -central;
    const consistency = mad <= .8 ? "一致性良好" : mad <= 1.8 ? "一致性一般" : "握持方向波动较大";
    const detail = `自然移动中位偏移 ${central >= 0 ? "+" : ""}${central.toFixed(2)}°，建议补偿起点 ${compensation >= 0 ? "+" : ""}${compensation.toFixed(2)}°；MAD ${mad.toFixed(2)}°。`;
    saveRecord("angle", {
      trials: state.angle.trials,
      medianAngle: round(central, 2),
      suggestedCompensation: round(compensation, 2),
      medianAbsoluteDeviation: round(mad, 2),
      consistency
    }, {
      tone: mad <= 1.8 ? "pass" : "warn",
      title: consistency,
      detail
    });
    logEvent("结论", `${consistency} · 补偿 ${compensation.toFixed(2)}°`, mad > 1.8 ? "warn" : "");
  }

  function resetAngle() {
    state.angle = { active: false, dx: 0, dy: 0, distance: 0, points: [], trials: [] };
    $("startAngleBtn").disabled = false;
    $("finishAngleBtn").disabled = true;
    $("angleInstruction").innerHTML = "<strong>准备第一条直线</strong><span>点击“开始记录”，再完成一次自然水平扫动</span>";
    renderAngleTrials();
    clearCanvas($("angleCanvas"));
    logEvent("重置", "角度校准样本已清空");
  }

  function handleCpsClick() {
    const now = performance.now();
    if (!state.cps.active) {
      state.cps.active = true;
      state.cps.startedAt = now;
      state.cps.endAt = now + CPS_DURATION;
      state.cps.clicks = [now];
      $("cpsState").textContent = "继续点击";
      logEvent("开始", "5 秒 CPS 测试");
      cancelAnimationFrame(state.cps.raf);
      state.cps.raf = requestAnimationFrame(tickCps);
    } else {
      state.cps.clicks.push(now);
    }
    $("cpsLive").textContent = state.cps.clicks.length;
    tone(540 + Math.min(240, state.cps.clicks.length * 4), .025, .012);
  }

  function tickCps(now) {
    if (!state.cps.active) return;
    const remaining = Math.max(0, state.cps.endAt - now);
    $("cpsClock").textContent = `${(remaining / 1000).toFixed(1)} s`;
    if (remaining <= 0) {
      finishCps(false);
      return;
    }
    state.cps.raf = requestAnimationFrame(tickCps);
  }

  function finishCps(cancelled) {
    if (!state.cps.active) return;
    state.cps.active = false;
    cancelAnimationFrame(state.cps.raf);
    if (cancelled) {
      $("cpsState").textContent = "点击开始";
      $("cpsClock").textContent = "5.0 s";
      return;
    }
    const times = state.cps.clicks;
    const intervals = times.slice(1).map((time, index) => time - times[index]);
    let peak = 0;
    times.forEach((time, startIndex) => {
      let endIndex = startIndex;
      while (endIndex < times.length && times[endIndex] - time <= 1000) endIndex += 1;
      peak = Math.max(peak, endIndex - startIndex);
    });
    const averageCps = times.length / (CPS_DURATION / 1000);
    const intervalAverage = mean(intervals);
    const coefficient = intervalAverage ? standardDeviation(intervals) / intervalAverage : 1;
    const stability = clamp(100 - coefficient * 100, 0, 100);
    $("cpsState").textContent = "完成 · 再次点击可重测";
    $("cpsClock").textContent = "0.0 s";
    $("cpsClicks").textContent = times.length;
    $("cpsAverage").textContent = averageCps.toFixed(1);
    $("cpsPeak").textContent = `${peak} CPS`;
    $("cpsStability").textContent = `${Math.round(stability)}%`;
    saveRecord("cps", {
      clicks: times.length,
      averageCps: round(averageCps),
      peakOneSecond: peak,
      intervalStability: round(stability),
      averageIntervalMs: round(intervalAverage, 1)
    }, {
      tone: "pass",
      title: "CPS 测试完成",
      detail: `平均 ${averageCps.toFixed(1)} CPS，峰值 ${peak} CPS，点击间隔稳定性 ${Math.round(stability)}%。`
    });
    tone(790, .1);
    logEvent("结论", `平均 ${averageCps.toFixed(1)} CPS`);
  }

  function normalizeEventTimeStamp(timeStamp) {
    const current = performance.now();
    if (timeStamp > current + 60000 && performance.timeOrigin) {
      return timeStamp - performance.timeOrigin;
    }
    return timeStamp;
  }

  function handleLatencySample(event) {
    if (state.latency.complete) return;
    const eventAt = normalizeEventTimeStamp(event.timeStamp);
    const handledAt = performance.now();
    const handlerDelay = Math.max(0, handledAt - eventAt);
    requestAnimationFrame((frameAt) => {
      const frameDelay = Math.max(handlerDelay, frameAt - eventAt);
      state.latency.handlerSamples.push(handlerDelay);
      state.latency.frameSamples.push(frameDelay);
      renderLatency();
      tone(600 + state.latency.frameSamples.length * 7, .025, .012);
      if (state.latency.frameSamples.length >= 20) finishLatency();
    });
  }

  function renderLatency() {
    const handler = state.latency.handlerSamples;
    const frame = state.latency.frameSamples;
    $("latencySampleCount").textContent = `${frame.length} / 20`;
    $("latencyLive").textContent = frame.length ? `${frame[frame.length - 1].toFixed(1)} ms` : "READY";
    $("latencyHandlerMedian").textContent = handler.length ? `${median(handler).toFixed(2)} ms` : "—";
    $("latencyFrameMedian").textContent = frame.length ? `${median(frame).toFixed(2)} ms` : "—";
    $("latencyFrameP95").textContent = frame.length ? `${percentile(frame, .95).toFixed(2)} ms` : "—";
    $("latencyLongFrames").textContent = frame.length ? `${frame.filter((value) => value > 20).length} 次` : "—";
    $("latencyMessage").textContent = frame.length < 20 ? "继续以正常节奏点击" : "20 次采样完成";
  }

  function finishLatency() {
    state.latency.complete = true;
    $("latencyStage").disabled = true;
    const handlerMedian = median(state.latency.handlerSamples);
    const frameMedian = median(state.latency.frameSamples);
    const frameP95 = percentile(state.latency.frameSamples, .95);
    const longFrames = state.latency.frameSamples.filter((value) => value > 20).length;
    const toneName = frameP95 <= 25 ? "pass" : "warn";
    saveRecord("latency", {
      samples: state.latency.frameSamples.length,
      handlerMedianMs: round(handlerMedian, 2),
      frameMedianMs: round(frameMedian, 2),
      frameP95Ms: round(frameP95, 2),
      overTwentyMs: longFrames,
      scope: "browser event timestamp to next animation frame; excludes hardware, display scanout and game engine"
    }, {
      tone: toneName,
      title: "浏览器事件延迟代理已完成",
      detail: `事件到下一帧中位数 ${frameMedian.toFixed(2)} ms，P95 ${frameP95.toFixed(2)} ms；这不是鼠标硬件延迟。`
    });
    tone(toneName === "pass" ? 800 : 430, .1);
    logEvent("结论", `事件到帧 ${frameMedian.toFixed(2)} ms · 代理值`, toneName === "warn" ? "warn" : "");
  }

  function resetLatency() {
    state.latency = { handlerSamples: [], frameSamples: [], complete: false };
    $("latencyStage").disabled = false;
    $("latencyMessage").textContent = "按正常节奏点击 20 次";
    renderLatency();
    logEvent("重置", "事件延迟代理样本已清空");
  }

  function startReactionRound(reset = false) {
    clearTimeout(state.reaction.timer);
    clearTimeout(state.reaction.nextTimer);
    if (reset) {
      state.reaction.results = [];
      state.reaction.falseStarts = 0;
      renderReactionMetrics();
    }
    state.reaction.phase = "wait";
    $("reactionStage").dataset.state = "wait";
    $("reactionMessage").textContent = "等待绿色信号…";
    $("reactionLiveResult").textContent = "HOLD";
    $("reactionRound").textContent = `${state.reaction.results.length} / ${REACTION_ROUNDS}`;
    const delay = 1200 + Math.random() * 2000;
    state.reaction.timer = setTimeout(() => {
      state.reaction.phase = "go";
      state.reaction.signalAt = performance.now();
      $("reactionStage").dataset.state = "go";
      $("reactionMessage").textContent = "现在点击";
      $("reactionLiveResult").textContent = "GO";
      tone(880, .055);
    }, delay);
    logEvent("准备", `反应力第 ${state.reaction.results.length + 1} 轮`);
  }

  function handleReactionClick() {
    if (state.reaction.phase === "idle" || state.reaction.phase === "done") {
      startReactionRound(true);
      return;
    }
    if (state.reaction.phase === "wait") {
      clearTimeout(state.reaction.timer);
      state.reaction.falseStarts += 1;
      state.reaction.phase = "false";
      $("reactionStage").dataset.state = "false";
      $("reactionMessage").textContent = "抢跑了";
      $("reactionLiveResult").textContent = "EARLY";
      $("reactionFalseStarts").textContent = state.reaction.falseStarts;
      tone(300, .12);
      logEvent("抢跑", "绿色信号前点击", "warn");
      state.reaction.nextTimer = setTimeout(() => startReactionRound(false), 850);
      return;
    }
    if (state.reaction.phase !== "go") return;
    const reaction = performance.now() - state.reaction.signalAt;
    state.reaction.results.push(reaction);
    $("reactionStage").dataset.state = "idle";
    $("reactionMessage").textContent = `${Math.round(reaction)} ms`;
    $("reactionLiveResult").textContent = "HIT";
    renderReactionMetrics();
    logEvent("样本", `反应 ${Math.round(reaction)} ms`);
    tone(760);
    if (state.reaction.results.length >= REACTION_ROUNDS) {
      finishReaction();
    } else {
      state.reaction.phase = "pause";
      state.reaction.nextTimer = setTimeout(() => startReactionRound(false), 900);
    }
  }

  function renderReactionMetrics() {
    const results = state.reaction.results;
    $("reactionRound").textContent = `${results.length} / ${REACTION_ROUNDS}`;
    $("reactionFalseStarts").textContent = state.reaction.falseStarts;
    if (!results.length) {
      $("reactionAverage").textContent = "—";
      $("reactionBest").textContent = "—";
      $("reactionStability").textContent = "—";
      return;
    }
    const average = mean(results);
    const stability = clamp(100 - standardDeviation(results) / Math.max(average, 1) * 100, 0, 100);
    $("reactionAverage").textContent = `${Math.round(average)} ms`;
    $("reactionBest").textContent = `${Math.round(Math.min(...results))} ms`;
    $("reactionStability").textContent = `${Math.round(stability)}%`;
  }

  function finishReaction() {
    const results = state.reaction.results;
    const average = mean(results);
    const best = Math.min(...results);
    const stability = clamp(100 - standardDeviation(results) / Math.max(average, 1) * 100, 0, 100);
    state.reaction.phase = "done";
    $("reactionStage").dataset.state = "idle";
    $("reactionMessage").textContent = "五轮完成 · 点击可重测";
    $("reactionLiveResult").textContent = `${Math.round(average)} ms`;
    saveRecord("reaction", {
      rounds: results.map((value) => Math.round(value)),
      averageMs: round(average),
      bestMs: round(best),
      stability: round(stability),
      falseStarts: state.reaction.falseStarts
    }, {
      tone: "pass",
      title: "反应力测试完成",
      detail: `五轮平均 ${Math.round(average)} ms，最好 ${Math.round(best)} ms，稳定性 ${Math.round(stability)}%。`
    });
    tone(820, .12);
    logEvent("结论", `平均反应 ${Math.round(average)} ms`);
  }

  function renderGlobalDiagnostics() {
    const intervals = state.globalIntervals;
    const med = median(intervals);
    const rate = med ? Math.round(1000 / med) : 0;
    const rateText = rate ? `≈ ${rate} Hz*` : "≈ 0 Hz*";
    $("diagRate").textContent = rateText;
    $("diagEvents").textContent = state.globalEvents;
    $("liveEventRate").textContent = rateText;
    if (!state.health.active) $("healthLiveRate").textContent = rateText;
    $("diagState").textContent = state.globalEvents ? "正在接收输入" : "等待输入";
  }

  function exportLabData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      disclaimer: "Browser event-chain measurements; not a hardware latency or firmware polling-rate certification.",
      records: state.history

    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mouse-lab-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("鼠标实验室档案已导出。");
    logEvent("导出", `${state.history.length} 条本地记录`);
  }

  function clearLabHistory() {
    if (!confirm("确定清空鼠标实验室记录吗？此操作无法撤销。")) return;
    localStorage.removeItem(STORAGE_KEY);
    state.history = [];
    state.overviewSaved = false;
    renderCompletion();
    setConclusion("", "尚无完整测试", "完成输入链路或角度校准后，结论会保存在本机。");
    showToast("鼠标实验室记录已清空。");
    logEvent("清空", "本地实验室记录已删除", "warn");
  }

  function bindMovementSurface(surface, handler) {
    const supportsRaw = "onpointerrawupdate" in window;
    let lastRawAt = 0;
    if (supportsRaw) {
      surface.addEventListener("pointerrawupdate", (event) => {
        lastRawAt = performance.now();
        handler(event);
      });
      surface.addEventListener("pointermove", (event) => {
        if (performance.now() - lastRawAt > 48) handler(event);
      });
    } else {
      surface.addEventListener("pointermove", handler);
    }
    surface.addEventListener("mouseenter", () => setInputPresence(true));
    surface.addEventListener("mouseleave", () => {
      if (!document.pointerLockElement) setInputPresence(false);
    });
    surface.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function bindEvents() {
    const labTabs = $$(".lab-nav-item");
    labTabs.forEach((button, index) => {
      button.addEventListener("click", () => switchView(button.dataset.labView));
      button.addEventListener("keydown", (event) => {
        const verticalKeys = event.key === "ArrowDown" || event.key === "ArrowUp";
        const horizontalKeys = event.key === "ArrowRight" || event.key === "ArrowLeft";
        if (!verticalKeys && !horizontalKeys && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = labTabs.length - 1;
        else if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (index + 1) % labTabs.length;
        else nextIndex = (index - 1 + labTabs.length) % labTabs.length;
        const nextTab = labTabs[nextIndex];
        switchView(nextTab.dataset.labView);
        nextTab.focus();
      });
    });
    $("labSoundToggle").addEventListener("click", () => {
      state.sound = !state.sound;
      $("labSoundToggle").textContent = state.sound ? "🔊" : "🔇";
      $("labSoundToggle").setAttribute("aria-pressed", String(state.sound));
      $("labSoundToggle").setAttribute("aria-label", state.sound ? "关闭声音" : "打开声音");
      if (state.sound) tone(650);
    });
    const overviewCaptureArea = $("overviewCaptureArea");
    bindMovementSurface(overviewCaptureArea, handleOverviewMove);
    overviewCaptureArea.addEventListener("mousedown", handleOverviewButton);
    overviewCaptureArea.addEventListener("mouseup", (event) => {
      if (event.button > 0) event.preventDefault();
    });
    overviewCaptureArea.addEventListener("auxclick", (event) => event.preventDefault());
    overviewCaptureArea.addEventListener("wheel", handleOverviewWheel, { passive: false });
    $("resetOverviewBtn").addEventListener("click", resetOverview);
    bindMovementSurface($("healthSurface"), handleHealthMove);
    $("startHealthBtn").addEventListener("click", startHealth);
    bindMovementSurface($("angleCanvas"), handleAngleMove);
    $("startAngleBtn").addEventListener("click", startAngleTrial);
    $("finishAngleBtn").addEventListener("click", finishAngleTrial);
    $("resetAngleBtn").addEventListener("click", resetAngle);

    $("cpsStage").addEventListener("click", handleCpsClick);
    $("latencyStage").addEventListener("click", handleLatencySample);
    $("resetLatencyBtn").addEventListener("click", resetLatency);
    $("reactionStage").addEventListener("click", handleReactionClick);
    $("clearEventLogBtn").addEventListener("click", () => {
      state.eventLog = [];
      renderEventLog();
    });
    $("exportLabBtn").addEventListener("click", exportLabData);
    $("clearLabHistoryBtn").addEventListener("click", clearLabHistory);
    document.addEventListener("pointerlockchange", () => {
      const locked = Boolean(document.pointerLockElement);
      $("pointerLockReadout").textContent = locked ? "已锁定" : "未锁定";
      setInputPresence(locked, locked ? "已锁定相对输入" : "");
      $("diagMode").textContent = locked ? "相对移动事件" : "浏览器事件";
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) return;
      if (state.health.active) {
        state.health.active = false;
        cancelAnimationFrame(state.health.raf);
        $("startHealthBtn").disabled = false;
        $("startHealthBtn").textContent = "重新检查";
        $("healthSampleState").textContent = "页面切换导致中止";
        setConclusion("warn", "健康检查已中止", "页面进入后台，本轮数据没有保存，请保持窗口前台后重测。");
        logEvent("中止", "页面切换到后台", "warn");
      }
      });
    window.addEventListener("resize", () => {
      [$("overviewCanvas"), $("healthCanvas"), $("angleCanvas")].forEach((canvas) => clearCanvas(canvas));
    });
  }

  function initEnvironment() {
    const eventName = "onpointerrawupdate" in window ? "pointerrawupdate + pointermove 回退" : "pointermove";
    $("eventApiReadout").textContent = eventName;
    $("secureContextReadout").textContent = window.isSecureContext ? "安全上下文" : location.protocol === "file:" ? "本地文件模式" : "非安全上下文";
    $("pointerLockReadout").textContent = document.pointerLockElement ? "已锁定" : "未锁定";
    $("diagMode").textContent = eventName;
  }

  function init() {
    loadHistory();
    initEnvironment();
    bindEvents();
    renderOverview();
    renderAngleTrials();
    renderReactionMetrics();
    renderEventLog();
    clearCanvas($("overviewCanvas"));
    clearCanvas($("healthCanvas"));
    clearCanvas($("angleCanvas"));
    setInterval(renderGlobalDiagnostics, 250);
    logEvent("系统", "鼠标实验室已就绪");
  }

  init();
})();
