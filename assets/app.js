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
          id: "valorant", name: "æ— ç•å¥‘çº¦", brandName: "ã€Šæ— ç•å¥‘çº¦ã€‹", yaw: 0.07, fov: 103,
          sens: Object.freeze({ min: .01, max: 10, step: .001, digits: 3, default: .32 }),
          sourceNote: "ç¤¾åŒºå¸¸ç”¨ yaw 0.07Â°/countï¼›æ°´å¹³è§†é‡Žå¸¸æŒ‰ 103Â° æ¨¡æ‹Ÿ"
        }),
        overwatch2: Object.freeze({
          id: "overwatch2", name: "å®ˆæœ›å…ˆé”‹ 2", brandName: "ã€Šå®ˆæœ›å…ˆé”‹ 2ã€‹", yaw: .0066, fov: 103,
          sens: Object.freeze({ min: .01, max: 100, step: .01, digits: 2, default: 5 }),
          sourceNote: "ç¤¾åŒºå¸¸ç”¨ yaw 0.0066Â°/countï¼›æ°´å¹³è§†é‡Žå¯åœ¨æ¸¸æˆä¸­è°ƒæ•´"
        }),
        cs2: Object.freeze({
          id: "cs2", name: "CS2", brandName: "ã€ŠCS2ã€‹", yaw: .022, fov: 90,
          sens: Object.freeze({ min: .1, max: 8, step: .001, digits: 3, default: 1 }),
          sourceNote: "é»˜è®¤ m_yaw é€šå¸¸ä¸º 0.022Â°/countï¼›æœ¬é¡µä»¥ 90Â° æ°´å¹³è§†é‡Žä½œè§†è§‰æ¨¡æ‹Ÿ"
        }),
        deltaforce: Object.freeze({
          id: "deltaforce", name: "ä¸‰è§’æ´²è¡ŒåŠ¨", brandName: "ã€Šä¸‰è§’æ´²è¡ŒåŠ¨ã€‹", yaw: .022, fov: 100,
          sens: Object.freeze({ min: .01, max: 100, step: .01, digits: 2, default: 5 }),
          sourceNote: "ç¤¾åŒºæ¢ç®—å¸¸æŒ‰ yaw 0.022Â°/countï¼›è§†é‡Žå¯è°ƒï¼Œæœ¬é¡µé»˜è®¤ 100Â°"
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
        { id: "wide", name: "å¤§èŒƒå›´è½¬å‘", description: "å›ºå®šä¸­å¤®å‡†æ˜Ÿï¼Œç›®æ ‡åœ¨å·¦å³å¤§è§’åº¦äº¤æ›¿å‡ºçŽ°ã€‚ç§»åŠ¨é¼ æ ‡å®Œæˆè½¬å‘ï¼Œçž„å‡†åŽå·¦é”®å°„å‡»ï¼Œæµ‹é‡é€Ÿåº¦ã€è·¯å¾„æ•ˆçŽ‡ã€å‘½ä¸­çŽ‡ä¸Žè¿‡å†²ã€‚" },
        { id: "micro", name: "å¾®å°ç›®æ ‡å®šä½", description: "å°ç›®æ ‡åœ¨ä¸­å¿ƒé™„è¿‘ä»¥è¾ƒå°è§’åº¦å‡ºçŽ°ã€‚çž„å‡†åŽå·¦é”®å°„å‡»ï¼Œé‡ç‚¹æµ‹é‡æœ«ç«¯æŽ§åˆ¶ã€ç‚¹å‡»è¯¯å·®ä¸Žç¨³å®šæ€§ã€‚" },
        { id: "switch", name: "è¿žç»­ç›®æ ‡åˆ‡æ¢", description: "ç›®æ ‡åœ¨ä¸åŒæ–¹ä½è§’è¿žç»­å‡ºçŽ°ã€‚é€ä¸ªçž„å‡†å¹¶å·¦é”®å°„å‡»ï¼Œé‡ç‚¹æµ‹é‡åˆ‡æ¢å»¶è¿Ÿã€å‘½ä¸­çŽ‡ä¸Žæ–¹å‘ä¿®æ­£ã€‚" },
        { id: "track", name: "å¹³æ»‘è¿½è¸ª", description: "æŒç»­æ—‹è½¬è™šæ‹Ÿè§†è§’è·Ÿéšç§»åŠ¨ç›®æ ‡ã€‚ä¸­å¤®å‡†æ˜Ÿè¿›å…¥ç›®æ ‡åŽä¿æŒè´´åˆï¼Œé‡ç‚¹æµ‹é‡å¹³å‡è§’åº¦è¯¯å·®ä¸Žè·Ÿéšæ—¶é—´ã€‚" },
        { id: "desktop", mode: "desktop", name: "æ¡Œé¢å¾®è°ƒè¾…åŠ©", description: "æœ€åŽè¿›è¡Œä¸€é¡¹ç‹¬ç«‹çš„äºŒç»´å¾®è°ƒæµ‹è¯•ã€‚å‡†æ˜Ÿéšé¼ æ ‡ç§»åŠ¨ï¼Œçž„å‡†åŽå·¦é”®å°„å‡»ï¼›è¯¥ç»“æžœåªè¾…åŠ©è¯„ä¼°æŽ§åˆ¶ç¨³å®šä¸Žç½®ä¿¡åº¦ï¼Œä¸ç›´æŽ¥é€‰æ‹©æ¸¸æˆçµæ•åº¦æ¡£ä½ã€‚" }
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
      const motionAnimations = new WeakMap();
      const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      const MOTION_EASE = "cubic-bezier(.16, 1, .3, 1)";
      let homePowerTimeline = null;
      let homePowerResizeFrame = 0;

      function motionAllowed() {
        return !reducedMotionQuery.matches && typeof Element.prototype.animate === "function";
      }

      function gsapAvailable() {
        return !reducedMotionQuery.matches && typeof window.gsap?.timeline === "function";
      }

      function playMotion(element, keyframes, options = {}) {
        if (!element || !motionAllowed()) return null;
        const running = motionAnimations.get(element);
        if (running) running.cancel();
        const animation = element.animate(keyframes, {
          duration: 320,
          easing: MOTION_EASE,
          fill: "both",
          ...options
        });
        motionAnimations.set(element, animation);
        animation.onfinish = () => {
          if (motionAnimations.get(element) === animation) motionAnimations.delete(element);
          animation.cancel();
        };
        animation.oncancel = () => {
          if (motionAnimations.get(element) === animation) motionAnimations.delete(element);
        };
        return animation;
      }

      function runConsoleBoot() {
        if (!motionAllowed()) return;
        document.body.classList.remove("console-boot");
        void document.body.offsetWidth;
        document.body.classList.add("console-boot");
        setTimeout(() => document.body.classList.remove("console-boot"), 980);
      }

      function homePanels() {
        return {
          cluster: document.querySelector(".instrument-cluster"),
          lever: document.querySelector(".start-bay"),
          history: document.querySelector(".history-panel"),
          converter: document.querySelector(".converter-panel")
        };
      }

      function primeHomePanelEntrance() {
        if (!gsapAvailable()) {
          document.documentElement.classList.remove("motion-prep");
          return false;
        }
        const panels = homePanels();
        if (Object.values(panels).some((panel) => !panel)) return false;
        const gsap = window.gsap;
        gsap.set(Object.values(panels), {
          y: 18,
          opacity: 0,
          visibility: "visible",
          clipPath: "inset(100% 0% 0% 0% round 12px)",
          filter: "brightness(.58)",
          transformOrigin: "bottom center",
          willChange: "transform,opacity,clip-path"
        });
        return true;
      }

      function createPowerSvgElement(name, className) {
        const element = document.createElementNS("http://www.w3.org/2000/svg", name);
        element.setAttribute("class", className);
        return element;
      }

      function layoutHomePowerBus() {
        const shell = document.querySelector(".home-shell");
        const network = $("homePowerBus");
        const circuitLayer = $("homePowerBusCircuits");
        const connectorLayer = $("homePowerBusConnectors");
        const nodeLayer = $("homePowerBusNodes");
        const panels = homePanels();
        if (!shell || !network || !circuitLayer || !connectorLayer || !nodeLayer || Object.values(panels).some((panel) => !panel)) return null;

        const shellRect = shell.getBoundingClientRect();
        const relativeRect = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left - shellRect.left + .5,
            top: rect.top - shellRect.top + .5,
            right: rect.right - shellRect.left - .5,
            bottom: rect.bottom - shellRect.top - .5,
            width: Math.max(0, rect.width - 1),
            height: Math.max(0, rect.height - 1)
          };
        };
        const panelOrder = [panels.cluster, panels.lever, panels.history, panels.converter];
        const rects = panelOrder.map(relativeRect);
        network.setAttribute("viewBox", `0 0 ${Math.max(1, shellRect.width)} ${Math.max(1, shellRect.height)}`);

        const loops = rects.map((rect, index) => {
          const rail = createPowerSvgElement("rect", "power-bus-loop-rail");
          const flow = createPowerSvgElement("rect", "power-bus-loop-flow");
          [rail, flow].forEach((loop) => {
            loop.setAttribute("x", rect.left.toFixed(1));
            loop.setAttribute("y", rect.top.toFixed(1));
            loop.setAttribute("width", rect.width.toFixed(1));
            loop.setAttribute("height", rect.height.toFixed(1));
            loop.setAttribute("rx", "11");
            loop.setAttribute("ry", "11");
            loop.dataset.powerPanel = String(index);
          });
          circuitLayer.append(rail, flow);
          return { rail, flow, length: flow.getTotalLength() };
        });

        const connectionPoints = (from, to) => {
          if (to.left >= from.right) {
            const overlapTop = Math.max(from.top, to.top);
            const overlapBottom = Math.min(from.bottom, to.bottom);
            const y = overlapBottom > overlapTop ? (overlapTop + overlapBottom) / 2 : (from.top + from.bottom) / 2;
            return [[from.right, y], [to.left, y]];
          }
          if (to.top >= from.bottom) {
            const overlapLeft = Math.max(from.left, to.left);
            const overlapRight = Math.min(from.right, to.right);
            const x = overlapRight > overlapLeft ? (overlapLeft + overlapRight) / 2 : (from.left + from.right) / 2;
            return [[x, from.bottom], [x, to.top]];
          }
          if (from.left >= to.right) {
            const y = (Math.max(from.top, to.top) + Math.min(from.bottom, to.bottom)) / 2;
            return [[from.left, y], [to.right, y]];
          }
          const x = (Math.max(from.left, to.left) + Math.min(from.right, to.right)) / 2;
          return [[x, from.top], [x, to.bottom]];
        };

        const nodePoints = [];
        const connectors = rects.slice(0, -1).map((rect, index) => {
          const points = connectionPoints(rect, rects[index + 1]);
          const pathData = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)} L ${points[1][0].toFixed(1)} ${points[1][1].toFixed(1)}`;
          const rail = createPowerSvgElement("path", "power-bus-connector-rail");
          const flow = createPowerSvgElement("path", "power-bus-connector-flow");
          [rail, flow].forEach((connector) => connector.setAttribute("d", pathData));
          connectorLayer.append(rail, flow);
          nodePoints.push(...points);
          return { rail, flow, length: flow.getTotalLength() };
        });

        const nodes = nodePoints.map(([x, y]) => {
          const node = createPowerSvgElement("circle", "");
          node.setAttribute("cx", x.toFixed(1));
          node.setAttribute("cy", y.toFixed(1));
          node.setAttribute("r", "3.5");
          return node;
        });
        circuitLayer.replaceChildren(...loops.flatMap((loop) => [loop.rail, loop.flow]));
        connectorLayer.replaceChildren(...connectors.flatMap((connector) => [connector.rail, connector.flow]));
        nodeLayer.replaceChildren(...nodes);
        return { network, loops, connectors, nodes, ...panels };
      }

      function stopHomePowerSequence({ reset = false } = {}) {
        if (homePowerTimeline) {
          homePowerTimeline.kill();
          homePowerTimeline = null;
        }
        if (!reset || !window.gsap) return;
        const elements = [
          document.querySelector(".instrument-cluster"),
          document.querySelector(".start-bay"),
          document.querySelector(".history-panel"),
          document.querySelector(".converter-panel"),
          document.querySelector(".lever-track"),
          ...document.querySelectorAll(".power-bus-loop-flow, .power-bus-connector-flow"),
          ...document.querySelectorAll(".power-bus-nodes circle")
        ].filter(Boolean);
        window.gsap.set(elements, { clearProps: "opacity,visibility,transform,filter,clipPath,boxShadow,willChange,strokeDasharray,strokeDashoffset" });
        window.gsap.set("#homePowerBus", { autoAlpha: 0 });
      }

      function runHomePowerSequence() {
        if (!gsapAvailable()) {
          document.documentElement.classList.remove("motion-prep");
          return false;
        }
        stopHomePowerSequence({ reset: true });
        const parts = layoutHomePowerBus();
        if (!parts) {
          document.documentElement.classList.remove("motion-prep");
          return false;
        }
        if (!primeHomePanelEntrance()) return false;

        const gsap = window.gsap;
        const lamps = [...document.querySelectorAll(".topbar .lamp.live")];
        const brandMark = document.querySelector(".brand-mark");
        const leverTrack = document.querySelector(".lever-track");
        const panelDefaults = {
          duration: .56,
          ease: "power3.out",
          y: 0,
          opacity: 1,
          visibility: "visible",
          filter: "brightness(1)",
          clipPath: "inset(0% 0% 0% 0% round 12px)"
        };
        const panels = [parts.cluster, parts.lever, parts.history, parts.converter];
        const loopFlows = parts.loops.map((loop) => loop.flow);
        const connectorFlows = parts.connectors.map((connector) => connector.flow);

        gsap.set(parts.network, { autoAlpha: 1 });
        parts.loops.forEach((loop) => {
          gsap.set(loop.flow, { strokeDasharray: loop.length, strokeDashoffset: loop.length, opacity: .08 });
        });
        parts.connectors.forEach((connector) => {
          gsap.set(connector.flow, { strokeDasharray: connector.length, strokeDashoffset: connector.length, opacity: 0 });
        });
        gsap.set(parts.nodes, { opacity: 0, scale: .45, transformOrigin: "center" });
        document.documentElement.classList.remove("motion-prep");

        homePowerßÞ}òÚ$z{-®éÜj×¶f÷&ÖE6Vç2‡&W7VÇBæ&6U6Vç2Â&W7VÇDvÖRæ–B—ÓÂ÷7G&öæsây¨NK©NKŠ®Zéîš¨ÎXÎûÉ£cR^8ƒ"^8^8#"RY(ÂS^8.Kˆ®ikž[^zK®K¨njøþj>Zéî™˜^i[XÎKˆî{»ÎYŽ[é~Xˆn8#ÂöÆ“àÐ¢ÆÆ“î™Ùžhyºîj~YÎi{nˆ>Zùþ[zn™Jî[NX{¾y¨NYÞKŠÞxè~8XøÞ[©Ni{n™{N8x+žX{¾Šúþ[zî8‹zþ[èNiXŽxè~Kˆî‹ø~Xk.ûÉ¾™»n[NX{¾Xˆnjë^ŠëK‹¢XˆnûÈÎKˆÞˆ;ÞYÊŽk*iÈžj~iÊÎi{nˆ9ÎX{®8#ÂöÆ“àÐ¢ÆÆ“îiÊÎjÊjŽ[ø>[NX{¾X[Ç7G&öæsâG·&W7VÇBç6†÷G7ÓÂ÷7G&öæsâXùûÈÎYÞKŠÒÇ7G&öæsâG·&W7VÇBæ†—G7ÓÂ÷7G&öæsâXùûÈÎiÊ®YÞKŠÒÇ7G&öæsâG·&W7VÇBæÖ—76W7ÓÂ÷7G&öæsâXùûÉ¾XÙ^{ªþ[ú¾˜	þhš¾‹ø~yºîj~KˆÞXhÞŠêK‹®YÞKŠÞ8#ÂöÆ“àÐ¢ÆÆ“îjÎ™Ú.[êî‹>‹è^Xªž[é~XˆnK‹¢Ç7G&öæsâG´ÖF‚ç&÷VæB‡&W7VÇBæW†–Æ–'•66÷&R—ÓÂ÷7G&öæsîûÈÎXú®Š^XX^hê~X‹nz‹>Zé®Kˆî{ÚîKú[ªnûÈÎKˆÞy»Nhê^Xø.Kˆîk‹Žhˆþx^iXþ[ªnj>KØÞy¨Nˆ9Î‹Iþ˜žhºž8#ÂöÆ“àÐ¢ÆÆ“îiÊÎjÊ{ÚîKú[ªnK‹¢Ç7G&öæsâG´ÖF‚ç&÷VæB‡&W7VÇBæ6öæf–FVæ6R¢—ÒSÂ÷7G&öæsîûÉ²G·&W7VÇBç&t–çWBò.kXþŠxŽYšŽhê^Xù~K¨niz{;¾{¹þXª˜	þy¨Ny»ŽZûž‹é>XZ^Šû~k.8""¢&W7VÇBæ–çWDÖöFRÓÓÒ&FW6·F÷"ò.iÊÎjÊhÈž{;¾{¹þZHNyn‹é>XZ^‹ùŠÎûÈÎŠxnŠy.hÚ.zé~K¸ÞKÛþyJŽX	ž˜žk‹Žhˆþx^iXþ[ªnûÈÎKØnXúþˆ;ÞXÈ^Y
¾{;¾{¹þ›Êj~Xª˜	þ8""¢.iz{;¾{¹þXª˜	þ‹é>XZ^KˆÞXúþyJŽûÈÎkXþŠxŽYšŽ[{.iKžyJŽ{;¾{¹þZHNyny¨Ny»ŽZûž‹é>XZ^ûÈÎYºjÚN{ÚîKú[ªnXù~X‹h©ŽXxþ8"'ÓÂöÆ“àÐ¢ÆÆ“îZûž[©Nk‹ŽhˆþXhRTE’K‹¢Ç7G&öæsâG´ÖF‚ç&÷VæB‡&W7VÇBæVG’—ÓÂ÷7G&öæsîûÈÎhÈ’–rG·&W7VÇBç–wÒhÚ.zé~y¨B6Òó3c+{ªnK‹¢Ç7G&öæsâG·&W7VÇBæ6Ó3cçFôf—†VBƒ—Ò6ÓÂ÷7G&öæsî8#ÂöÆ“àÐ¢ÆÆ“îKˆ®ikž[{.hÈžy»ŽYÎxšžyb6Òó3c+ˆz®XªŽhÚ.zé~XZŽ˜:ŽiJþhÈk‹ŽhˆþûÉ¾KˆÞYÂdõby¨NŠxnŠxž˜	þ[ªnK¸ÞXúþˆ;ÞKˆÞYÎ8#ÂöÆ“àÐ¢ÆÆ“îXXŽYÊŽk‹ŽhˆþŠêÞ{¸>YË®Šù^yJŽK‹¾hêŽˆÙXÎûÉ¾ˆº^‹ÚÎ‹ª¾KˆÞ‹k>h‰n‹ø~Xk.iˆîi‹îûÈÎXhÞXˆnXŠ¾[	ÞŠù^‹è>š¹Žh‰n‹è>KØîZH~˜ž8#ÂöÆ“àÐ¢Â÷VÃàÐ¢ÆF—b6Æ73Ò&æ÷F–6R#ãÇ7G&öæsî˜xÞŠhûÉ£Â÷7G&öæsâiÊÎjÊG·&W7VÇDvÖRææÖWÒjŠh¹þKÛþyJ‚G·&W7VÇBæ†÷&—¦öçFÄf÷gÜ+kN[›>Šxn˜xîKˆâG·&W7VÇBç–wÜ+ö6÷VçBhÚ.zé~jŠYè¾ûÈÎYØ~KˆÞj~KÙÎXè.YXnXZÎ[Èy¨NZèÎi[NXh^˜:ŽZéîxë8.‹zŽk‹ŽhˆþhÚ.zé~XúþKùÞhÈxšžyb6Òó3c+ûÈÎKØnKˆÞYÂdõn8{ÊžiKîY(Î[É^i8î‹é>XZ^™;î‹zþK¸ÞKÉ®iKžXùŽŠxnŠxžKÙ>hIþûÉ¾{¹>iéÎ[©NKÙÎK‹®XúþŠz>˜x®y¨NKŠ®K«®‹[~x+žûÈÎˆÎKˆÞiŠþ{¹ÞZûžzÙNjŽ8#ÂöF—cæ°Ð¢ÐÐ Ð¢gVæ7F–öâ6fT7W'&VçE&W7VÇB‚’°Ð¢6öç7B&W7VÇBÒæ7W'&VçE&W7VÇC°Ð¢–b‚&W7VÇBÇÂ&W7VÇBç6fVB’&WGW&ã°Ð¢6öç7B7F÷&VBÒ²ââç&W7VÇBÓ°Ð¢FVÆWFR7F÷&VBç6fVC°Ð¢æ†—7F÷'’çVç6†–gB‡7F÷&VB“°Ð¢æ†—7F÷'’Òæ†—7F÷'’ç6Æ–6RƒÂS“°Ð¢–b‡W'6—7D†—7F÷'’‚’’°Ð¢&W7VÇBç6fVBÒG'VS°Ð¢æ6öçfW'FW$vÖT–BÒ7F÷&VBævÖT–C°Ð¢æ6öçfW'FW%6Vç2Ò7F÷&VBæÖ–å6Vç3°Ð¢æ6öçfW'FW$G’Ò7F÷&VBæG“°Ð¢æ6öçfW'FW$–æ—F–Æ—¦VBÒG'VS°Ð¢&VæFW%&W7VÇG2‚“°Ð¢&VæFW$†öÖR‚“°Ð¢6ö×ÆWFUFöæR‚“°Ð¢6†÷uFö7B‚.iÊÎjÊ{¹>iéÎ[{.KùÞZÙŽX‹kXþŠxŽYšŽiÊÎYËXènXû.8""“°Ð¢ÐÐ¢ÐÐ Ð¢gVæ7F–öâ&W7F'E'Vâ‚’°Ð¢ç7FvU&W7VÇG2ÒµÓ°Ð¢æ7W'&VçE&W7VÇBÒçVÆÃ°Ð¢6†÷u67&VVâ‚'6WGW"“°Ð¢ÐÐ Ð¢gVæ7F–öâW6T7F—fUFW7B‡&V6öâ’°Ð¢6öç7BFW7BÒçFW7C°Ð¢–b‚FW7BÇÂ²''Vææ–ær"Â&6÷VçFF÷vâ"Â&f7F÷"Ö6÷VçFF÷vâ%Òæ–æ6ÇVFW2‡FW7Bç†6R’’&WGW&ã°Ð¢6öç7Bæ÷rÒW&f÷&Öæ6Rææ÷r‚“°Ð¢FW7Bç&W7VÖU†6RÒFW7Bç†6S°Ð¢FW7Bç†6RÒ'W6VB#°Ð¢FW7BçW6VE&VÖ–æ–ærÒFW7Bç&W7VÖU†6RÓÓÒ&6÷VçFF÷vâ Ð¢òÖF‚æÖ‚ƒÂFW7Bæ6÷VçFF÷väVæBÒæ÷rÐ¢¢FW7Bç&W7VÖU†6RÓÓÒ&f7F÷"Ö6÷VçFF÷vâ Ð¢òÖF‚æÖ‚ƒÂFW7Bæf7F÷$6÷VçFF÷väVæBÒæ÷rÐ¢¢ÖF‚æÖ‚ƒÂFW7BæVæDBÒæ÷r“°Ð¢çW6T6÷VçB³Ò°Ð¢B‚'FW7D÷fW&Æ’"’æ†–FFVâÒfÇ6S°Ð¢B‚&÷fW&Æ”¶–6¶W""’çFW‡D6öçFVçBÒ%U4TB#°Ð¢B‚&÷fW&Æ•F—FÆR"’çFW‡D6öçFVçBÒ.kX¾Šù^[{.i¨.XÂ#°Ð¢B‚&÷fW&Æ•FW‡B"’çFW‡D6öçFVçBÒG·&V6öçÞ8.˜xÞikx+žX{¾{º~{ºÞYîûÈÎŠêi{n[nK¸îi¨.XÎZHNh.ZHÞ8&°Ð¢B‚'7FvT7F–öä'Fâ"’çFW‡D6öçFVçBÒ.{º~{ºÞ[Ù>X˜ÞkX¾ŠùR#°Ð¢B‚'7FvT7F–öä'Fâ"’æöæ6Æ–6²Ò&W7VÖU7FvS°Ð¢6WF–öåFöæR‚“°Ð¢ÐÐ Ð¢7–æ2gVæ7F–öâ&W7VÖU7FvR‚’°Ð¢6öç7BFW7BÒçFW7C°Ð¢–b‚FW7BÇÂFW7Bç†6RÓÒ'W6VB"’&WGW&ã°Ð¢v—BVç7W&TVF–ò‚“°Ð¢FW7BæÆö6¶VBÒv—B&WVW7E&VÆF—fT–çWB‚B‚'FW7E7FvR"’ÂFW7Bç7FvRæÖöFRÓÓÒ&FW6·F÷"ò&FW6·F÷"¢æ–çWDÖöFR“°Ð¢–b‡FW7Bç7FvRæÖöFRÓÒ&FW6·F÷"bbç&t–çWB’æ6÷&U&t–çWBÒG'VS°Ð¢6öç7Bæ÷rÒW&f÷&Öæ6Rææ÷r‚“°Ð¢FW7Bç†6RÒFW7Bç&W7VÖU†6S°Ð¢–b‡FW7Bç†6RÓÓÒ&6÷VçFF÷vâ"’FW7Bæ6÷VçFF÷väVæBÒæ÷r²FW7BçW6VE&VÖ–æ–æs°Ð¢VÇ6R–b‡FW7Bç†6RÓÓÒ&f7F÷"Ö6÷VçFF÷vâ"’FW7Bæf7F÷$6÷VçFF÷väVæBÒæ÷r²FW7BçW6VE&VÖ–æ–æs°Ð¢VÇ6R°Ð¢FW7BæVæDBÒæ÷r²FW7BçW6VE&VÖ–æ–æs°Ð¢FW7BæÆ7Dg&ÖTBÒæ÷s°Ð¢ÐÐ¢B‚'FW7D÷fW&Æ’"’æ†–FFVâÒG'VS°Ð¢6æ6VÄæ–ÖF–öäg&ÖR†ç&b“°Ð¢ç&bÒ&WVW7Dæ–ÖF–öäg&ÖR‡F–6µFW7B“°Ð¢ÐÐ Ð¢gVæ7F–öâöäÖ÷W6TÖ÷fR†WfVçB’°Ð¢6öç7Bæ÷rÒW&f÷&Öæ6Rææ÷r‚“°Ð¢–b†æÆ7DÖV7W&VDÖ÷fTB’°Ð¢6öç7B–çFW'fÂÒæ÷rÒæÆ7DÖV7W&VDÖ÷fTC°Ð¢–b†–çFW'fÂâã‚bb–çFW'fÂÂC’°Ð¢æÖV7W&VEöÆÆ–æu6×ÆW2çW6‚†–çFW'fÂ“°Ð¢–b†æÖV7W&VEöÆÆ–æu6×ÆW2æÆVæwF‚â#C’æÖV7W&VEöÆÆ–æu6×ÆW2ç6†–gB‚“°Ð¢ÐÐ¢ÐÐ¢æÆ7DÖV7W&VDÖ÷fTBÒæ÷s°Ð¢–b†æÖV7W&VEöÆÆ–æu6×ÆW2æÆVæwF‚ãÒ#Bbbæ÷rÒæÆ7DÖV7W&VE&VæFW$BâS’°Ð¢6öç7B6÷'FVBÒ²ââææÖV7W&VEöÆÆ–æu6×ÆW5Òç6÷'B‚†Â"’ÓâÒ"“°Ð¢6öç7BÆ÷vW$†ÆbÒ6÷'FVBç6Æ–6RƒÂÖF‚æÖ‚ƒ‚ÂÖF‚æ6V–Â‡6÷'FVBæÆVæwF‚¢ãcR’’“°Ð¢6öç7BÖVF–âÒÆ÷vW$†Æe´ÖF‚æfÆö÷"†Æ÷vW$†ÆbæÆVæwF‚ò"•Ó°Ð¢6öç7BÖV7W&VBÒ6Æ×„ÖF‚ç&÷VæBƒòÖVF–â’ÂÂƒ“°Ð¢B‚&ÖV7W&VEöÆÆ–æu&VF÷WB"’çFW‡D6öçFVçBÒG¶ÖV7W&VGÒ‡¢¦°Ð¢B‚&ÖV7W&VEöÆÆ–æu&VF÷WB"’çF—FÆRÒ.kXþŠxŽYš‚Ö÷W6VÖ÷fRK¨¾K»n™{N™©NKËzé~ûÈÎXúþˆ;ÞŠ*¾kXþŠxŽYšŽYŽ[›nûÈÎKˆÞzØžK¨î›Êj~Y»®K»n˜XÞ{Úâ#°Ð¢æÆ7DÖV7W&VE&VæFW$BÒæ÷s°Ð¢ÐÐ¢–b†æÆ7DÖ÷fTBbbæ÷rÒæÆ7DÖ÷fTBâ#’æ–çWDv6÷VçB³Ò°Ð¢æÆ7DÖ÷fTBÒæ÷s°Ð¢6öç7BfÆÆ&6µ‚ÒæÆ7D6Æ–VçE‚ÓÓÒçVÆÂò¢WfVçBæ6Æ–VçE‚ÒæÆ7D6Æ–VçEƒ°Ð¢6öç7BfÆÆ&6µ’ÒæÆ7D6Æ–VçE’ÓÓÒçVÆÂò¢WfVçBæ6Æ–VçE’ÒæÆ7D6Æ–VçE“°Ð¢6öç7BÖ÷fVÖVçE‚ÒWfVçBæÖ÷fVÖVçE‚ÇÂfÆÆ&6µƒ°Ð¢6öç7BÖ÷fVÖVçE’ÒWfVçBæÖ÷fVÖVçE’ÇÂfÆÆ&6µ“°Ð¢æÆ7D6Æ–VçE‚ÒWfVçBæ6Æ–VçEƒ°Ð¢æÆ7D6Æ–VçE’ÒWfVçBæ6Æ–VçE“°Ð Ð¢–b†ç67&VVâÓÓÒ&6Æ–'&F–öâ"bbæ6Æ–'&F–öãòç†6RÓÓÒ''Vææ–ær"’°Ð¢6öç7BG‚ÒçVÖ&W"æ—4f–æ—FR†Ö÷fVÖVçE‚’òÖ÷fVÖVçE‚¢°Ð¢æ6Æ–'&F–öâçF÷FÄF—7Fæ6R³ÒÖF‚æ'2†G‚“°Ð¢çVæF–æt6Æ–'&F–öå‚³ÒGƒ°Ð¢&WGW&ã°Ð¢ÐÐ Ð¢6öç7BFW7BÒçFW7C°Ð¢–b†ç67&VVâÓÒ'FW7B"ÇÂFW7Còç†6RÓÒ''Vææ–ær"’&WGW&ã°Ð¢6öç7BG‚ÒçVÖ&W"æ—4f–æ—FR†Ö÷fVÖVçE‚’òÖ÷fVÖVçE‚¢°Ð¢6öç7BG’ÒçVÖ&W"æ—4f–æ—FR†Ö÷fVÖVçE’’òÖ÷fVÖVçE’¢°Ð¢çVæF–æt–çWE‚³ÒGƒ°Ð¢çVæF–æt–çWE’³ÒG“°Ð¢çVæF–æt–çWEF‚³ÒÖF‚æ‡—÷B†G‚ÂG’“°Ð¢ÐÐ Ð¢gVæ7F–öâW‡÷'D†—7F÷'’‚’°Ð¢–b‚æ†—7F÷'’æÆVæwF‚’°Ð¢6†÷uFö7B‚.[Ù>X˜Þk*iÈžXúþZûÎX{®y¨NXènXû.Šë[Ù^8""“°Ð¢&WGW&ã°Ð¢ÐÐ¢6öç7B&Æö"ÒæWr&Æö"…´¥4ôâç7G&–æv–g’‡²fW'6–öã¢"ÂW‡÷'FVDC¢æWrFFR‚’çFô•4õ7G&–ær‚’Â6W76–öç3¢æ†—7F÷'’ÒÂçVÆÂÂ"•ÒÂ²G—S¢&Æ–6F–öâö§6öâ"Ò“°Ð¢6öç7BW&ÂÒU$Âæ7&VFTö&¦V7EU$Â†&Æö"“°Ð¢6öç7Bæ6†÷"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&"“°Ð¢æ6†÷"æ‡&VbÒW&Ã°Ð¢æ6†÷"æF÷væÆöBÒ6Vç6—F—f—G’ÖfÆ–v‡BÖÆörÒG¶æWrFFR‚’çFô•4õ7G&–ær‚’ç6Æ–6RƒÃ—Òæ§6öæ°Ð¢æ6†÷"æ6Æ–6²‚“°Ð¢6WEF–ÖV÷WB‚‚’ÓâU$Âç&Wfö¶Tö&¦V7EU$Â‡W&Â’ÂS“°Ð¢ÐÐ Ð¢gVæ7F–öâ6ÆV$†—7F÷'’‚’°Ð¢–b‚æ†—7F÷'’æÆVæwF‚’°Ð¢6†÷uFö7B‚.XènXû.Šë[Ù^[{.{¸þK‹®z›®8""“°Ð¢&WGW&ã°Ð¢ÐÐ¢–b‚6öæf—&Ò‚.zîZé®kˆ^z›®XZŽ˜:ŽiÊÎYËj
XxnXènXû.Y	~ûÉþjÚNi8ÞKÙÎizk9^i*N™H8""’’&WGW&ã°Ð¢æ†—7F÷'’ÒµÓ°Ð¢Æö6Å7F÷&vRç&VÖ÷fT—FVÒ…5Dõ$tUô´U’“°Ð¢Æö6Å7F÷&vRç&VÖ÷fT—FVÒ„ÄTt5•õ5Dõ$tUô´U’“°Ð¢&VæFW$†öÖR‚“°Ð¢6†÷uFö7B‚.iÊÎYËj
XxnXènXû.[{.kˆ^z›®8""“°Ð¢ÐÐ Ð¢gVæ7F–öâvô†öÖR‚’°Ð¢6æ6VÄæ–ÖF–öäg&ÖR†ç&b“°Ð¢çFW7BÒçVÆÃ°Ð¢æ6Æ–'&F–öâÒçVÆÃ°Ð¢6†÷u67&VVâ‚&†öÖR"“°Ð¢&VæFW$†öÖR‚“°Ð¢–b†Fö7VÖVçBçö–çFW$Æö6´VÆVÖVçB’Fö7VÖVçBæW†—Eö–çFW$Æö6²‚“°Ð¢ÐÐ Ð¢gVæ7F–öâ6æ6VÄ7F—fUFW7B‚’°Ð¢6öç7B†5&öw&W72ÒçFW7BÇÂç7FvU&W7VÇG2æÆVæwFƒ°Ð¢–b††5&öw&W72bbv–æF÷ræ6öæf—&Ò‚.XùnkhŽiÊÎjÊkX¾Šù^ûÉþ[Ù>X˜ÞiÊ®ZèÎh‰y¨Ni[hÚîKˆÞKÉ®KùÞZÙŽ8""’’&WGW&ã°Ð¢vô†öÖR‚“°Ð¢ÐÐ Ð¢gVæ7F–öâ&–æDWfVçG2‚’°Ð¢&–æDÆWfW$6öçG&öÂ‚“°Ð¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚"ævÖR×7v—F6‚"’æf÷$V6‚‚†'WGFöâ’Óâ°Ð¢'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ7v—F6„vÖR†'WGFöâæFF6WBævÖR’“°Ð¢Ò“°Ð¢B‚'7F'DæWt'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â&Vv–å6WGW“°Ð¢B‚&6öææV7DÖ÷W6T'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6öææV7D†–DÖ÷W6R“°Ð¢B‚'6WGW&õ6V&6‚"’æFDWfVçDÆ—7FVæW"‚&–çWB"Âf–ÇFW%6WGW&÷2“°Ð¢B‚'6WGW&ôG”f–ÇFW""’æFDWfVçDÆ—7FVæW"‚&6†ævR"Âf–ÇFW%6WGW&÷2“°Ð¢B‚'6WGW&ôÆ—7B"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ð¢6öç7B&÷rÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FF×6WGW×&òÖ–æFW…Ò"“°Ð¢–b‡&÷r’6VÆV7E6WGW&ò„çVÖ&W"‡&÷ræFF6WBç6WGW&ô–æFW‚’“°Ð¢Ò“°Ð¢B‚'6WGW&ôG”6†ö–6W2"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ð¢6öç7B6†—ÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FF×6WGW×&òÖG•Ò"“°Ð¢–b‚6†—’&WGW&ã°Ð¢ç6WGW&÷2çF&vWDG’ÒçVÖ&W"†6†—æFF6WBç6WGW&ôG’“°Ð¢&VæFW%6WGW&õ6VÆV7F–öâ‚“°Ð¢Ò“°Ð¢B‚&Ç•6WGW&ô'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂÇ•6WGW&ô6†ö–6R“°Ð¢B‚&G”–çWB"’æFDWfVçDÆ—7FVæW"‚&–çWB"Â‚’Óâ°Ð¢–b†æG•6÷W&6RÓÓÒ'vV&†–B"’æG•6÷W&6RÒ&ÖçVÂ#°Ð¢Ò“°Ð¢B‚&f÷d–çWB"’æFDWfVçDÆ—7FVæW"‚&–çWB"Â‚’Óâ°Ð¢6öç7BfÇVRÒçVÖ&W"‚B‚&f÷d–çWB"’çfÇVR“°Ð¢–b„çVÖ&W"æ—4f–æ—FR‡fÇVR’’æ†÷&—¦öçFÄf÷bÒfÇVS°Ð¢Ò“°Ð Ð¢B‚'Fô6Æ–'&F–öä'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â&W&T6Æ–'&F–öâ“°Ð¢B‚'7F'D6Æ–'&F–öä'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7F'D6Æ–'&F–öâ“°Ð¢B‚'6fU&W7VÇD'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6fT7W'&VçE&W7VÇB“°Ð¢B‚''Väv–ä'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â&W7F'E'Vâ“°Ð¢B‚&6æ6VÅFW7D'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6æ6VÄ7F—fUFW7B“°Ð¢B‚&W‡÷'D'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂW‡÷'D†—7F÷'’“°Ð¢B‚&6ÆV$'Fâ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6ÆV$†—7F÷'’“°Ð¢B‚&6öçfW'FW$vÖU–6¶W""’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ð¢6öç7B'WGFöâÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FFÖ6öçfW'FW"ÖvÖUÒ"“°Ð¢–b†'WGFöâ’6WD6öçfW'FW$vÖR†'WGFöâæFF6WBæ6öçfW'FW$vÖR“°Ð¢Ò“°Ð¢B‚&6öçfW'FW%6Vç4–çWB"’æFDWfVçDÆ—7FVæW"‚&–çWB"Â†WfVçB’Óâ°Ð¢æ6öçfW'FW%6Vç2ÒçVÖ&W"†WfVçBçF&vWBçfÇVR“°Ð¢&VæFW$6öçfW'FW$÷WGWG2‚“°Ð¢Ò“°Ð¢B‚&6öçfW'FW$G”–çWB"’æFDWfVçDÆ—7FVæW"‚&–çWB"Â†WfVçB’Óâ°Ð¢æ6öçfW'FW$G’ÒçVÖ&W"†WfVçBçF&vWBçfÇVR“°Ð¢&VæFW$6öçfW'FW$÷WGWG2‚“°Ð¢Ò“°Ð¢B‚&6öçfW'FW$÷WGWDÆ—7B"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ð¢6öç7B'WGFöâÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FFÖ6÷’×fÇVUÒ"“°Ð¢–b†'WGFöâ’6÷”6öçfW'FW%fÇVR†'WGFöâæFF6WBæ6÷•fÇVR“°Ð¢Ò“°Ð¢Fö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚%¶FFÖvòÖ†öÖUÒ"’æf÷$V6‚‚†'WGFöâ’Óâ'WGFöâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Âvô†öÖR’“°Ð Ð¢B‚'6÷VæEFövvÆR"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°Ð¢ç6÷VæBÒç6÷VæC°Ð¢B‚'6÷VæEFövvÆR"’çFW‡D6öçFVçBÒç6÷VæBò/	ùH¢"¢/	ùHr#°Ð¢B‚'6÷VæEFövvÆR"’ç6WDGG&–'WFR‚&&–×&W76VB"Â7G&–ær†ç6÷VæB’“°Ð¢B‚'6÷VæEFövvÆR"’ç6WDGG&–'WFR‚&&–ÖÆ&VÂ"Âç6÷VæBò.X[>™zÞZ;™û2"¢.[ÈY
þZ;™û2"“°Ð¢–b†ç6÷VæB’°Ð¢v—BVç7W&TVF–ò‚“°Ð¢FöæRƒs#ÂãbÂã3R“°Ð¢ÐÐ¢Ò“°Ð Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&Ö÷W6VÖ÷fR"ÂöäÖ÷W6TÖ÷fR“°Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚'ö–çFW&Æö6¶6†ævR"Â‚’Óâ°Ð¢6öç7BÆö6¶VBÒ&ööÆVâ†Fö7VÖVçBçö–çFW$Æö6´VÆVÖVçB“°Ð¢–b†Æö6¶VB’6WD–çWE7FGW2†ç&t–çWBò.iz{;¾{¹þXª˜	þ‹é>XZR"¢.{;¾{¹þZHNyn‹é>XZR"Â&Æ—fR"“°Ð¢VÇ6R–b†ç67&VVâÓÓÒ'FW7B"bbçFW7CòæÆö6¶VBbb²''Vææ–ær"Â&6÷VçFF÷vâ"Â&f7F÷"Ö6÷VçFF÷vâ%Òæ–æ6ÇVFW2†çFW7Bç†6R’’°Ð¢W6T7F—fUFW7B‚.›Êj~™HZé®[{.˜X{¢"“°Ð¢ÐÐ¢Ò“°Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚'ö–çFW&Æö6¶W'&÷""Â‚’Óâ°Ð¢6WD–çWE7FGW2‚.X[ÎZëžz{¾XªŽjŠ[Èò"Â'v&â"“°Ð¢6†÷uFö7B‚.›Êj~™HZé®ZK‹J^ûÈÎ[{.[	ÞŠù^X[ÎZëž‹é>XZ^jŠ[Èþ8""“°Ð¢Ò“°Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚'f—6–&–Æ—G–6†ævR"Â‚’Óâ°Ð¢–b†Fö7VÖVçBæ†–FFVâbbç67&VVâÓÓÒ'FW7B"’W6T7F—fUFW7B‚.š^™Ú.[{.Xˆ~hÚ.X‹YîXû"“°Ð¢Ò“°Ð¢v–æF÷ræFDWfVçDÆ—7FVæW"‚&&ÇW""Â‚’Óâ°Ð¢–b†ç67&VVâÓÓÒ'FW7B"’W6T7F—fUFW7B‚.kXþŠxŽYšŽz©~Xú>ZKXë¾xJnx+’"“°Ð¢Ò“°Ð¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'&W6—¦R"Â‚’Óâ°Ð¢æ6çf4&÷VæG2Òö&¦V7Bæ7&VFR†çVÆÂ“°Ð¢w&–D66†RæFVÆWFR‚B‚&6Æ–'&F–öä6çf2"’“°Ð¢w&–D66†RæFVÆWFR‚B‚&–Ô6çf2"’“°Ð¢–b†ç67&VVâÓÓÒ&6Æ–'&F–öâ"’G&t6Æ–'&F–öâ‚“°Ð¢–b†ç67&VVâÓÓÒ'FW7B"’G&uFW7E66VæR‚“°Ð¢Ò“°Ð¢B‚'FW7E7FvR"’æFDWfVçDÆ—7FVæW"‚'v†VVÂ"Â†WfVçB’Óâ°Ð¢–b†ç67&VVâÓÓÒ'FW7B"’WfVçBç&WfVçDFVfVÇB‚“°Ð¢ÒÂ²76—fS¢fÇ6RÒ“°Ð¢B‚'FW7E7FvR"’æFDWfVçDÆ—7FVæW"‚&Ö÷W6VF÷vâ"Â†WfVçB’Óâ°Ð¢–b†WfVçBæ'WGFöâÓÒÇÂç67&VVâÓÒ'FW7B"’&WGW&ã°Ð¢WfVçBç&WfVçDFVfVÇB‚“°Ð¢GFV×E6†÷B‡W&f÷&Öæ6Rææ÷r‚’“°Ð¢Ò“°Ð¢–b‚%&W6—¦Tö'6W'fW""–âv–æF÷r’°Ð¢6öç7Bö'6W'fW"ÒæWr&W6—¦Tö'6W'fW"‚‚’Óâ°Ð¢FVÆWFRæ6çf4&÷VæG2æ–Ô6çf3°Ð¢w&–D66†RæFVÆWFR‚B‚&–Ô6çf2"’“°Ð¢–b†ç67&VVâÓÓÒ'FW7B"’G&uFW7E66VæR‚“°Ð¢Ò“°Ð¢ö'6W'fW"æö'6W'fR‚B‚&–Ô6çf2"’“°Ð¢ÐÐ¢ÐÐ Ð¢gVæ7F–öâ&–æDÖ÷F–öäfVVF&6²‚’°Ð¢Fö7VÖVçBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ð¢6öç7B6öçG&öÂÒWfVçBçF&vWBæ6Æ÷6W7B‚&'WGFöã¦æ÷B‚ævÖR×7v—F6‚’ÂæÆ"ÖVçG'’ÖÆ–æ²"“°Ð¢–b†6öçG&öÂ’VÇ6T6öçG&öÂ†6öçG&öÂ“°Ð¢Ò“°Ð¢ÐÐ Ð¢gVæ7F–öâ–æ—B‚’°Ð¢Ç”ÆVæ6…&ÖWFW'2‚“°Ð¢ÆöD†—7F÷'’‚“°Ð¢WFFTvÖUV’‚“°Ð¢–æ—F–Æ—¦U6WGW&õ6VÆV7F÷"‚“°Ð¢&VæFW$†öÖR‚“°Ð¢&–æDWfVçG2‚“°Ð¢&–æDÖ÷F–öäfVVF&6²‚“°Ð¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'&W6—¦R"ÂVWVT†öÖU÷vW$Æ–÷WBÂ²76—fS¢G'VRÒ“°Ð¢–æ—D†–D76—7B‚“°Ð¢6WD–çWE7FGW2‚.zØž[è^›Êj~‹é>XZR"Â""“°Ð¢G&t6Æ–'&F–öâ‚“°Ð¢G&uFW7E66VæR‚“°Ð¢'Vå67&VVäÖ÷F–öâ‚&†öÖR"“°Ð¢ÐÐ Ð¢–æ—B‚“°Ð¢Ò’‚“°Ð