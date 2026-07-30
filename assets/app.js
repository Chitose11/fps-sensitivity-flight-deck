(() => {
      "use strict";

      const STORAGE_KEY = "fps-sens-flightdeck-v2";
      const LEGACY_STORAGE_KEY = "valorant-sens-flightdeck-v1";
      const TEST_DURATION = 25000;
      const AUXILIARY_DURATION = 20000;
      const CAL_DURATION = 8000;
      const FACTOR_SWITCH_DURATION = 2000;
      const FACTORS = [0.65, 0.82, 1, 1.22, 1.5];
      const PITCH_LIMIT = 70;
      const DEG_TO_RAD = Math.PI / 180;
      const LEVER_TOP = 24;
      const LEVER_BOTTOM = 170;
      const GAMES = Object.freeze({
        valorant: Object.freeze({
          id: "valorant", name: "无畏契约", brandName: "《无畏契约》", yaw: 0.07, fov: 103,
          sens: Object.freeze({ min: .01, max: 10, step: .001, digits: 3, default: .32 }),
          sourceNote: "社区常用 yaw 0.07°/count；水平视野常按 103° 模拟"
        }),
        overwatch2: Object.freeze({
          id: "overwatch2", name: "守望先锋 2", brandName: "《守望先锋 2》", yaw: .0066, fov: 103,
          sens: Object.freeze({ min: .01, max: 100, step: .01, digits: 2, default: 5 }),
          sourceNote: "社区常用 yaw 0.0066°/count；水平视野可在游戏中调整"
        }),
        cs2: Object.freeze({
          id: "cs2", name: "CS2", brandName: "《CS2》", yaw: .022, fov: 90,
          sens: Object.freeze({ min: .1, max: 8, step: .001, digits: 3, default: 1 }),
          sourceNote: "默认 m_yaw 通常为 0.022°/count；本页以 90° 水平视野作视觉模拟"
        }),
        deltaforce: Object.freeze({
          id: "deltaforce", name: "三角洲行动", brandName: "《三角洲行动》", yaw: .022, fov: 100,
          sens: Object.freeze({ min: .01, max: 100, step: .01, digits: 2, default: 5 }),
          sourceNote: "社区换算常按 yaw 0.022°/count；视野可调，本页默认 100°"
        })
      });
      const HID_VENDOR_FILTERS = [
        { vendorId: 0x1532 },
        { vendorId: 0x046d },
        { vendorId: 0x373b },
        { vendorId: 0x3710 }
      ];
      const FACTOR_ORDERS = [
        [2, 0, 4, 1, 3],
        [3, 1, 4, 0, 2],
        [1, 4, 2, 0, 3],
        [2, 3, 0, 4, 1],
        [2, 1, 3, 0, 4]
      ];

      const stageDefs = [
        { id: "wide", name: "大范围转向", description: "固定中央准星，目标在左右大角度交替出现。移动鼠标完成转向，瞄准后左键射击，测量速度、路径效率、命中率与过冲。" },
        { id: "micro", name: "微小目标定位", description: "小目标在中心附近以较小角度出现。瞄准后左键射击，重点测量末端控制、点击误差与稳定性。" },
        { id: "switch", name: "连续目标切换", description: "目标在不同方位角连续出现。逐个瞄准并左键射击，重点测量切换延迟、命中率与方向修正。" },
        { id: "track", name: "平滑追踪", description: "持续旋转虚拟视角跟随移动目标。中央准星进入目标后保持贴合，重点测量平均角度误差与跟随时间。" },
        { id: "desktop", mode: "desktop", name: "桌面微调辅助", description: "最后进行一项独立的二维微调测试。准星随鼠标移动，瞄准后左键射击；该结果只辅助评估控制稳定与置信度，不直接选择游戏灵敏度档位。" }
      ];

      const app = {
        screen: "home",
        gameId: "valorant",
        dpi: 800,
        currentSens: 0.32,
        horizontalFov: 103,
        sound: true,
        audio: null,
        history: [],
        rawInput: false,
        coreRawInput: false,
        inputMode: "raw",
        pointerRequested: false,
        lastClientX: null,
        lastClientY: null,
        lastMoveAt: 0,
        pendingInputX: 0,
        pendingInputY: 0,
        pendingInputPath: 0,
        pendingCalibrationX: 0,
        canvasBounds: Object.create(null),
        inputGapCount: 0,
        pauseCount: 0,
        calibration: null,
        stageIndex: 0,
        stageResults: [],
        test: null,
        currentResult: null,
        converterGameId: "valorant",
        converterSens: .32,
        converterDpi: 800,
        converterInitialized: false,
        launchPreset: null,
        setupPros: {
          players: [],
          filtered: [],
          selected: null,
          targetDpi: 800,
          retrievedAt: null
        },
        hidDevice: null,
        dpiSource: "manual",
        hardwareDpi: null,
        hardwarePollingHz: null,
        measuredPollingSamples: [],
        lastMeasuredMoveAt: 0,
        lastMeasuredRenderAt: 0,
        raf: 0,
        seed: 417
      };

      const $ = (id) => document.getElementById(id);
      const screens = [...document.querySelectorAll(".screen")];
      const gridCache = new WeakMap();

      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

      function round(value, digits = 3) {
        const power = 10 ** digits;
        return Math.round(value * power) / power;
      }

      function currentGame() {
        return GAMES[app.gameId] || GAMES.valorant;
      }

      function applyLaunchParameters() {
        const params = new URLSearchParams(location.search);
        const requestedGame = params.get("game");
        const requestedDpi = Number(params.get("dpi"));
        const requestedSens = Number(params.get("sens"));
        const game = GAMES[requestedGame] || currentGame();
        if (
          !requestedGame ||
          !GAMES[requestedGame] ||
          !Number.isFinite(requestedDpi) ||
          requestedDpi < 100 ||
          requestedDpi > 32000 ||
          !Number.isFinite(requestedSens) ||
          requestedSens < game.sens.min ||
          requestedSens > game.sens.max
        ) {
          return;
        }
        app.gameId = game.id;
        app.dpi = requestedDpi;
        app.currentSens = requestedSens;
        app.horizontalFov = game.fov;
        app.launchPreset = { gameId: game.id, dpi: requestedDpi, sensitivity: requestedSens };
        app.converterGameId = game.id;
        app.converterDpi = requestedDpi;
        app.converterSens = requestedSens;
        app.converterInitialized = true;
        $("dpiInput").value = String(requestedDpi);
        $("sensInput").value = formatSens(requestedSens, game.id);
      }

      function gameIcon(gameId) {
        return document.querySelector(`.game-switch[data-game="${gameId}"] img`)?.src || "";
      }

      function formatSens(value, gameId = app.gameId) {
        const game = GAMES[gameId] || currentGame();
        return Number(value).toFixed(game.sens.digits);
      }

      function edpi(dpi, sens) {
        return dpi * sens;
      }

      function cm360(dpi, sens, yaw = currentGame().yaw) {
        return (360 * 2.54) / (dpi * sens * yaw);
      }

      function sensitivityForCm360(distance, dpi, yaw) {
        return (360 * 2.54) / (dpi * yaw * distance);
      }

      function equivalentSensitivity(sensitivity, fromGame, toGame) {
        return sensitivity * fromGame.yaw / toGame.yaw;
      }

      function candidateSensitivity(baseSensitivity, factor, game = currentGame()) {
        return clamp(baseSensitivity * factor, game.sens.min, game.sens.max);
      }


      function setupProEquivalent(player, targetDpi, game = currentGame()) {
        const valorantSensitivity = player.edpi / targetDpi;
        const rawSensitivity = equivalentSensitivity(valorantSensitivity, GAMES.valorant, game);
        const sensitivity = clamp(rawSensitivity, game.sens.min, game.sens.max);
        return {
          sensitivity,
          cm: cm360(targetDpi, sensitivity, game.yaw),
          rangeLimited: Math.abs(sensitivity - rawSensitivity) / Math.max(.001, rawSensitivity) > .01
        };
      }

      function renderSetupProList() {
        const list = $("setupProList");
        if (!list) return;
        if (!app.setupPros.filtered.length) {
          const empty = document.createElement("div");
          empty.className = "setup-pro-list-state";
          empty.textContent = "没有匹配的选手，请清除筛选或换一个关键词。";
          list.replaceChildren(empty);
          $("setupProListState").textContent = "0 名匹配选手";
          return;
        }
        const rows = app.setupPros.filtered.map((player) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "setup-pro-row";
          button.dataset.setupProIndex = String(player.datasetIndex);
          button.setAttribute("role", "option");
          button.setAttribute("aria-selected", String(app.setupPros.selected?.datasetIndex === player.datasetIndex));
          const identity = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = player.player;
          const team = document.createElement("small");
          team.textContent = player.team;
          identity.append(name, team);
          const dpi = document.createElement("b");
          dpi.textContent = `${player.dpi} DPI`;
          button.append(identity, dpi);
          return button;
        });
        list.replaceChildren(...rows);
        const date = app.setupPros.retrievedAt ? new Date(app.setupPros.retrievedAt).toLocaleDateString("zh-CN") : "日期未知";
        $("setupProListState").textContent = `${app.setupPros.filtered.length} 名匹配 · 已全部载入，可滚动查看 · 快照 ${date}`;
      }

      function filterSetupPros() {
        const query = $("setupProSearch").value.trim().toLocaleLowerCase();
        const dpi = Number($("setupProDpiFilter").value) || null;
        app.setupPros.filtered = app.setupPros.players.filter((player) => {
          const searchable = `${player.player} ${player.team} ${player.mouse}`.toLocaleLowerCase();
          return (!query || searchable.includes(query)) && (!dpi || player.dpi === dpi);
        });
        renderSetupProList();
      }

      function renderSetupProSelection() {
        const player = app.setupPros.selected;
        if (!player || !$("setupProPlayer")) return;
        const targetDpi = clamp(Number(app.setupPros.targetDpi) || player.dpi, 100, 32000);
        app.setupPros.targetDpi = targetDpi;
        $("setupProPlayer").textContent = `${player.player} · ${player.team}`;
        $("setupProMeta").textContent = `${player.mouse} · 来源 ${player.dpi} DPI / ${player.sensitivity} 灵敏度 / ${player.edpi} eDPI`;
        const candidateDpis = [...new Set([400, 800, 1600, 3200, player.dpi, targetDpi])]
          .filter((dpi) => dpi >= 100 && dpi <= 32000)
          .sort((a, b) => a - b);
        $("setupProDpiChoices").replaceChildren(...candidateDpis.map((dpi) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "setup-pro-dpi-chip";
          button.dataset.setupProDpi = String(dpi);
          button.setAttribute("aria-pressed", String(dpi === targetDpi));
          button.textContent = `${dpi} DPI`;
          return button;
        }));
        const game = currentGame();
        const preview = setupProEquivalent(player, targetDpi, game);
        $("setupProTargetDpi").textContent = String(targetDpi);
        $("setupProSensLabel").textContent = `${game.name} 灵敏度`;
        $("setupProTargetSens").textContent = `${formatSens(preview.sensitivity, game.id)}${preview.rangeLimited ? "*" : ""}`;
        $("setupProTargetCm").textContent = `${preview.cm.toFixed(1)} cm`;
        $("applySetupProBtn").disabled = false;
        $("setupProList")?.querySelectorAll("[data-setup-pro-index]").forEach((row) => {
          row.setAttribute("aria-selected", String(Number(row.dataset.setupProIndex) === player.datasetIndex));
        });
      }

      function selectSetupPro(datasetIndex) {
        const player = app.setupPros.players.find((entry) => entry.datasetIndex === datasetIndex);
        if (!player) return;
        app.setupPros.selected = player;
        app.setupPros.targetDpi = player.dpi;
        renderSetupProSelection();
      }

      function applySetupProChoice() {
        const player = app.setupPros.selected;
        if (!player) return;
        const targetDpi = app.setupPros.targetDpi;
        const game = currentGame();
        const preview = setupProEquivalent(player, targetDpi, game);
        $("dpiInput").value = String(targetDpi);
        $("sensInput").value = formatSens(preview.sensitivity, game.id);
        app.dpi = targetDpi;
        app.currentSens = preview.sensitivity;
        app.dpiSource = "prosettings";
        tone(690, .06, .035);
        showToast(`已采用 ${player.player} 的转身距离起点：${targetDpi} DPI，${game.name} ${formatSens(preview.sensitivity, game.id)}。仍需完成个人测试。`);
      }

      function initializeSetupProSelector() {
        const snapshot = window.VALORANT_PRO_SNAPSHOT;
        if (!snapshot || !Array.isArray(snapshot.players) || !snapshot.players.length) {
          $("setupProList").innerHTML = '<div class="setup-pro-list-state">职业选手快照未载入，请手动填写 DPI；其余校准功能不受影响。</div>';
          $("setupProListState").textContent = "数据不可用";
          $("setupProSearch").disabled = true;
          $("setupProDpiFilter").disabled = true;
          return;
        }
        app.setupPros.players = snapshot.players.map((player, datasetIndex) => ({ ...player, datasetIndex }));
        app.setupPros.retrievedAt = snapshot.retrievedAt;
        const counts = new Map();
        app.setupPros.players.forEach((player) => counts.set(player.dpi, (counts.get(player.dpi) || 0) + 1));
        const filter = $("setupProDpiFilter");
        const allOption = document.createElement("option");
        allOption.value = "";
        allOption.textContent = "全部";
        const options = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([dpi, count]) => {
          const option = document.createElement("option");
          option.value = String(dpi);
          option.textContent = `${dpi} (${count})`;
          return option;
        });
        filter.replaceChildren(allOption, ...options);
        app.setupPros.filtered = [...app.setupPros.players];
        app.setupPros.selected = app.setupPros.players[0];
        app.setupPros.targetDpi = app.setupPros.selected.dpi;
        renderSetupProList();
        renderSetupProSelection();
      }
      function evidenceItems(result) {
        const hasNumber = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
        return [
          ["射击", hasNumber(result.shots) ? `${result.hits || 0} / ${result.shots}` : "—"],
          ["空枪", hasNumber(result.misses) ? result.misses : "—"],
          ["命中率", hasNumber(result.accuracy) ? `${Math.round(result.accuracy * 100)}%` : "—"],
          ["平均反应", hasNumber(result.avgReaction) ? `${Math.round(result.avgReaction)} ms` : "—"],
          ["点击偏差", hasNumber(result.avgClickError) ? `${Math.round(result.avgClickError * 100)}%` : "—"],
          ["路径效率", hasNumber(result.pathEfficiency) ? `${Math.round(result.pathEfficiency * 100)}%` : "—"],
          ["过冲", hasNumber(result.overshoots) ? result.overshoots : "—"],
          ["控制稳定", hasNumber(result.control) ? `${Math.round(result.control)}%` : "—"]
        ];
      }

      function renderEvidenceGrid(container, result) {
        container.replaceChildren(...evidenceItems(result).map(([label, value]) => {
          const item = document.createElement("div");
          item.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
          return item;
        }));
      }

      function conversionValues(sensitivity, fromGame, dpi) {
        return Object.values(GAMES).map((game) => {
          const rawSensitivity = equivalentSensitivity(sensitivity, fromGame, game);
          const convertedSensitivity = clamp(rawSensitivity, game.sens.min, game.sens.max);
          const convertedCm360 = cm360(dpi, convertedSensitivity, game.yaw);
          return {
            game,
            sensitivity: convertedSensitivity,
            cm360: convertedCm360,
            rangeLimited: Math.abs(convertedSensitivity - rawSensitivity) / Math.max(.001, rawSensitivity) > .01
          };
        });
      }

      function renderCompactConversions(container, result) {
        const fromGame = GAMES[result.gameId] || GAMES.valorant;
        container.replaceChildren(...conversionValues(result.mainSens, fromGame, result.dpi).map((entry) => {
          const row = document.createElement("li");
          row.className = `compact-conversion-row${entry.game.id === fromGame.id ? " current" : ""}`;
          row.innerHTML = `
            <img src="${gameIcon(entry.game.id)}" alt="">
            <strong>${entry.game.name}</strong>
            <strong>${formatSens(entry.sensitivity, entry.game.id)}</strong>
            <span>${entry.cm360.toFixed(1)} cm</span>`;
          return row;
        }));
      }

      function initializeConverter() {
        if (app.converterInitialized) return;
        const latest = app.history[0];
        const sourceGame = latest ? (GAMES[latest.gameId] || currentGame()) : currentGame();
        app.converterGameId = sourceGame.id;
        app.converterSens = latest?.mainSens || app.currentSens || sourceGame.sens.default;
        app.converterDpi = latest?.dpi || app.dpi || 800;
        app.converterInitialized = true;
      }

      function renderConverter() {
        initializeConverter();
        const sourceGame = GAMES[app.converterGameId] || GAMES.valorant;
        const picker = $("converterGamePicker");
        picker.replaceChildren(...Object.values(GAMES).map((game) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "converter-game-button";
          button.dataset.converterGame = game.id;
          button.setAttribute("role", "radio");
          button.setAttribute("aria-checked", String(game.id === sourceGame.id));
          button.innerHTML = `<img src="${gameIcon(game.id)}" alt=""><span>${game.name}</span>`;
          return button;
        }));

        const sensitivityInput = $("converterSensInput");
        sensitivityInput.min = sourceGame.sens.min;
        sensitivityInput.max = sourceGame.sens.max;
        sensitivityInput.step = sourceGame.sens.step;
        sensitivityInput.value = formatSens(clamp(app.converterSens, sourceGame.sens.min, sourceGame.sens.max), sourceGame.id);
        $("converterDpiInput").value = String(app.converterDpi);
        renderConverterOutputs();
      }

      function renderConverterOutputs() {
        const sourceGame = GAMES[app.converterGameId] || GAMES.valorant;
        const output = $("converterOutputList");
        const validSensitivity = Number(app.converterSens);
        const validDpi = Number(app.converterDpi);
        if (!Number.isFinite(validSensitivity) || validSensitivity <= 0 || !Number.isFinite(validDpi) || validDpi < 100) {
          output.innerHTML = `<div class="notice">请输入有效的来源灵敏度和 DPI 后再换算。</div>`;
          return;
        }
        output.replaceChildren(...conversionValues(validSensitivity, sourceGame, validDpi).map((entry) => {
          const row = document.createElement("div");
          row.className = "converter-output";
          const formatted = formatSens(entry.sensitivity, entry.game.id);
          row.innerHTML = `
            <img src="${gameIcon(entry.game.id)}" alt="">
            <span>${entry.game.name}</span>
            <strong>${formatted}</strong>
            <small>${entry.cm360.toFixed(1)} cm/360°${entry.rangeLimited ? " · 范围限制" : ""}</small>
            <button class="copy-value-btn" type="button" data-copy-value="${formatted}" aria-label="复制 ${entry.game.name} 灵敏度 ${formatted}">复制</button>`;
          return row;
        }));
      }

      function setConverterGame(nextGameId) {
        const fromGame = GAMES[app.converterGameId] || GAMES.valorant;
        const toGame = GAMES[nextGameId];
        if (!toGame || toGame.id === fromGame.id) return;
        app.converterSens = clamp(equivalentSensitivity(Number(app.converterSens) || fromGame.sens.default, fromGame, toGame), toGame.sens.min, toGame.sens.max);
        app.converterGameId = toGame.id;
        renderConverter();
      }

      async function copyConverterValue(value) {
        try {
          await navigator.clipboard.writeText(value);
          showToast(`已复制灵敏度 ${value}。`);
        } catch {
          const input = $("converterSensInput");
          input.value = value;
          input.select();
          showToast("浏览器未允许直接复制，数值已放入来源输入框并选中。");
        }
      }

      function mulberry32(seed) {
        return function() {
          let t = seed += 0x6D2B79F5;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }

      function showToast(message) {
        const toast = $("toast");
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
      }

      function setInputStatus(mode, state = "live") {
        $("inputModeText").textContent = mode;
        $("inputLamp").className = `lamp ${state}`;
      }

      function updateGameUi() {
        const game = currentGame();
        document.querySelectorAll(".game-switch").forEach((button) => {
          const selected = button.dataset.game === game.id;
          button.setAttribute("aria-checked", String(selected));
        });
        $("brandGameName").textContent = `${game.brandName} · `;
        $("setupGameName").textContent = game.name;
        $("setupGameIcon").src = gameIcon(game.id);
        $("setupGameIcon").alt = `${game.name} 图标`;
        $("sensInput").min = String(game.sens.min);
        $("sensInput").max = String(game.sens.max);
        $("sensInput").step = String(game.sens.step);
        $("sensHint").textContent = `${game.name} 本页采用 ${game.sens.min}–${game.sens.max} 输入范围，显示精度 ${game.sens.step}；最终以当前游戏客户端实际接受值为准。`;
        $("fovInput").value = String(app.horizontalFov);

        document.title = `${game.name} · 灵敏度夜航校准台`;
        renderSetupProSelection();
      }

      function switchGame(nextGameId) {
        if (!GAMES[nextGameId] || nextGameId === app.gameId) return;
        if (!["home", "setup"].includes(app.screen)) {
          showToast("请先返回首页，再切换目标游戏。");
          return;
        }
        const from = currentGame();
        const to = GAMES[nextGameId];
        const dpi = clamp(Number($("dpiInput").value) || app.dpi || 800, 100, 32000);
        const currentValue = Number($("sensInput").value);
        const sourceSensitivity = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : app.currentSens;
        const beforeCm = cm360(dpi, sourceSensitivity, from.yaw);
        const converted = clamp(equivalentSensitivity(sourceSensitivity, from, to), to.sens.min, to.sens.max);
        app.gameId = nextGameId;
        app.horizontalFov = to.fov;
        app.currentSens = converted;
        $("sensInput").value = formatSens(converted, to.id);
        updateGameUi();
        renderHome();
        tone(620, .045, .028);
        const afterCm = cm360(dpi, Number($("sensInput").value), to.yaw);
        const clampedNote = Math.abs(afterCm - beforeCm) / beforeCm > .01 ? "；已受目标游戏输入范围限制" : "";
        showToast(`${from.name} → ${to.name}：已换算为 ${formatSens(converted, to.id)}，保持约 ${beforeCm.toFixed(1)} cm/360°${clampedNote}。视野与缩放体感仍可能不同。`);
      }

      function hexId(value) {
        return `0x${Number(value || 0).toString(16).padStart(4, "0").toUpperCase()}`;
      }

      function describeHidDevice(device) {
        const vid = Number(device?.vendorId);
        const pid = Number(device?.productId);
        let brand = "未知厂商";
        let candidate = false;
        let readerKind = "";
        if (vid === 0x1532) {
          brand = "Razer";
          candidate = true;
          readerKind = "razer";
        } else if (vid === 0x046d) {
          brand = "Logitech";
          candidate = true;
          readerKind = "logitech";
        } else if (vid === 0x373b || vid === 0x3710) {
          brand = "ATK";
          candidate = true;
          readerKind = "atk";
        }
        return {
          brand,
          candidate,
          readerKind,
          name: device?.productName || "未提供产品名称",
          key: `${vid}:${pid}`,
          ids: `VID ${hexId(vid)} · PID ${hexId(pid)}`
        };
      }

      function setHidAssist(status, state = "", meta = "") {
        $("hidStatus").textContent = status;
        $("hidLamp").className = `lamp ${state}`;
        $("hidDeviceMeta").textContent = meta;
        $("hidDeviceMeta").hidden = !meta;
      }

      function updateHardwareReadouts({ dpi = app.hardwareDpi, pollingHz = app.hardwarePollingHz } = {}) {
        app.hardwareDpi = Number.isFinite(Number(dpi)) ? Number(dpi) : null;
        app.hardwarePollingHz = Number.isFinite(Number(pollingHz)) ? Number(pollingHz) : null;
        $("hidDpiReadout").textContent = app.hardwareDpi ? `${app.hardwareDpi}` : "—";
        $("hidPollingReadout").textContent = app.hardwarePollingHz ? `${app.hardwarePollingHz} Hz` : "—";
      }

      function canUseWebHid() {
        return location.protocol !== "file:" && window.isSecureContext && Boolean(navigator.hid);
      }

      function dataViewBytes(data) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }

      function withTimeout(ms, executor) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("等待设备只读响应超时")), ms);
          executor(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
          );
        });
      }

      async function hidppRequest(device, deviceIndex, featureIndex, functionId, params = [0, 0, 0]) {
        const softwareId = 0x01;
        const fnSw = ((functionId & 0x0f) << 4) | softwareId;
        const response = withTimeout(420, (resolve) => {
          const handler = (event) => {
            if (event.device !== device || ![0x10, 0x11].includes(event.reportId)) return;
            const bytes = dataViewBytes(event.data);
            if (bytes[0] !== deviceIndex || bytes[1] !== featureIndex || bytes[2] !== fnSw) return;
            device.removeEventListener("inputreport", handler);
            resolve(bytes);
          };
          device.addEventListener("inputreport", handler);
          setTimeout(() => device.removeEventListener("inputreport", handler), 450);
        });
        response.catch(() => {});
        await device.sendReport(0x10, Uint8Array.from([
          deviceIndex, featureIndex, fnSw,
          params[0] || 0, params[1] || 0, params[2] || 0
        ]));
        return response;
      }

      async function hidppFeatureIndex(device, deviceIndex, featureId) {
        const response = await hidppRequest(device, deviceIndex, 0x00, 0x00, [
          (featureId >> 8) & 0xff, featureId & 0xff, 0
        ]);
        const index = response[3];
        return index && index !== 0xff ? index : null;
      }

      async function readLogitechConfig(device) {
        const candidateIndices = device.productId === 0xc539 ? [1, 2, 3, 4, 5, 6] : [0xff, 1, 2, 3, 4, 5, 6];
        for (const deviceIndex of candidateIndices) {
          try {
            const dpiFeature = await hidppFeatureIndex(device, deviceIndex, 0x2201);
            if (!dpiFeature) continue;
            const dpiResponse = await hidppRequest(device, deviceIndex, dpiFeature, 0x02, [0, 0, 0]);
            const dpi = (dpiResponse[4] << 8) | dpiResponse[5];
            let pollingHz = null;
            try {
              const reportRateFeature = await hidppFeatureIndex(device, deviceIndex, 0x8060);
              if (reportRateFeature) {
                const pollingResponse = await hidppRequest(device, deviceIndex, reportRateFeature, 0x01, [0, 0, 0]);
                const intervalMs = pollingResponse[3];
                if (intervalMs >= 1 && intervalMs <= 8) pollingHz = Math.round(1000 / intervalMs);
              }
            } catch { /* DPI remains usable when report-rate feature is absent. */ }
            if (dpi >= 50 && dpi <= 60000) return { dpi, pollingHz, protocol: `HID++ 2.0 / device ${deviceIndex}` };
          } catch { /* Receiver slots and unsupported interfaces are expected. */ }
        }
        throw new Error("当前 Logitech 接口未暴露可读 HID++ 2.0 配置报告");
      }

      function atkChecksum(frame) {
        let sum = 0;
        for (let index = 0; index < 15; index += 1) sum += frame[index] || 0;
        return (0x4d - (sum & 0xff)) & 0xff;
      }

      function atkReadFrame(address, length) {
        const frame = new Uint8Array(16);
        frame[0] = 0x08;
        frame[2] = (address >> 8) & 0xff;
        frame[3] = address & 0xff;
        frame[4] = length;
        frame[15] = atkChecksum(frame);
        return frame;
      }

      async function atkReadRegister(device, address, length) {
        const response = withTimeout(520, (resolve) => {
          const handler = (event) => {
            if (event.device !== device || event.reportId !== 0x08) return;
            const bytes = dataViewBytes(event.data);
            if (![0x07, 0x08].includes(bytes[0]) || bytes[2] !== ((address >> 8) & 0xff) || bytes[3] !== (address & 0xff)) return;
            device.removeEventListener("inputreport", handler);
            resolve(bytes);
          };
          device.addEventListener("inputreport", handler);
          setTimeout(() => device.removeEventListener("inputreport", handler), 550);
        });
        response.catch(() => {});
        await device.sendReport(0x08, atkReadFrame(address, length));
        const frame = await response;
        if (frame.length !== 16 || frame[15] !== atkChecksum(frame)) throw new Error("ATK 配置响应校验失败");
        return frame.slice(5, 5 + frame[4]);
      }

      function decodeAtkDpiAxis(byte, nibble) {
        const mode = nibble & 0x0f;
        const high = (mode >> 2) & 0x03;
        const stepped50 = (mode & 0x02) !== 0;
        const doubled = (mode & 0x01) !== 0;
        const value = (high << 8) | byte;
        const base = stepped50 ? 10050 + value * 50 : (value + 1) * 10;
        return doubled ? base * 2 : base;
      }

      async function readAtkConfig(device) {
        const vendorCollection = (device.collections || []).some((collection) =>
          collection.usagePage === 0xff02 && collection.usage === 0x0002
        );
        if (!vendorCollection) throw new Error("此 ATK 设备未暴露 ClickSync 所需的 0xFF02 厂商集合");
        const system = await atkReadRegister(device, 0x0000, 6);
        const rateMap = { 0x08: 125, 0x04: 250, 0x02: 500, 0x01: 1000, 0x10: 2000, 0x20: 4000, 0x40: 8000 };
        const slotCount = clamp(system[2] || 1, 1, 6);
        const currentIndex = clamp(system[4] || 0, 0, slotCount - 1);
        const dpiWord = await atkReadRegister(device, 0x000c + currentIndex * 4, 4);
        if (((dpiWord[0] + dpiWord[1] + dpiWord[2] + dpiWord[3]) & 0xff) !== 0x55) {
          throw new Error("ATK 当前 DPI 档校验失败");
        }
        const dpi = decodeAtkDpiAxis(dpiWord[0], dpiWord[2] & 0x0f);
        return { dpi, pollingHz: rateMap[system[0]] || null, protocol: "ClickSync ATK 只读寄存器" };
      }

      async function tryReadHardwareConfig(device, descriptor) {
        if (descriptor.readerKind === "logitech") return readLogitechConfig(device);
        if (descriptor.readerKind === "atk") return readAtkConfig(device);
        if (descriptor.readerKind === "razer") {
          throw new Error("Razer 配置命令随型号变化，纯网页不发送未经实机验证的厂商控制报文");
        }
        return null;
      }

      async function useHidDevice(device, { silent = false } = {}) {
        if (!device) return;
        const descriptor = describeHidDevice(device);
        app.hidDevice = device;
        updateHardwareReadouts({ dpi: null, pollingHz: null });
        setHidAssist(
          descriptor.candidate
            ? `已识别 ${descriptor.brand} 设备，正在以只读方式检查 DPI 与回报率配置。`
            : "设备已授权，但不在当前验证范围内；请继续手动填写 DPI。",
          descriptor.candidate ? "live" : "warn",
          `${descriptor.brand} · ${descriptor.name} · ${descriptor.ids}`
        );
        if (!descriptor.candidate) return;

        try {
          if (!device.opened) await device.open();
          const config = await tryReadHardwareConfig(device, descriptor);
          if (config?.dpi) {
            $("dpiInput").value = String(config.dpi);
            app.dpiSource = "webhid";
            updateHardwareReadouts(config);
            setHidAssist(
              `已只读获取配置并自动填入 DPI。开始测试前仍可手动修改；不会写入鼠标。`,
              "live",
              `${descriptor.brand} · ${descriptor.name} · ${descriptor.ids} · ${config.protocol}`
            );
            if (!silent) {
              completeTone();
              showToast(`已读取 ${config.dpi} DPI${config.pollingHz ? ` / ${config.pollingHz} Hz` : ""}。`);
            }
            return;
          }
          setHidAssist(
            "型号已识别，但没有返回可验证的配置数据；已安全回退到手动 DPI 与浏览器事件率。",
            "warn",
            `${descriptor.brand} · ${descriptor.name} · ${descriptor.ids}`
          );
          if (!silent) showToast("鼠标已识别；此型号暂时需要手动填写 DPI。");
        } catch (error) {
          const razerFallback = descriptor.readerKind === "razer";
          setHidAssist(
            razerFallback
              ? "已识别 Razer。当前网页不发送型号相关的厂商控制报文；DPI 请手动填写，回报率显示浏览器事件实测。"
              : `设备已连接，但固件配置读取未完成：${error?.message || "协议不匹配"}。`,
            "warn",
            `${descriptor.brand} · ${descriptor.name} · ${descriptor.ids}`
          );
          if (!silent) showToast(razerFallback ? "Razer 已识别；当前使用安全回退。" : (error?.message || "无法读取该鼠标配置。"));
        }
      }

      async function connectHidMouse() {
        if (!canUseWebHid()) {
          showToast("WebHID 需要 Chrome/Edge，并通过 HTTPS 或 localhost 打开。");
          return;
        }
        const button = $("connectMouseBtn");
        button.disabled = true;
        button.textContent = "等待浏览器授权…";
        try {
          const devices = await navigator.hid.requestDevice({ filters: HID_VENDOR_FILTERS });
          if (!devices.length) {
            setHidAssist("未选择设备；可继续手动填写 DPI。", "warn");
            return;
          }
          await useHidDevice(devices[0]);
        } catch (error) {
          const cancelled = error?.name === "NotFoundError";
          setHidAssist(
            cancelled ? "未授权设备；可继续手动填写 DPI。" : "连接失败；手动填写路径仍可正常使用。",
            "warn"
          );
          showToast(cancelled ? "已取消鼠标授权。" : "WebHID 连接失败，请检查浏览器与设备权限。");
        } finally {
          button.disabled = false;
          button.textContent = "只读连接鼠标配置";
        }
      }

      async function initHidAssist() {
        const button = $("connectMouseBtn");
        if (!canUseWebHid()) {
          button.disabled = true;
          setHidAssist(
            "当前打开方式不支持 WebHID；请手动填写 DPI。需要自动识别时可用 Chrome/Edge 通过 HTTPS 或 localhost 打开。",
            "warn"
          );
          return;
        }
        setHidAssist("WebHID 可用。连接为可选操作，浏览器会先请求你的明确授权。", "live");
        try {
          const authorized = await navigator.hid.getDevices();
          const known = authorized.find((device) => HID_VENDOR_FILTERS.some((filter) => filter.vendorId === device.vendorId));
          if (known) await useHidDevice(known, { silent: true });
        } catch {
          setHidAssist("WebHID 可用，但无法复用已授权设备；可点击按钮重新选择。", "warn");
        }
        navigator.hid.addEventListener("disconnect", (event) => {
          if (event.device !== app.hidDevice) return;
          app.hidDevice = null;
          app.dpiSource = "manual";
          updateHardwareReadouts({ dpi: null, pollingHz: null });
          setHidAssist("鼠标已断开；当前 DPI 输入值会保留并按手动值使用。", "warn");
        });
      }

      function showScreen(name) {
        app.screen = name;
        document.querySelectorAll(".game-switch").forEach((button) => {
          const locked = !["home", "setup"].includes(name);
          button.setAttribute("aria-disabled", String(locked));
        });
        document.documentElement.classList.toggle("test-active", name === "test");
        document.body.classList.toggle("test-active", name === "test");
        screens.forEach((screen) => screen.classList.toggle("active", screen.id === `screen-${name}`));
        if (name === "test") {
          delete app.canvasBounds.aimCanvas;
          gridCache.delete($("aimCanvas"));
        } else if (name === "calibration") {
          delete app.canvasBounds.calibrationCanvas;
          gridCache.delete($("calibrationCanvas"));
        }
        window.scrollTo({ top: 0, behavior: name === "test" ? "auto" : "smooth" });
      }

      function loadHistory() {
        try {
          const currentRaw = localStorage.getItem(STORAGE_KEY);
          const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
          const parsed = JSON.parse(currentRaw || legacyRaw || '{"version":2,"sessions":[]}');
          app.history = Array.isArray(parsed.sessions)
            ? parsed.sessions.slice(0, 50).map((session) => ({
                gameId: "valorant",
                gameName: "无畏契约",
                yaw: GAMES.valorant.yaw,
                horizontalFov: GAMES.valorant.fov,
                ...session
              }))
            : [];
          if (!currentRaw && legacyRaw) persistHistory();
        } catch {
          app.history = [];
          showToast("本地历史读取失败，已使用空记录继续。");
        }
      }

      function persistHistory() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, sessions: app.history.slice(0, 50) }));
          return true;
        } catch {
          showToast("无法写入本地存储；可能是隐私模式或空间不足。");
          return false;
        }
      }

      function createGauge({ label, value, unit, percent = 50 }) {
        const gauge = document.createElement("div");
        gauge.className = "gauge";
        gauge.style.setProperty("--value", clamp(percent, 0, 100));
        gauge.innerHTML = `
          <div class="gauge-needle" aria-hidden="true"></div>
          <div class="gauge-data">
            <span class="gauge-label">${label}</span>
            <strong class="gauge-value">${value}</strong>
            <span class="gauge-unit">${unit || "&nbsp;"}</span>
          </div>`;
        return gauge;
      }

      function gaugeData(result) {
        if (!result) {
          return [
            { label: "推荐灵敏度", value: "—", unit: "SENSITIVITY", percent: 50 },
            { label: "有效 DPI", value: "—", unit: "eDPI", percent: 50 },
            { label: "视角距离", value: "—", unit: "cm / 360°", percent: 50 },
            { label: "反应速度", value: "—", unit: "SPEED", percent: 50 },
            { label: "控制稳定", value: "—", unit: "CONTROL", percent: 50 },
            { label: "结果置信", value: "—", unit: "CONFIDENCE", percent: 50 }
          ];
        }
        return [
          { label: "推荐灵敏度", value: formatSens(result.mainSens, result.gameId), unit: "SENSITIVITY", percent: clamp(result.mainSens / Math.max((result.baseSens || app.currentSens) * 1.3, .01) * 70, 8, 92) },
          { label: "有效 DPI", value: Math.round(result.edpi), unit: "eDPI", percent: clamp(result.edpi / 800 * 100, 5, 95) },
          { label: "视角距离", value: result.cm360.toFixed(1), unit: "cm / 360°", percent: clamp(100 - result.cm360 / 80 * 100, 6, 94) },
          { label: "反应速度", value: `${Math.round(result.speed)}%`, unit: "SPEED", percent: result.speed },
          { label: "控制稳定", value: `${Math.round(result.control)}%`, unit: "CONTROL", percent: result.control },
          { label: "结果置信", value: `${Math.round(result.confidence * 100)}%`, unit: "CONFIDENCE", percent: result.confidence * 100 }
        ];
      }

      function renderGaugeSet(container, result) {
        container.replaceChildren(...gaugeData(result).map(createGauge));
      }

      function renderHome() {
        const latest = app.history.find((session) => session.gameId === app.gameId) || null;
        $("homeResultLamp").className = latest ? "lamp live" : "lamp";
        $("homeResultState").textContent = latest ? `${currentGame().name} · 已载入` : `${currentGame().name} · 尚无记录`;
        $("homeResultEmpty").hidden = Boolean(latest);
        $("homeResultContent").hidden = !latest;
        if (latest) {
          const game = GAMES[latest.gameId] || GAMES.valorant;
          const main = Number.isFinite(Number(latest.mainSens)) ? Number(latest.mainSens) : game.sens.default;
          const dpi = Number.isFinite(Number(latest.dpi)) ? Number(latest.dpi) : app.dpi;
          const distance = Number.isFinite(Number(latest.cm360)) ? Number(latest.cm360) : cm360(dpi, main, game.yaw);
          const effectiveDpi = Number.isFinite(Number(latest.edpi)) ? Number(latest.edpi) : edpi(dpi, main);
          const confidence = Number.isFinite(Number(latest.confidence)) ? Number(latest.confidence) : null;
          const low = Number.isFinite(Number(latest.lowSens)) ? Number(latest.lowSens) : clamp(main * .93, game.sens.min, game.sens.max);
          const high = Number.isFinite(Number(latest.highSens)) ? Number(latest.highSens) : clamp(main * 1.07, game.sens.min, game.sens.max);
          $("homePrimarySens").textContent = formatSens(main, game.id);
          $("homePrimaryUnit").textContent = `${game.name} 游戏内灵敏度`;
          $("homeCm360").textContent = `${distance.toFixed(1)} cm`;
          $("homeEdpi").textContent = Math.round(effectiveDpi);
          $("homeAccuracy").textContent = Number.isFinite(Number(latest.accuracy)) ? `${Math.round(Number(latest.accuracy) * 100)}%` : "—";
          $("homeConfidence").textContent = confidence === null ? "—" : `${Math.round(confidence * 100)}%`;
          $("homeLowSens").textContent = formatSens(low, game.id);
          $("homeMainSens").textContent = formatSens(main, game.id);
          $("homeHighSens").textContent = formatSens(high, game.id);
          renderCompactConversions($("homeConversionList"), { ...latest, mainSens: main, dpi });
          renderEvidenceGrid($("homeEvidenceGrid"), latest);
        }
        renderConverter();
        renderHistory();
      }

      function renderHistory() {
        const list = $("historyList");
        list.replaceChildren();
        if (!app.history.length) {
          const empty = document.createElement("li");
          empty.className = "empty-log";
          empty.innerHTML = "<div><strong>飞行日志为空</strong>完成第一次完整测试后，推荐灵敏度与分项结果会保存在这里。</div>";
          list.append(empty);
          return;
        }

        app.history.forEach((session, index) => {
          const sessionGame = GAMES[session.gameId] || GAMES.valorant;
          const row = document.createElement("li");
          row.className = `history-row${session.gameId === app.gameId && index === app.history.findIndex((item) => item.gameId === app.gameId) ? " current" : ""}`;
          const date = new Date(session.timestamp);
          row.innerHTML = `
            <img class="history-game-icon" src="${gameIcon(sessionGame.id)}" alt="${sessionGame.name}">
            <div class="history-date">${date.toLocaleDateString("zh-CN")}<br>${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
            <div class="history-main">
              <strong>${formatSens(session.mainSens, sessionGame.id)}</strong><span>${sessionGame.name}</span>
              <strong>${Math.round(session.edpi)}</strong><span>eDPI</span>
              <strong>${session.cm360.toFixed(1)}</strong><span>cm/360°</span>
              <strong>${Math.round(session.confidence * 100)}%</strong><span>置信度</span>
            </div>
            <span class="lamp ${session.confidence >= .65 ? "live" : "warn"}" aria-label="${session.confidence >= .65 ? "置信度良好" : "置信度较低"}"></span>`;
          list.append(row);
        });
      }

      async function ensureAudio() {
        if (!app.sound) return;
        if (!app.audio) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          app.audio = new AudioContext();
        }
        if (app.audio.state === "suspended") {
          try { await app.audio.resume(); } catch { /* Visual feedback remains available. */ }
        }
      }

      function tone(frequency = 880, duration = .04, volume = .045, delay = 0) {
        if (!app.sound || !app.audio || app.audio.state !== "running") return;
        const at = app.audio.currentTime + delay;
        const oscillator = app.audio.createOscillator();
        const gain = app.audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(volume, at + .005);
        gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        oscillator.connect(gain).connect(app.audio.destination);
        oscillator.start(at);
        oscillator.stop(at + duration + .02);
      }

      function hitTone() { tone(880, .035, .035); }
      function cautionTone() { tone(190, .09, .04); }
      function completeTone() {
        tone(660, .08, .04);
        tone(990, .12, .04, .09);
      }

      async function requestRelativeInput(element, requestedMode = app.inputMode) {
        app.pointerRequested = false;
        app.rawInput = false;
        if (!element.requestPointerLock) {
          setInputStatus("兼容移动模式", "warn");
          return false;
        }
        if (requestedMode === "desktop") {
          try {
            app.pointerRequested = true;
            const maybePromise = element.requestPointerLock();
            if (maybePromise?.then) await maybePromise;
            setInputStatus("系统处理输入", "live");
            return true;
          } catch {
            setInputStatus("兼容移动模式", "warn");
            return false;
          }
        }
        try {
          app.pointerRequested = true;
          const maybePromise = element.requestPointerLock({ unadjustedMovement: true });
          if (maybePromise?.then) await maybePromise;
          app.rawInput = true;
          setInputStatus("无系统加速输入", "live");
          return true;
        } catch {
          try {
            const maybePromise = element.requestPointerLock();
            if (maybePromise?.then) await maybePromise;
            setInputStatus("系统处理输入（已降级）", "warn");
            return true;
          } catch {
            setInputStatus("兼容移动模式", "warn");
            return false;
          }
        }
      }

      function sizeCanvas(canvas) {
        const bounds = getCanvasBounds(canvas.id, true);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(bounds.width * dpr));
        const height = Math.max(1, Math.round(bounds.height * dpr));
        let resized = false;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          gridCache.delete(canvas);
          resized = true;
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, width: bounds.width, height: bounds.height, dpr, resized };
      }

      function getCanvasBounds(id, refresh = false) {
        const canvas = $(id);
        const cached = app.canvasBounds[id];
        if (!refresh && cached?.width > 0 && cached?.height > 0) return cached;
        const width = canvas.clientWidth || canvas.getBoundingClientRect().width || 1;
        const height = canvas.clientHeight || canvas.getBoundingClientRect().height || 1;
        const bounds = { width, height };
        app.canvasBounds[id] = bounds;
        return bounds;
      }

      function drawPanelGrid(ctx, width, height, canvas, dpr) {
        let cached = gridCache.get(canvas);
        if (!cached || cached.width !== width || cached.height !== height || cached.dpr !== dpr) {
          const layer = document.createElement("canvas");
          layer.width = Math.max(1, Math.round(width * dpr));
          layer.height = Math.max(1, Math.round(height * dpr));
          const layerCtx = layer.getContext("2d");
          layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          layerCtx.fillStyle = "#050706";
          layerCtx.fillRect(0, 0, width, height);
          layerCtx.strokeStyle = "rgba(165, 184, 163, .065)";
          layerCtx.lineWidth = 1;
          layerCtx.beginPath();
          for (let x = 40; x < width; x += 40) {
            layerCtx.moveTo(x, 0);
            layerCtx.lineTo(x, height);
          }
          for (let y = 40; y < height; y += 40) {
            layerCtx.moveTo(0, y);
            layerCtx.lineTo(width, y);
          }
          layerCtx.stroke();
          layerCtx.strokeStyle = "rgba(241,240,223,.28)";
          layerCtx.beginPath();
          layerCtx.moveTo(width / 2, 0);
          layerCtx.lineTo(width / 2, height);
          layerCtx.moveTo(0, height / 2);
          layerCtx.lineTo(width, height / 2);
          layerCtx.stroke();
          cached = { layer, width, height, dpr };
          gridCache.set(canvas, cached);
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(cached.layer, 0, 0, width, height);
      }

      function setLeverPosition(top, dragging = false) {
        const clamped = clamp(top, LEVER_TOP, LEVER_BOTTOM);
        const track = $("startLeverControl");
        $("startLever").style.top = `${clamped}px`;
        track.classList.toggle("is-dragging", dragging);
        const percent = Math.round((clamped - LEVER_TOP) / (LEVER_BOTTOM - LEVER_TOP) * 100);
        track.setAttribute("aria-valuenow", String(percent));
        return percent;
      }

      function beginSetup() {
        if (app.screen !== "home") return;
        setLeverPosition(LEVER_BOTTOM);
        $("leverHint").innerHTML = "<strong>启动确认</strong>正在进入校准";
        tone(540, .06, .035);
        setTimeout(() => {
          setLeverPosition(LEVER_TOP);
          $("leverHint").innerHTML = "<strong>按住向下拉</strong>拖到底开始";
        }, 420);
        const latest = app.history.find((session) => session.gameId === app.gameId);
        if (app.launchPreset?.gameId === app.gameId) {
          $("dpiInput").value = String(app.launchPreset.dpi);
          $("sensInput").value = formatSens(app.launchPreset.sensitivity, app.gameId);
          app.dpi = app.launchPreset.dpi;
          app.currentSens = app.launchPreset.sensitivity;
          app.horizontalFov = currentGame().fov;
          $("fovInput").value = String(app.horizontalFov);
          showToast(`已载入鼠标实验室方案：${app.launchPreset.dpi} DPI，${currentGame().name} ${formatSens(app.launchPreset.sensitivity, app.gameId)}。`);
        } else if (latest) {
          $("dpiInput").value = latest.dpi;
          $("sensInput").value = formatSens(latest.mainSens, latest.gameId);
          app.horizontalFov = latest.horizontalFov || currentGame().fov;
          $("fovInput").value = String(app.horizontalFov);
        }
        showScreen("setup");
      }

      function bindLeverControl() {
        const track = $("startLeverControl");
        let dragging = false;
        let startY = 0;
        let startTop = LEVER_TOP;

        track.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || app.screen !== "home") return;
          dragging = true;
          startY = event.clientY;
          startTop = LEVER_TOP + Number(track.getAttribute("aria-valuenow") || 0) / 100 * (LEVER_BOTTOM - LEVER_TOP);
          track.setPointerCapture(event.pointerId);
          setLeverPosition(startTop, true);
        });

        track.addEventListener("pointermove", (event) => {
          if (!dragging) return;
          setLeverPosition(startTop + event.clientY - startY, true);
        });

        const finishDrag = (event) => {
          if (!dragging) return;
          dragging = false;
          if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
          const percent = Number(track.getAttribute("aria-valuenow") || 0);
          if (percent >= 78) beginSetup();
          else setLeverPosition(LEVER_TOP);
        };

        track.addEventListener("pointerup", finishDrag);
        track.addEventListener("pointercancel", finishDrag);
        track.addEventListener("keydown", (event) => {
          const current = Number(track.getAttribute("aria-valuenow") || 0);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            const percent = Math.min(100, current + 20);
            setLeverPosition(LEVER_TOP + percent / 100 * (LEVER_BOTTOM - LEVER_TOP));
            if (percent >= 100) beginSetup();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const percent = Math.max(0, current - 20);
            setLeverPosition(LEVER_TOP + percent / 100 * (LEVER_BOTTOM - LEVER_TOP));
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            beginSetup();
          } else if (event.key === "Home") {
            event.preventDefault();
            setLeverPosition(LEVER_TOP);
          } else if (event.key === "End") {
            event.preventDefault();
            beginSetup();
          }
        });
      }

      function validateSetup() {
        const dpi = Number($("dpiInput").value);
        const sens = Number($("sensInput").value);
        const fov = Number($("fovInput").value);
        const game = currentGame();
        if (!Number.isFinite(dpi) || dpi < 100 || dpi > 32000) {
          showToast("请输入 100–32000 范围内的有效 DPI。");
          $("dpiInput").focus();
          return false;
        }
        if (!Number.isFinite(sens) || sens < game.sens.min || sens > game.sens.max) {
          showToast(`请输入 ${game.sens.min}–${game.sens.max} 范围内的 ${game.name} 灵敏度。`);
          $("sensInput").focus();
          return false;
        }
        if (!Number.isFinite(fov) || fov < 60 || fov > 130) {
          showToast("请输入 60–130° 范围内的测试水平视野。");
          $("fovInput").focus();
          return false;
        }
        app.dpi = dpi;
        app.currentSens = sens;
        app.horizontalFov = fov;
        app.inputMode = document.querySelector('input[name="inputMode"]:checked')?.value || "raw";
        return true;
      }

      function prepareCalibration() {
        if (!validateSetup()) return;
        app.calibration = {
          phase: "ready",
          startedAt: 0,
          endAt: 0,
          integratedX: 0,
          minX: 0,
          maxX: 0,
          totalDistance: 0,
          points: [],
          pauses: 0
        };
        $("calOverlay").hidden = false;
        $("calTime").textContent = "8.0 s";
        $("calSpan").textContent = "0";
        $("calInputMode").textContent = "待检测";
        showScreen("calibration");
        drawCalibration();
      }

      async function startCalibration() {
        await ensureAudio();
        const calibration = app.calibration;
        calibration.phase = "running";
        calibration.startedAt = performance.now();
        calibration.endAt = calibration.startedAt + CAL_DURATION;
        calibration.points = [];
        calibration.lastPointAt = 0;
        calibration.integratedX = 0;
        calibration.minX = 0;
        calibration.maxX = 0;
        app.pendingCalibrationX = 0;
        $("calOverlay").hidden = true;
        const locked = await requestRelativeInput($("calibrationStage"));
        $("calInputMode").textContent = locked ? (app.rawInput ? "无系统加速输入" : "系统处理输入") : "兼容移动模式";
        tone(520, .07, .035);
        cancelAnimationFrame(app.raf);
        app.raf = requestAnimationFrame(tickCalibration);
      }

      function tickCalibration(now) {
        const calibration = app.calibration;
        if (!calibration || calibration.phase !== "running") return;
        const pendingX = app.pendingCalibrationX;
        app.pendingCalibrationX = 0;
        if (pendingX) {
          calibration.integratedX += pendingX;
          calibration.minX = Math.min(calibration.minX, calibration.integratedX);
          calibration.maxX = Math.max(calibration.maxX, calibration.integratedX);
          if (!calibration.lastPointAt || now - calibration.lastPointAt >= 28) {
            calibration.points.push({ x: calibration.integratedX, t: now });
            calibration.lastPointAt = now;
          }
        }
        const remaining = Math.max(0, calibration.endAt - now);
        $("calTime").textContent = `${(remaining / 1000).toFixed(1)} s`;
        $("calSpan").textContent = Math.round(calibration.maxX - calibration.minX);
        drawCalibration();
        if (remaining <= 0) {
          finishCalibration();
          return;
        }
        app.raf = requestAnimationFrame(tickCalibration);
      }

      function drawCalibration() {
        const canvas = $("calibrationCanvas");
        const { ctx, width, height, dpr } = sizeCanvas(canvas);
        drawPanelGrid(ctx, width, height, canvas, dpr);
        const calibration = app.calibration;

        ctx.fillStyle = "#b8b9aa";
        ctx.font = "14px 'Segoe UI'";
        ctx.textAlign = "center";
        ctx.fillText("左右舒适扫动包络", width / 2, 34);

        const baseline = height / 2;
        ctx.strokeStyle = "rgba(155,229,100,.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width * .12, baseline);
        ctx.lineTo(width * .88, baseline);
        ctx.stroke();

        if (!calibration?.points?.length) return;
        const span = Math.max(1, calibration.maxX - calibration.minX);
        const scale = width * .72 / span;
        ctx.strokeStyle = "#9be564";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(155,229,100,.4)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        calibration.points.forEach((point, index) => {
          const x = width / 2 + (point.x - (calibration.maxX + calibration.minX) / 2) * scale;
          const y = baseline + Math.sin(index * .11) * 12;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      function finishCalibration() {
        const calibration = app.calibration;
        calibration.phase = "done";
        const span = calibration.maxX - calibration.minX;
        if (document.pointerLockElement) document.exitPointerLock();
        if (span < 180 || calibration.totalDistance < 500) {
          cautionTone();
          $("calOverlay").hidden = false;
          $("calOverlay").innerHTML = `
            <div class="overlay-card">
              <p class="placard-title caution-ink">CALIBRATION INSUFFICIENT</p>
              <h3 class="section-title">移动样本太少</h3>
              <p>请至少完成几次完整的左右扫动，让工具观察到稳定的舒适范围。</p>
              <button class="primary-btn" id="retryCalBtn" type="button">重新校准</button>
            </div>`;
          $("retryCalBtn").addEventListener("click", () => {
            $("calOverlay").innerHTML = `
              <div class="overlay-card">
                <p class="placard-title">READY</p>
                <h3 class="section-title">做几次舒适的左右扫动</h3>
                <p>点击开始会按你选择的方式读取相对移动。“无系统加速”更适合游戏视角模拟；浏览器不支持时会自动降级。</p>
                <button class="primary-btn" id="startCalibrationBtn" type="button">开始 8 秒校准</button>
              </div>`;
            $("startCalibrationBtn").addEventListener("click", startCalibration);
          });
          return;
        }

        completeTone();
        $("calOverlay").hidden = false;
        $("calOverlay").innerHTML = `
          <div class="overlay-card">
            <p class="placard-title active-ink">MOVEMENT ENVELOPE CAPTURED</p>
            <h3 class="section-title">舒适移动范围已建立</h3>
            <p>检测到相对移动跨度 <strong>${Math.round(span)}</strong>。该数据只用于判断移动样本是否充分，不再改变准星速度。</p>
            <button class="primary-btn" id="beginTestsBtn" type="button">进入五项测试</button>
          </div>`;
        $("beginTestsBtn").addEventListener("click", prepareTests);
      }

      function prepareTests() {
        app.stageIndex = 0;
        app.stageResults = [];
        app.pauseCount = 0;
        app.inputGapCount = 0;
        app.coreRawInput = false;
        app.test = null;
        showScreen("test");
        drawTestScene();
        renderTestChecklist();
        prepareStage();
      }

      function renderTestChecklist() {
        const list = $("testChecklist");
        list.replaceChildren();
        stageDefs.forEach((stage, index) => {
          const item = document.createElement("li");
          if (index < app.stageIndex) item.className = "done";
          if (index === app.stageIndex) item.className = "active";
          item.innerHTML = `<span class="step-num">${index + 1}</span><span>${stage.name}</span><span class="lamp ${index < app.stageIndex ? "live" : index === app.stageIndex ? "warn" : ""}"></span>`;
          list.append(item);
        });
      }

      function prepareStage() {
        const stage = stageDefs[app.stageIndex];
        $("stageNumber").textContent = app.stageIndex + 1;
        $("stageTotal").textContent = stageDefs.length;
        $("sessionProgress").textContent = `${app.stageIndex + 1} / ${stageDefs.length}`;
        $("testTitle").textContent = stage.name;
        $("stageDescription").textContent = stage.description;
        $("liveHitsLabel").textContent = stage.id === "track" ? "进入 / 贴合" : "命中 / 射击";
        $("liveHits").textContent = stage.id === "track" ? "0" : "0 / 0";
        $("liveAccuracyLabel").textContent = stage.id === "track" ? "贴合率" : "命中率";
        $("liveAccuracy").textContent = "—";
        $("liveMisses").textContent = stage.id === "track" ? "—" : "0";
        $("liveReactionLabel").textContent = stage.id === "track" ? "平均角差" : "平均反应";
        $("liveReaction").textContent = "—";
        $("liveClickError").textContent = "—";
        $("liveEfficiency").textContent = "—";
        $("liveOvershoots").textContent = stage.id === "track" ? "—" : "0";
        $("liveGainLabel").textContent = stage.mode === "desktop" ? "辅助分段" : "当前档位";
        $("liveGain").textContent = `1 / ${FACTORS.length}`;
        updateTestFactorDisplay(FACTOR_ORDERS[app.stageIndex][0]);
        $("testTime").textContent = ((stage.mode === "desktop" ? AUXILIARY_DURATION : TEST_DURATION) / 1000).toFixed(1);
        $("overlayKicker").textContent = `TEST ${app.stageIndex + 1}`;
        $("overlayTitle").textContent = stage.name;
        $("overlayText").textContent = stage.mode === "desktop"
          ? "这一项使用二维移动准星，瞄准目标后按左键射击。它只辅助评估控制稳定与置信度，不直接改变推荐的游戏灵敏度。"
          : stage.id === "track"
            ? "准星固定在中心。持续移动鼠标跟随目标，不需要点击；五段会分别测试不同候选灵敏度。"
            : "准星固定在中心。移动鼠标旋转虚拟视角，瞄准目标后按左键射击；五段会分别测试不同候选灵敏度。";
        $("stageActionBtn").textContent = "开始此项测试";
        $("testOverlay").hidden = false;
        $("bigCountdown").hidden = true;
        hideFactorChangeCue();
        $("stageActionBtn").onclick = startStage;
        renderTestChecklist();
        drawTestScene();
      }

      function blankSegment() {
        return {
          hits: 0,
          shots: 0,
          misses: 0,
          spawns: 0,
          path: 0,
          optimal: 0,
          reactionTotal: 0,
          overshoots: 0,
          errorTotal: 0,
          errorSamples: 0,
          clickErrorTotal: 0,
          clickErrorSamples: 0,
          dwellMs: 0,
          activeMs: 0
        };
      }

      async function startStage() {
        await ensureAudio();
        const stage = stageDefs[app.stageIndex];
        app.pendingInputX = 0;
        app.pendingInputY = 0;
        app.pendingInputPath = 0;
        const duration = stage.mode === "desktop" ? AUXILIARY_DURATION : TEST_DURATION;
        const bounds = getCanvasBounds("aimCanvas", true);
        app.test = {
          stage,
          duration,
          segmentDuration: duration / FACTORS.length,
          phase: "countdown",
          countdownEnd: performance.now() + 3000,
          factorCountdownEnd: 0,
          runStart: 0,
          endAt: 0,
          pausedRemaining: 0,
          activeRemaining: 0,
          segmentIndex: 0,
          pendingFactorIndex: null,
          pendingOrderPosition: null,
          currentFactorIndex: FACTOR_ORDERS[app.stageIndex][0],
          segments: Array.from({ length: FACTORS.length }, blankSegment),
          target: null,
          targetSpawnAt: 0,
          lastDistance: Infinity,
          wasApproaching: false,
          aimReady: false,
          trackingInside: false,
          viewYaw: 0,
          viewPitch: 0,
          prevViewYaw: 0,
          prevViewPitch: 0,
          cursorX: bounds.width / 2,
          cursorY: bounds.height / 2,
          prevCursorX: bounds.width / 2,
          prevCursorY: bounds.height / 2,
          lastFrameAt: performance.now(),
          lastUiAt: 0,
          rand: mulberry32(app.seed + app.stageIndex * 131),
          locked: false
        };
        $("testOverlay").hidden = true;
        $("bigCountdown").hidden = false;
        $("bigCountdown").textContent = "3";
        showFactorChangeCue(app.test.currentFactorIndex, 3, true);
        app.test.locked = await requestRelativeInput($("testStage"), stage.mode === "desktop" ? "desktop" : app.inputMode);
        if (stage.mode !== "desktop" && app.rawInput) app.coreRawInput = true;
        tone(440, .045, .03);
        cancelAnimationFrame(app.raf);
        app.raf = requestAnimationFrame(tickTest);
      }

      function currentSegment() {
        return app.test.segments[app.test.currentFactorIndex];
      }

      function currentCandidateSensitivity() {
        if (!app.test) return app.currentSens;
        const game = currentGame();
        return candidateSensitivity(app.currentSens, FACTORS[app.test.currentFactorIndex], game);
      }

      function updateTestFactorDisplay(factorIndex) {
        const game = currentGame();
        const factor = FACTORS[factorIndex] ?? 1;
        $("liveCandidateSens").textContent = formatSens(candidateSensitivity(app.currentSens, factor, game), game.id);
        $("liveCandidatePercent").textContent = `测试前设置的 ${Math.round(factor * 100)}%`;
        const rail = $("testFactorRail");
        rail.replaceChildren(...FACTORS.map((value, index) => {
          const item = document.createElement("span");
          item.className = index === factorIndex ? "active" : "";
          item.textContent = `${Math.round(value * 100)}%`;
          return item;
        }));
      }

      function showFactorChangeCue(factorIndex, count, initial = false) {
        const cue = $("factorChangeCue");
        if (!cue) return;
        const factor = FACTORS[factorIndex] ?? 1;
        const game = currentGame();
        $("factorChangeKicker").textContent = initial ? "首档准备" : "灵敏度档位切换";
        $("factorChangeValue").textContent = `${Math.round(factor * 100)}% · ${formatSens(candidateSensitivity(app.currentSens, factor, game), game.id)}`;
        $("factorChangeCountdown").textContent = `${count} 秒后开始采样`;
        cue.hidden = false;
        $("testEvidenceHud")?.classList.add("is-switching");
      }

      function hideFactorChangeCue() {
        const cue = $("factorChangeCue");
        if (cue) cue.hidden = true;
        $("testEvidenceHud")?.classList.remove("is-switching");
      }

      function beginFactorCountdown(now, nextFactorIndex, orderPosition, activeRemaining) {
        const test = app.test;
        test.phase = "factor-countdown";
        test.factorCountdownEnd = now + FACTOR_SWITCH_DURATION;
        test.activeRemaining = activeRemaining;
        test.pendingFactorIndex = nextFactorIndex;
        test.pendingOrderPosition = orderPosition;
        test.target = null;
        updateTestFactorDisplay(nextFactorIndex);
        $("liveGain").textContent = `${orderPosition + 1} / ${FACTORS.length}`;
        $("bigCountdown").hidden = false;
        $("bigCountdown").textContent = String(Math.ceil(FACTOR_SWITCH_DURATION / 1000));
        showFactorChangeCue(nextFactorIndex, Math.ceil(FACTOR_SWITCH_DURATION / 1000));
        tone(500, .06, .03);
      }

      function completeFactorCountdown(now) {
        const test = app.test;
        test.currentFactorIndex = test.pendingFactorIndex;
        test.segmentIndex = test.pendingOrderPosition;
        test.pendingFactorIndex = null;
        test.pendingOrderPosition = null;
        test.phase = "running";
        test.endAt = now + test.activeRemaining;
        test.lastFrameAt = now;
        test.target = null;
        spawnTarget();
        $("bigCountdown").hidden = true;
        hideFactorChangeCue();
        tone(760, .07, .035);
      }

      function angularDistance(yawA, pitchA, yawB, pitchB) {
        const meanPitch = (pitchA + pitchB) * .5 * DEG_TO_RAD;
        const yawDelta = (yawA - yawB) * Math.cos(meanPitch);
        return Math.hypot(yawDelta, pitchA - pitchB);
      }

      function projectionFor(width) {
        return width / (2 * Math.tan(app.horizontalFov * .5 * DEG_TO_RAD));
      }

      function projectAngularTarget(target, test, width, height) {
        const focal = projectionFor(width);
        const relativeYaw = target.yaw - test.viewYaw;
        const relativePitch = target.pitch - test.viewPitch;
        const x = width / 2 + Math.tan(relativeYaw * DEG_TO_RAD) * focal;
        const y = height / 2 - Math.tan(relativePitch * DEG_TO_RAD) * focal;
        const radius = Math.max(4, Math.tan(target.radiusDeg * DEG_TO_RAD) * focal);
        return {
          x,
          y,
          radius,
          relativeYaw,
          relativePitch,
          visible: relativeYaw > -89 && relativeYaw < 89 &&
            x + radius >= 0 && x - radius <= width &&
            y + radius >= 0 && y - radius <= height
        };
      }

      function spawnTarget() {
        const test = app.test;
        const rand = test.rand;
        test.aimReady = false;
        if (test.stage.mode === "desktop") {
          const { width, height } = getCanvasBounds("aimCanvas", true);
          const radius = clamp(Math.min(width, height) * .018, 11, 16);
          const padding = radius + 24;
          const topSafeZone = Math.min(height - padding, Math.max(padding, 112));
          const x = padding + rand() * Math.max(1, width - padding * 2);
          const y = topSafeZone + rand() * Math.max(1, height - padding - topSafeZone);
          test.target = { mode: "desktop", x, y, radius };
          test.prevCursorX = test.cursorX;
          test.prevCursorY = test.cursorY;
          test.targetSpawnAt = performance.now();
          test.lastDistance = Math.hypot(x - test.cursorX, y - test.cursorY);
          test.wasApproaching = false;
          currentSegment().spawns += 1;
          currentSegment().optimal += test.lastDistance;
          return;
        }
        let yawOffset;
        let pitchOffset;
        let radiusDeg;

        if (test.stage.id === "wide") {
          const side = currentSegment().spawns % 2 === 0 ? -1 : 1;
          yawOffset = side * (34 + rand() * 10);
          pitchOffset = (rand() - .5) * 22;
          radiusDeg = 2.8;
        } else if (test.stage.id === "micro") {
          yawOffset = (rand() < .5 ? -1 : 1) * (6 + rand() * 15);
          pitchOffset = (rand() - .5) * 14;
          radiusDeg = 1.1;
        } else if (test.stage.id === "switch") {
          do {
            yawOffset = (rand() - .5) * 76;
            pitchOffset = (rand() - .5) * 28;
          } while (Math.hypot(yawOffset, pitchOffset) < 18);
          radiusDeg = 1.8;
        } else {
          yawOffset = 8;
          pitchOffset = 3;
          radiusDeg = 2.3;
        }

        const yaw = test.viewYaw + yawOffset;
        const pitch = clamp(test.viewPitch + pitchOffset, -PITCH_LIMIT + 8, PITCH_LIMIT - 8);
        test.target = {
          yaw,
          pitch,
          radiusDeg,
          baseYaw: yaw,
          basePitch: pitch
        };
        test.prevViewYaw = test.viewYaw;
        test.prevViewPitch = test.viewPitch;
        test.targetSpawnAt = performance.now();
        test.lastDistance = angularDistance(yaw, pitch, test.viewYaw, test.viewPitch);
        test.wasApproaching = false;
        currentSegment().spawns += 1;
        currentSegment().optimal += test.lastDistance;
      }

      function consumePendingTestInput() {
        const test = app.test;
        const rawX = app.pendingInputX;
        const rawY = app.pendingInputY;
        const rawPath = app.pendingInputPath;
        app.pendingInputX = 0;
        app.pendingInputY = 0;
        app.pendingInputPath = 0;
        if (!test || test.phase !== "running" || (!rawX && !rawY)) return;

        if (test.stage.mode === "desktop") {
          const bounds = getCanvasBounds("aimCanvas", true);
          test.prevCursorX = test.cursorX;
          test.prevCursorY = test.cursorY;
          test.cursorX = clamp(test.cursorX + rawX, 16, Math.max(16, bounds.width - 16));
          test.cursorY = clamp(test.cursorY + rawY, 16, Math.max(16, bounds.height - 16));
          currentSegment().path += rawPath;
          return;
        }

        const sensitivity = currentCandidateSensitivity();
        const yawDelta = rawX * sensitivity * currentGame().yaw;
        const pitchDelta = rawY * sensitivity * currentGame().yaw;
        test.prevViewYaw = test.viewYaw;
        test.prevViewPitch = test.viewPitch;
        test.viewYaw += yawDelta;
        test.viewPitch = clamp(test.viewPitch - pitchDelta, -PITCH_LIMIT, PITCH_LIMIT);
        currentSegment().path += rawPath * sensitivity * currentGame().yaw;
      }

      function tickTest(now) {
        const test = app.test;
        if (!test) return;

        if (test.phase === "paused") {
          drawTestScene();
          return;
        }

        if (test.phase === "countdown") {
          const remaining = Math.max(0, test.countdownEnd - now);
          const count = Math.max(1, Math.ceil(remaining / 1000));
          $("bigCountdown").textContent = String(count);
          showFactorChangeCue(test.currentFactorIndex, count, true);
          drawTestScene();
          if (remaining <= 0) {
            test.phase = "running";
            test.runStart = now;
            test.endAt = now + test.duration;
            test.lastFrameAt = now;
            $("bigCountdown").hidden = true;
            hideFactorChangeCue();
            spawnTarget();
            tone(720, .06, .035);
          }
          app.raf = requestAnimationFrame(tickTest);
          return;
        }

        if (test.phase === "factor-countdown") {
          const remaining = Math.max(0, test.factorCountdownEnd - now);
          const count = Math.max(1, Math.ceil(remaining / 1000));
          $("bigCountdown").textContent = String(count);
          showFactorChangeCue(test.pendingFactorIndex, count);
          drawTestScene();
          if (remaining <= 0) completeFactorCountdown(now);
          app.raf = requestAnimationFrame(tickTest);
          return;
        }

        if (test.phase !== "running") return;

        const frameDelta = Math.min(100, now - test.lastFrameAt);
        test.lastFrameAt = now;
        if (frameDelta > 50) app.inputGapCount += 1;

        const remaining = Math.max(0, test.endAt - now);
        const elapsed = test.duration - remaining;
        const orderPosition = Math.min(FACTORS.length - 1, Math.floor(elapsed / test.segmentDuration));
        const nextFactorIndex = FACTOR_ORDERS[app.stageIndex][orderPosition];
        if (nextFactorIndex !== test.currentFactorIndex) {
          beginFactorCountdown(now, nextFactorIndex, orderPosition, remaining);
          drawTestScene();
          app.raf = requestAnimationFrame(tickTest);
          return;
        }

        consumePendingTestInput();
        if (test.stage.id === "track") {
          updateTrackingTarget(elapsed, frameDelta);
        }
        detectHit(now, frameDelta);
        if (!test.lastUiAt || now - test.lastUiAt >= 80 || remaining <= 0) {
          $("liveGain").textContent = `${orderPosition + 1} / ${FACTORS.length}`;
          $("testTime").textContent = (remaining / 1000).toFixed(1);
          updateLiveReadouts();
          test.lastUiAt = now;
        }
        drawTestScene();

        if (remaining <= 0) {
          finishStage();
          return;
        }
        app.raf = requestAnimationFrame(tickTest);
      }

      function updateTrackingTarget(elapsed, frameDelta) {
        const test = app.test;
        if (!test.target) spawnTarget();
        const t = elapsed / 1000;
        test.target.yaw = test.target.baseYaw + Math.sin(t * 1.13) * 15 + Math.sin(t * 2.41) * 4;
        test.target.pitch = clamp(
          test.target.basePitch + Math.cos(t * .83) * 7 + Math.sin(t * 1.79) * 2.5,
          -PITCH_LIMIT + 6,
          PITCH_LIMIT - 6
        );
        currentSegment().activeMs += frameDelta;
      }

      function detectHit(now, frameDelta = 0) {
        const test = app.test;
        if (!test?.target) return;
        const target = test.target;
        if (test.stage.mode === "desktop") {
          const segment = currentSegment();
          const distance = Math.hypot(target.x - test.cursorX, target.y - test.cursorY);
          if (distance < test.lastDistance - 1) test.wasApproaching = true;
          if (test.wasApproaching && distance > test.lastDistance + 5) segment.overshoots += 1;
          test.lastDistance = distance;
          test.aimReady = distance <= target.radius;
          return;
        }
        const distance = angularDistance(target.yaw, target.pitch, test.viewYaw, test.viewPitch);
        const segment = currentSegment();

        if (test.stage.id === "track") {
          segment.errorTotal += distance;
          segment.errorSamples += 1;
          if (distance <= target.radiusDeg) {
            segment.dwellMs += frameDelta;
            if (!test.trackingInside) {
              hitTone();
              segment.hits += 1;
            }
            test.trackingInside = true;
          } else {
            test.trackingInside = false;
          }
          return;
        }

        if (distance < test.lastDistance - .03) test.wasApproaching = true;
        if (test.wasApproaching && distance > test.lastDistance + .15) segment.overshoots += 1;
        test.lastDistance = distance;
        test.aimReady = distance <= target.radiusDeg;
      }

      function attemptShot(now) {
        const test = app.test;
        if (!test?.target || test.phase !== "running" || test.stage.id === "track") return;
        const segment = currentSegment();
        const target = test.target;
        const distance = test.stage.mode === "desktop"
          ? Math.hypot(target.x - test.cursorX, target.y - test.cursorY)
          : angularDistance(target.yaw, target.pitch, test.viewYaw, test.viewPitch);
        const radius = test.stage.mode === "desktop" ? target.radius : target.radiusDeg;
        const normalizedError = distance / Math.max(radius, .001);
        segment.shots += 1;
        segment.clickErrorTotal += normalizedError;
        segment.clickErrorSamples += 1;
        if (distance <= radius) {
          segment.hits += 1;
          segment.reactionTotal += now - test.targetSpawnAt;
          hitTone();
          spawnTarget();
        } else {
          segment.misses += 1;
          cautionTone();
        }
      }

      function updateLiveReadouts() {
        const test = app.test;
        const hits = test.segments.reduce((sum, segment) => sum + segment.hits, 0);
        const shots = test.segments.reduce((sum, segment) => sum + segment.shots, 0);
        const misses = test.segments.reduce((sum, segment) => sum + segment.misses, 0);
        const reaction = test.segments.reduce((sum, segment) => sum + segment.reactionTotal, 0);
        const clickErrorTotal = test.segments.reduce((sum, segment) => sum + segment.clickErrorTotal, 0);
        const clickErrorSamples = test.segments.reduce((sum, segment) => sum + segment.clickErrorSamples, 0);
        const path = test.segments.reduce((sum, segment) => sum + segment.path, 0);
        const optimal = test.segments.reduce((sum, segment) => sum + segment.optimal, 0);
        const overshoots = test.segments.reduce((sum, segment) => sum + segment.overshoots, 0);
        const dwellMs = test.segments.reduce((sum, segment) => sum + segment.dwellMs, 0);
        const activeMs = test.segments.reduce((sum, segment) => sum + segment.activeMs, 0);
        const errorTotal = test.segments.reduce((sum, segment) => sum + segment.errorTotal, 0);
        const errorSamples = test.segments.reduce((sum, segment) => sum + segment.errorSamples, 0);

        if (test.stage.id === "track") {
          $("liveHits").textContent = hits;
          $("liveAccuracy").textContent = activeMs ? `${Math.round(dwellMs / activeMs * 100)}%` : "—";
          $("liveMisses").textContent = "—";
          $("liveReaction").textContent = errorSamples ? `${(errorTotal / errorSamples).toFixed(1)}°` : "—";
          $("liveClickError").textContent = "—";
          $("liveEfficiency").textContent = "—";
          $("liveOvershoots").textContent = "—";
          return;
        }

        $("liveHits").textContent = `${hits} / ${shots}`;
        $("liveAccuracy").textContent = shots ? `${Math.round(hits / shots * 100)}%` : "—";
        $("liveMisses").textContent = misses;
        $("liveReaction").textContent = hits ? `${Math.round(reaction / hits)} ms` : "—";
        $("liveClickError").textContent = clickErrorSamples ? `${Math.round(clickErrorTotal / clickErrorSamples * 100)}%` : "—";
        $("liveEfficiency").textContent = path ? `${Math.round(clamp(optimal / path, 0, 1) * 100)}%` : "—";
        $("liveOvershoots").textContent = overshoots;
      }

      function drawAngularWorldGrid(ctx, width, height, test) {
        const focal = projectionFor(width);
        const viewYaw = test?.viewYaw || 0;
        const viewPitch = test?.viewPitch || 0;
        const verticalHalfFov = Math.atan((height / 2) / focal) / DEG_TO_RAD;

        ctx.save();
        ctx.lineWidth = 1;
        const yawStart = Math.ceil((viewYaw - app.horizontalFov * .55) / 10) * 10;
        const yawEnd = viewYaw + app.horizontalFov * .55;
        for (let worldYaw = yawStart; worldYaw <= yawEnd; worldYaw += 10) {
          const x = width / 2 + Math.tan((worldYaw - viewYaw) * DEG_TO_RAD) * focal;
          if (x < 0 || x > width) continue;
          const major = Math.abs(worldYaw % 30) < .001;
          ctx.strokeStyle = major ? "rgba(155,229,100,.16)" : "rgba(190,205,188,.08)";
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        const pitchStart = Math.ceil((viewPitch - verticalHalfFov * 1.1) / 10) * 10;
        const pitchEnd = viewPitch + verticalHalfFov * 1.1;
        for (let worldPitch = pitchStart; worldPitch <= pitchEnd; worldPitch += 10) {
          const y = height / 2 - Math.tan((worldPitch - viewPitch) * DEG_TO_RAD) * focal;
          if (y < 0 || y > height) continue;
          const horizon = Math.abs(worldPitch) < .001;
          ctx.strokeStyle = horizon ? "rgba(241,218,176,.23)" : "rgba(190,205,188,.08)";
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        ctx.fillStyle = "rgba(184,185,170,.6)";
        ctx.font = "11px 'IBM Plex Mono', Consolas, monospace";
        ctx.fillText(`${currentGame().name} · 视角 ${app.horizontalFov}°  ·  YAW ${viewYaw.toFixed(1)}°  ·  PITCH ${viewPitch.toFixed(1)}°`, 18, height - 18);
        ctx.restore();
      }

      function drawDirectionCue(ctx, projected, width, height) {
        const centerX = width / 2;
        const centerY = height / 2;
        const angle = Math.atan2(-projected.relativePitch, projected.relativeYaw);
        const edgeX = clamp(centerX + Math.cos(angle) * width, 30, width - 30);
        const edgeY = clamp(centerY + Math.sin(angle) * height, 30, height - 30);
        ctx.save();
        ctx.translate(edgeX, edgeY);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(241,218,176,.82)";
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-6, -7);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawTestScene() {
        const canvas = $("aimCanvas");
        const { ctx, width, height, dpr } = sizeCanvas(canvas);
        drawPanelGrid(ctx, width, height, canvas, dpr);

        const test = app.test;
        const desktopMode = test?.stage.mode === "desktop";
        if (desktopMode) {
          test.cursorX = clamp(test.cursorX, 16, Math.max(16, width - 16));
          test.cursorY = clamp(test.cursorY, 16, Math.max(16, height - 16));
          test.prevCursorX = clamp(test.prevCursorX, 16, Math.max(16, width - 16));
          test.prevCursorY = clamp(test.prevCursorY, 16, Math.max(16, height - 16));
          if (test.target) {
            const padding = test.target.radius + 20;
            test.target.x = clamp(test.target.x, padding, Math.max(padding, width - padding));
            test.target.y = clamp(test.target.y, padding, Math.max(padding, height - padding));
          }
          ctx.save();
          ctx.fillStyle = "rgba(184,185,170,.6)";
          ctx.font = "11px 'IBM Plex Mono', Consolas, monospace";
          ctx.fillText("桌面微调辅助  ·  二维 1:1 路径  ·  不直接选择游戏灵敏度", 18, height - 18);
          ctx.restore();
        } else {
          drawAngularWorldGrid(ctx, width, height, test);
        }
        if (test?.target) {
          const target = test.target;
          if (desktopMode) {
            ctx.save();
            ctx.shadowColor = test.aimReady ? "rgba(241,240,223,.9)" : "rgba(155,229,100,.7)";
            ctx.shadowBlur = test.aimReady ? 14 : 8;
            ctx.strokeStyle = test.aimReady ? "#f1f0df" : "#9be564";
            ctx.fillStyle = test.aimReady ? "rgba(241,240,223,.18)" : "rgba(155,229,100,.12)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(target.x, target.y, Math.max(3, target.radius * .18), 0, Math.PI * 2);
            ctx.fillStyle = "#f1f0df";
            ctx.fill();
            ctx.restore();
          } else {
            const projected = projectAngularTarget(target, test, width, height);
            if (projected.visible) {
              ctx.save();
              const ready = test.stage.id === "track" ? test.trackingInside : test.aimReady;
              ctx.shadowColor = ready ? "rgba(241,240,223,.9)" : "rgba(155,229,100,.7)";
              ctx.shadowBlur = ready ? 14 : 8;
              ctx.strokeStyle = ready ? "#f1f0df" : "#9be564";
              ctx.fillStyle = ready ? "rgba(241,240,223,.18)" : "rgba(155,229,100,.12)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(projected.x, projected.y, projected.radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(projected.x, projected.y, Math.max(3, projected.radius * .18), 0, Math.PI * 2);
              ctx.fillStyle = "#f1f0df";
              ctx.fill();
              ctx.restore();
            } else {
              drawDirectionCue(ctx, projected, width, height);
            }
          }
        }

        const x = desktopMode ? test.cursorX : width / 2;
        const y = desktopMode ? test.cursorY : height / 2;
        ctx.save();
        ctx.strokeStyle = "#f1f0df";
        ctx.lineWidth = 2;
        ctx.shadowColor = "rgba(241,240,223,.35)";
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(x - 14, y);
        ctx.lineTo(x - 4, y);
        ctx.moveTo(x + 4, y);
        ctx.lineTo(x + 14, y);
        ctx.moveTo(x, y - 14);
        ctx.lineTo(x, y - 4);
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
        ctx.fillStyle = "#f1f0df";
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (test?.phase === "running" && test.stage.id !== "track" && test.aimReady) {
          ctx.save();
          ctx.fillStyle = "rgba(241,240,223,.9)";
          ctx.font = "600 12px 'IBM Plex Mono', Consolas, monospace";
          ctx.textAlign = "center";
          ctx.fillText("按左键射击", x, y + 36);
          ctx.restore();
        }
      }

      function finishStage() {
        const test = app.test;
        test.phase = "done";
        if (document.pointerLockElement) document.exitPointerLock();
        const summarized = summarizeStage(test);
        app.stageResults.push(summarized);
        completeTone();
        $("testOverlay").hidden = false;
        $("overlayKicker").textContent = `TEST ${app.stageIndex + 1} COMPLETE`;
        $("overlayTitle").textContent = `${test.stage.name}完成`;
        $("overlayText").textContent = test.stage.mode === "desktop"
          ? "二维微调辅助数据已记录，将只用于补充控制稳定与置信度。"
          : "五档候选游戏灵敏度的测试数据已记录。全部测试结束后会统一归一化并计算推荐值。";

        if (app.stageIndex < stageDefs.length - 1) {
          $("stageActionBtn").textContent = "继续下一项";
          $("stageActionBtn").onclick = () => {
            app.stageIndex += 1;
            prepareStage();
          };
        } else {
          $("stageActionBtn").textContent = "生成灵敏度建议";
          $("stageActionBtn").onclick = calculateResult;
        }
        renderTestChecklist();
      }

      function summarizeStage(test) {
        const scores = test.segments.map((segment) => {
          const efficiency = clamp(segment.optimal / Math.max(segment.path, 1), 0, 1);
          const avgReaction = segment.hits ? segment.reactionTotal / segment.hits : 2200;
          const avgError = segment.errorSamples ? segment.errorTotal / segment.errorSamples : 999;
          const avgClickError = segment.clickErrorSamples ? segment.clickErrorTotal / segment.clickErrorSamples : 3;
          const dwell = segment.activeMs ? segment.dwellMs / segment.activeMs : 0;
          const accuracy = segment.hits / Math.max(1, segment.shots);
          const missRate = segment.misses / Math.max(1, segment.shots);
          const reactionNorm = Math.exp(-Math.max(0, avgReaction - 180) / 700);
          const errorNorm = Math.exp(-avgClickError / 1.15);
          const overshootNorm = Math.exp(-segment.overshoots / Math.max(1, segment.spawns));
          const coverage = segment.hits / Math.max(1, segment.spawns);
          let raw;
          if (test.stage.id === "track") {
            raw = dwell * 72 + clamp(1 - avgError / 8, 0, 1) * 28;
          } else if (!segment.shots) {
            raw = 0;
          } else {
            raw = clamp(
              100 * (
                .35 * accuracy +
                .20 * reactionNorm * accuracy +
                .20 * errorNorm +
                .10 * efficiency +
                .10 * overshootNorm +
                .05 * coverage
              ) - 25 * missRate,
              0,
              100
            );
          }
          return {
            raw,
            hits: segment.hits,
            shots: segment.shots,
            misses: segment.misses,
            path: segment.path,
            optimal: segment.optimal,
            accuracy,
            efficiency,
            avgReaction,
            avgError,
            avgClickError,
            reactionNorm,
            errorNorm,
            dwell,
            overshoots: segment.overshoots
          };
        });
        const mean = scores.reduce((sum, score) => sum + score.raw, 0) / scores.length;
        return {
          id: test.stage.id,
          name: test.stage.name,
          scores,
          displayScore: clamp(mean, 0, 100)
        };
      }

      function calculateResult() {
        const weights = { wide: .25, micro: .3, switch: .2, track: .25 };
        const factorTotals = FACTORS.map((_, factorIndex) => app.stageResults.reduce((sum, stage) => {
          return sum + stage.scores[factorIndex].raw * (weights[stage.id] || 0);
        }, 0));
        const bestIndex = factorTotals.indexOf(Math.max(...factorTotals));
        const sorted = [...factorTotals].sort((a, b) => b - a);
        const margin = sorted[0] - sorted[1];
        const game = currentGame();
        const mainSens = clamp(app.currentSens * FACTORS[bestIndex], game.sens.min, game.sens.max);
        const auxiliaryStage = app.stageResults.find((stage) => stage.id === "desktop");
        const auxiliaryScore = auxiliaryStage ? auxiliaryStage.displayScore : 50;
        const auxiliaryContribution = clamp((auxiliaryScore - 50) / 50, -1, 1) * .04;
        const selectedClickScores = app.stageResults
          .filter((stage) => !["track", "desktop"].includes(stage.id))
          .map((stage) => stage.scores[bestIndex]);
        const allClickScores = app.stageResults
          .filter((stage) => !["track", "desktop"].includes(stage.id))
          .flatMap((stage) => stage.scores);
        const selectedShots = selectedClickScores.reduce((sum, score) => sum + score.shots, 0);
        const selectedHits = selectedClickScores.reduce((sum, score) => sum + score.hits, 0);
        const selectedAccuracy = selectedHits / Math.max(1, selectedShots);
        const totalShots = allClickScores.reduce((sum, score) => sum + score.shots, 0);
        const totalHits = allClickScores.reduce((sum, score) => sum + score.hits, 0);
        const totalMisses = allClickScores.reduce((sum, score) => sum + score.misses, 0);
        const totalReaction = allClickScores.reduce((sum, score) => sum + score.avgReaction * score.hits, 0);
        const totalClickError = allClickScores.reduce((sum, score) => sum + score.avgClickError * score.shots, 0);
        const totalPath = allClickScores.reduce((sum, score) => sum + (score.path || 0), 0);
        const totalOptimal = allClickScores.reduce((sum, score) => sum + (score.optimal || 0), 0);
        const totalOvershoots = allClickScores.reduce((sum, score) => sum + score.overshoots, 0);
        const accuracy = totalHits / Math.max(1, totalShots);
        const avgReaction = totalHits ? totalReaction / totalHits : null;
        const avgClickError = totalShots ? totalClickError / totalShots : null;
        const pathEfficiency = totalPath ? clamp(totalOptimal / totalPath, 0, 1) : null;
        const sampleConfidence = clamp(selectedShots / 9, 0, 1);
        const confidence = clamp(
          .42 +
          sampleConfidence * .12 +
          selectedAccuracy * .08 +
          clamp(margin / 20, 0, 1) * .22 +
          (app.coreRawInput ? .12 : .05) +
          auxiliaryContribution -
          Math.min(.15, app.pauseCount * .035) -
          Math.min(.1, app.inputGapCount / 180),
          .38,
          .93
        );

        const speedScores = app.stageResults.slice(0, 3).map((stage) => {
          const chosen = stage.scores[bestIndex];
          return clamp(chosen.reactionNorm * chosen.accuracy * 80 + chosen.accuracy * 20, 0, 100);
        });
        const controlScores = app.stageResults.map((stage) => {
          if (stage.id === "desktop") {
            return stage.scores.reduce((sum, score) => {
              return sum + clamp(score.efficiency * 70 + (1 - Math.min(1, score.overshoots / 8)) * 30, 0, 100);
            }, 0) / stage.scores.length;
          }
          const chosen = stage.scores[bestIndex];
          if (stage.id === "track") return clamp(chosen.dwell * 70 + (1 - chosen.avgError / 8) * 30, 0, 100);
          return clamp(
            chosen.accuracy * 45 +
            chosen.errorNorm * 30 +
            chosen.efficiency * 15 +
            Math.exp(-chosen.overshoots / Math.max(1, chosen.hits)) * 10,
            0,
            100
          );
        });
        const speed = speedScores.reduce((a, b) => a + b, 0) / speedScores.length;
        const control = controlScores.reduce((a, b) => a + b, 0) / controlScores.length;

        const stageScores = Object.fromEntries(app.stageResults.map((stage) => {
          if (stage.id === "desktop") return [stage.id, clamp(stage.displayScore, 0, 100)];
          const rawValues = stage.scores.map((score) => score.raw);
          const min = Math.min(...rawValues);
          const max = Math.max(...rawValues);
          const chosen = stage.scores[bestIndex].raw;
          const relative = max === min ? 72 : 55 + (chosen - min) / (max - min) * 40;
          return [stage.id, clamp(relative, 0, 100)];
        }));

        app.currentResult = {
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: new Date().toISOString(),
          gameId: game.id,
          gameName: game.name,
          dpi: app.dpi,
          baseSens: app.currentSens,
          mainSens: round(mainSens, game.sens.digits),
          lowSens: round(clamp(mainSens * .93, game.sens.min, game.sens.max), game.sens.digits),
          highSens: round(clamp(mainSens * 1.07, game.sens.min, game.sens.max), game.sens.digits),
          edpi: edpi(app.dpi, mainSens),
          cm360: cm360(app.dpi, mainSens, game.yaw),
          confidence,
          speed,
          control,
          accuracy,
          shots: totalShots,
          hits: totalHits,
          misses: totalMisses,
          avgReaction,
          avgClickError,
          pathEfficiency,
          overshoots: totalOvershoots,
          stageScores,
          selectedFactor: FACTORS[bestIndex],
          factorTotals,
          rawInput: app.coreRawInput,
          inputMode: app.inputMode,
          viewModel: "angular-click-confirm-v2",
          horizontalFov: app.horizontalFov,
          auxiliaryScore,
          pauseCount: app.pauseCount,
          yaw: game.yaw,
          saved: false
        };
        renderResults();
        showScreen("results");
      }

      function renderResults() {
        const result = app.currentResult;
        const resultGame = GAMES[result.gameId] || GAMES.valorant;
        $("resultPrimarySens").textContent = formatSens(result.mainSens, resultGame.id);
        $("resultPrimaryUnit").textContent = `${resultGame.name} 游戏内灵敏度`;
        $("resultCm360").textContent = `${result.cm360.toFixed(1)} cm`;
        $("resultEdpi").textContent = Math.round(result.edpi);
        $("resultAccuracy").textContent = `${Math.round((result.accuracy || 0) * 100)}%`;
        $("resultConfidence").textContent = `${Math.round(result.confidence * 100)}%`;
        $("lowSens").textContent = formatSens(result.lowSens, resultGame.id);
        $("mainSens").textContent = formatSens(result.mainSens, resultGame.id);
        $("highSens").textContent = formatSens(result.highSens, resultGame.id);
        $("resultGameName").textContent = resultGame.name;
        $("resultGameIcon").src = gameIcon(resultGame.id);
        $("resultGameIcon").alt = `${resultGame.name} 图标`;
        $("resultStateText").textContent = result.confidence >= .65 ? "交叉校验完成" : "置信度较低";
        $("resultLamp").className = `lamp ${result.confidence >= .65 ? "live" : "warn"}`;
        $("saveResultBtn").disabled = result.saved;
        $("saveResultBtn").textContent = result.saved ? "已保存到本地" : "保存到本地历史";
        renderEvidenceGrid($("resultEvidenceGrid"), result);

        const conversionList = $("conversionList");
        conversionList.replaceChildren();
        Object.values(GAMES).forEach((game) => {
          const rawSensitivity = equivalentSensitivity(result.mainSens, resultGame, game);
          const convertedSensitivity = clamp(rawSensitivity, game.sens.min, game.sens.max);
          const convertedCm360 = cm360(result.dpi, convertedSensitivity, game.yaw);
          const rangeLimited = Math.abs(convertedSensitivity - rawSensitivity) / Math.max(.001, rawSensitivity) > .01;
          const item = document.createElement("li");
          item.className = `conversion-row${game.id === resultGame.id ? " current" : ""}`;
          item.innerHTML = `
            <img src="${gameIcon(game.id)}" alt="">
            <div class="conversion-game"><strong>${game.name}</strong><span>${game.id === resultGame.id ? "本次测试游戏" : "自动等效换算"}</span></div>
            <strong>${formatSens(convertedSensitivity, game.id)}</strong>
            <span class="conversion-distance">${convertedCm360.toFixed(1)} cm/360°</span>
            <span class="conversion-note">${rangeLimited ? "已受游戏范围限制" : "物理距离等效"}</span>`;
          conversionList.append(item);
        });

        const scoreBars = $("scoreBars");
        scoreBars.replaceChildren();
        stageDefs.forEach((stage) => {
          const score = result.stageScores[stage.id];
          const row = document.createElement("div");
          row.className = "score-row";
          row.innerHTML = `<span>${stage.name}</span><div class="score-track"><div class="score-fill" style="--score-scale:${score / 100}"></div></div><strong>${Math.round(score)}</strong>`;
          scoreBars.append(row);
        });

        const factorScoreList = $("factorScoreList");
        factorScoreList.replaceChildren();
        FACTORS.forEach((factor, index) => {
          const score = Number(result.factorTotals?.[index]);
          const isWinner = Math.abs(factor - result.selectedFactor) < .001;
          const row = document.createElement("div");
          row.className = `factor-score-row${isWinner ? " winner" : ""}`;
          row.innerHTML = `
            <span>${Math.round(factor * 100)}%</span>
            <strong>${formatSens(candidateSensitivity(result.baseSens, factor, resultGame), resultGame.id)}</strong>
            <div class="factor-score-track"><div class="factor-score-fill" style="--score-scale:${Number.isFinite(score) ? clamp(score / 100, 0, 1) : 0}"></div></div>
            <strong>${Number.isFinite(score) ? Math.round(score) : "—"}</strong>`;
          factorScoreList.append(row);
        });

        const direction = result.selectedFactor < .9 ? "你的较低候选灵敏度综合表现最好，说明更低的游戏灵敏度更有利于控制。" :
          result.selectedFactor > 1.1 ? "你的较高候选灵敏度综合表现最好，说明略高的游戏灵敏度更有利于转向与切换。" :
          "你在当前游戏灵敏度下表现最好，现有设置已经接近本次测试的平衡点。";
        $("resultExplanation").innerHTML = `
          <h3 class="section-title">为什么为 ${resultGame.name} 推荐 ${formatSens(result.mainSens, resultGame.id)}</h3>
          <p>${direction}</p>
          <ul>
            <li>五档不是允许输入范围，而是相对于测试前灵敏度 <strong>${formatSens(result.baseSens, resultGame.id)}</strong> 的五个实验值：65%、82%、100%、122% 和 150%。上方展示了每档实际数值与综合得分。</li>
            <li>静态目标同时考察左键射击的命中率、反应时间、点击误差、路径效率与过冲；零射击分段记为 0 分，不能在没有样本时胜出。</li>
            <li>本次核心射击共 <strong>${result.shots}</strong> 发，命中 <strong>${result.hits}</strong> 发，未命中 <strong>${result.misses}</strong> 发；单纯快速扫过目标不再计为命中。</li>
            <li>桌面微调辅助得分为 <strong>${Math.round(result.auxiliaryScore)}</strong>，只补充控制稳定与置信度，不直接参与游戏灵敏度档位的胜负选择。</li>
            <li>本次置信度为 <strong>${Math.round(result.confidence * 100)}%</strong>；${result.rawInput ? "浏览器接受了无系统加速的相对输入请求。" : result.inputMode === "desktop" ? "本次按系统处理输入运行，视角换算仍使用候选游戏灵敏度，但可能包含系统鼠标加速。" : "无系统加速输入不可用，浏览器已改用系统处理的相对输入，因此置信度受到折减。"}</li>
            <li>对应游戏内 eDPI 为 <strong>${Math.round(result.edpi)}</strong>，按 yaw ${result.yaw} 换算的 cm/360° 约为 <strong>${result.cm360.toFixed(1)} cm</strong>。</li>
            <li>上方已按相同物理 cm/360° 自动换算全部支持游戏；不同 FOV 的视觉速度仍可能不同。</li>
            <li>先在游戏训练场试用主推荐值；若转身不足或过冲明显，再分别尝试较高或较低备选。</li>
          </ul>
          <div class="notice"><strong>重要：</strong> 本次 ${resultGame.name} 模拟使用 ${result.horizontalFov}° 水平视野与 ${result.yaw}°/count 换算模型，均不标作厂商公开的完整内部实现。跨游戏换算可保持物理 cm/360°，但不同 FOV、缩放和引擎输入链路仍会改变视觉体感；结果应作为可解释的个人起点，而不是绝对答案。</div>`;
      }

      function saveCurrentResult() {
        const result = app.currentResult;
        if (!result || result.saved) return;
        const stored = { ...result };
        delete stored.saved;
        app.history.unshift(stored);
        app.history = app.history.slice(0, 50);
        if (persistHistory()) {
          result.saved = true;
          app.converterGameId = stored.gameId;
          app.converterSens = stored.mainSens;
          app.converterDpi = stored.dpi;
          app.converterInitialized = true;
          renderResults();
          renderHome();
          completeTone();
          showToast("本次结果已保存到浏览器本地历史。");
        }
      }

      function restartRun() {
        app.stageResults = [];
        app.currentResult = null;
        showScreen("setup");
      }

      function pauseActiveTest(reason) {
        const test = app.test;
        if (!test || !["running", "countdown", "factor-countdown"].includes(test.phase)) return;
        const now = performance.now();
        test.resumePhase = test.phase;
        test.phase = "paused";
        test.pausedRemaining = test.resumePhase === "countdown"
          ? Math.max(0, test.countdownEnd - now)
          : test.resumePhase === "factor-countdown"
            ? Math.max(0, test.factorCountdownEnd - now)
            : Math.max(0, test.endAt - now);
        app.pauseCount += 1;
        $("testOverlay").hidden = false;
        $("overlayKicker").textContent = "PAUSED";
        $("overlayTitle").textContent = "测试已暂停";
        $("overlayText").textContent = `${reason}。重新点击继续后，计时将从暂停处恢复。`;
        $("stageActionBtn").textContent = "继续当前测试";
        $("stageActionBtn").onclick = resumeStage;
        cautionTone();
      }

      async function resumeStage() {
        const test = app.test;
        if (!test || test.phase !== "paused") return;
        await ensureAudio();
        test.locked = await requestRelativeInput($("testStage"), test.stage.mode === "desktop" ? "desktop" : app.inputMode);
        if (test.stage.mode !== "desktop" && app.rawInput) app.coreRawInput = true;
        const now = performance.now();
        test.phase = test.resumePhase;
        if (test.phase === "countdown") test.countdownEnd = now + test.pausedRemaining;
        else if (test.phase === "factor-countdown") test.factorCountdownEnd = now + test.pausedRemaining;
        else {
          test.endAt = now + test.pausedRemaining;
          test.lastFrameAt = now;
        }
        $("testOverlay").hidden = true;
        cancelAnimationFrame(app.raf);
        app.raf = requestAnimationFrame(tickTest);
      }

      function onMouseMove(event) {
        const now = performance.now();
        if (app.lastMeasuredMoveAt) {
          const interval = now - app.lastMeasuredMoveAt;
          if (interval > .08 && interval < 40) {
            app.measuredPollingSamples.push(interval);
            if (app.measuredPollingSamples.length > 240) app.measuredPollingSamples.shift();
          }
        }
        app.lastMeasuredMoveAt = now;
        if (app.measuredPollingSamples.length >= 24 && now - app.lastMeasuredRenderAt > 500) {
          const sorted = [...app.measuredPollingSamples].sort((a, b) => a - b);
          const lowerHalf = sorted.slice(0, Math.max(8, Math.ceil(sorted.length * .65)));
          const median = lowerHalf[Math.floor(lowerHalf.length / 2)];
          const measured = clamp(Math.round(1000 / median), 1, 8000);
          $("measuredPollingReadout").textContent = `${measured} Hz*`;
          $("measuredPollingReadout").title = "浏览器 mousemove 事件间隔估算，可能被浏览器合并，不等于鼠标固件配置";
          app.lastMeasuredRenderAt = now;
        }
        if (app.lastMoveAt && now - app.lastMoveAt > 120) app.inputGapCount += 1;
        app.lastMoveAt = now;
        const fallbackX = app.lastClientX === null ? 0 : event.clientX - app.lastClientX;
        const fallbackY = app.lastClientY === null ? 0 : event.clientY - app.lastClientY;
        const movementX = event.movementX || fallbackX;
        const movementY = event.movementY || fallbackY;
        app.lastClientX = event.clientX;
        app.lastClientY = event.clientY;

        if (app.screen === "calibration" && app.calibration?.phase === "running") {
          const dx = Number.isFinite(movementX) ? movementX : 0;
          app.calibration.totalDistance += Math.abs(dx);
          app.pendingCalibrationX += dx;
          return;
        }

        const test = app.test;
        if (app.screen !== "test" || test?.phase !== "running") return;
        const dx = Number.isFinite(movementX) ? movementX : 0;
        const dy = Number.isFinite(movementY) ? movementY : 0;
        app.pendingInputX += dx;
        app.pendingInputY += dy;
        app.pendingInputPath += Math.hypot(dx, dy);
      }

      function exportHistory() {
        if (!app.history.length) {
          showToast("当前没有可导出的历史记录。");
          return;
        }
        const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), sessions: app.history }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `sensitivity-flight-log-${new Date().toISOString().slice(0,10)}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      }

      function clearHistory() {
        if (!app.history.length) {
          showToast("历史记录已经为空。");
          return;
        }
        if (!confirm("确定清空全部本地校准历史吗？此操作无法撤销。")) return;
        app.history = [];
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        renderHome();
        showToast("本地校准历史已清空。");
      }

      function goHome() {
        cancelAnimationFrame(app.raf);
        app.test = null;
        app.calibration = null;
        showScreen("home");
        renderHome();
        if (document.pointerLockElement) document.exitPointerLock();
      }

      function cancelActiveTest() {
        const hasProgress = app.test || app.stageResults.length;
        if (hasProgress && !window.confirm("取消本次测试？当前未完成的数据不会保存。")) return;
        goHome();
      }

      function bindEvents() {
        bindLeverControl();
        document.querySelectorAll(".game-switch").forEach((button) => {
          button.addEventListener("click", () => switchGame(button.dataset.game));
        });
        $("startNewBtn").addEventListener("click", beginSetup);
        $("connectMouseBtn").addEventListener("click", connectHidMouse);
        $("setupProSearch").addEventListener("input", filterSetupPros);
        $("setupProDpiFilter").addEventListener("change", filterSetupPros);
        $("setupProList").addEventListener("click", (event) => {
          const row = event.target.closest("[data-setup-pro-index]");
          if (row) selectSetupPro(Number(row.dataset.setupProIndex));
        });
        $("setupProDpiChoices").addEventListener("click", (event) => {
          const chip = event.target.closest("[data-setup-pro-dpi]");
          if (!chip) return;
          app.setupPros.targetDpi = Number(chip.dataset.setupProDpi);
          renderSetupProSelection();
        });
        $("applySetupProBtn").addEventListener("click", applySetupProChoice);
        $("dpiInput").addEventListener("input", () => {
          if (app.dpiSource === "webhid") app.dpiSource = "manual";
        });
        $("fovInput").addEventListener("input", () => {
          const value = Number($("fovInput").value);
          if (Number.isFinite(value)) app.horizontalFov = value;
        });

        $("toCalibrationBtn").addEventListener("click", prepareCalibration);
        $("startCalibrationBtn").addEventListener("click", startCalibration);
        $("saveResultBtn").addEventListener("click", saveCurrentResult);
        $("runAgainBtn").addEventListener("click", restartRun);
        $("cancelTestBtn").addEventListener("click", cancelActiveTest);
        $("exportBtn").addEventListener("click", exportHistory);
        $("clearBtn").addEventListener("click", clearHistory);
        $("converterGamePicker").addEventListener("click", (event) => {
          const button = event.target.closest("[data-converter-game]");
          if (button) setConverterGame(button.dataset.converterGame);
        });
        $("converterSensInput").addEventListener("input", (event) => {
          app.converterSens = Number(event.target.value);
          renderConverterOutputs();
        });
        $("converterDpiInput").addEventListener("input", (event) => {
          app.converterDpi = Number(event.target.value);
          renderConverterOutputs();
        });
        $("converterOutputList").addEventListener("click", (event) => {
          const button = event.target.closest("[data-copy-value]");
          if (button) copyConverterValue(button.dataset.copyValue);
        });
        document.querySelectorAll("[data-go-home]").forEach((button) => button.addEventListener("click", goHome));

        $("soundToggle").addEventListener("click", async () => {
          app.sound = !app.sound;
          $("soundToggle").textContent = app.sound ? "🔊" : "🔇";
          $("soundToggle").setAttribute("aria-pressed", String(app.sound));
          $("soundToggle").setAttribute("aria-label", app.sound ? "关闭声音" : "开启声音");
          if (app.sound) {
            await ensureAudio();
            tone(720, .06, .035);
          }
        });

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("pointerlockchange", () => {
          const locked = Boolean(document.pointerLockElement);
          if (locked) setInputStatus(app.rawInput ? "无系统加速输入" : "系统处理输入", "live");
          else if (app.screen === "test" && app.test?.locked && ["running", "countdown", "factor-countdown"].includes(app.test.phase)) {
            pauseActiveTest("鼠标锁定已退出");
          }
        });
        document.addEventListener("pointerlockerror", () => {
          setInputStatus("兼容移动模式", "warn");
          showToast("鼠标锁定失败，已尝试兼容输入模式。");
        });
        document.addEventListener("visibilitychange", () => {
          if (document.hidden && app.screen === "test") pauseActiveTest("页面已切换到后台");
        });
        window.addEventListener("blur", () => {
          if (app.screen === "test") pauseActiveTest("浏览器窗口失去焦点");
        });
        window.addEventListener("resize", () => {
          app.canvasBounds = Object.create(null);
          gridCache.delete($("calibrationCanvas"));
          gridCache.delete($("aimCanvas"));
          if (app.screen === "calibration") drawCalibration();
          if (app.screen === "test") drawTestScene();
        });
        $("testStage").addEventListener("wheel", (event) => {
          if (app.screen === "test") event.preventDefault();
        }, { passive: false });
        $("testStage").addEventListener("mousedown", (event) => {
          if (event.button !== 0 || app.screen !== "test") return;
          event.preventDefault();
          attemptShot(performance.now());
        });
        if ("ResizeObserver" in window) {
          const observer = new ResizeObserver(() => {
            delete app.canvasBounds.aimCanvas;
            gridCache.delete($("aimCanvas"));
            if (app.screen === "test") drawTestScene();
          });
          observer.observe($("aimCanvas"));
        }
      }

      function init() {
        applyLaunchParameters();
        loadHistory();
        updateGameUi();
        initializeSetupProSelector();
        renderHome();
        bindEvents();
        initHidAssist();
        setInputStatus("等待鼠标输入", "");
        drawCalibration();
        drawTestScene();
      }

      init();
    })();
