---
version: 1
slug: "mouse-lab-html"
primary_target: "mouse-lab.html"
related_targets:
  - "index.html"
  - "assets/shared.css"
  - "assets/mouse-lab.css"
---

Scope: multi-file pure-frontend mouse diagnostics surface at `mouse-lab.html`. Visitor mode: Operate.

Audience and job: one FPS player checks whether browser mouse events are healthy, measures natural grip-angle offset, and completes practical input, input-chain, angle, CPS, event-to-frame, and reaction tests before returning a chosen DPI and equivalent sensitivity to the main calibrator.

Primary action and proof: choose one of six clearly named tests from the left directory, perform one focused task in the central workbench, and read literal measurements plus limitations in the diagnostic logbook. Completion status, recent conclusions, local history, JSON export, and a visible return path make every test recoverable.

Chosen direction: Mouse Checkup Archive inside the established Night-Flight Calibration Console. The surface behaves like a pre-flight maintenance desk: check directory at left, one large workbench in the center, and a persistent diagnostic logbook at right. It uses matte physical panels, restrained radium valid states, amber caution, literal metric names, and short mechanical feedback.

Constraints: no backend, account, upload, runtime third-party request, EXE, or false hardware claim. Browser event frequency and event-to-frame timing are proxies, not firmware polling rate or hardware latency. Tests pause or fail safely when samples are insufficient. Local data stays in `localStorage`. At narrow widths the layout stacks without horizontal overflow.

Implementation proof: `assets/mouse-lab.js` owns interaction and local history; `assets/mouse-lab.css` owns the responsive surface.
