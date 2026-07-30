---
name: Valorant Sensitivity Flight Deck
description: A calm night-instrument system for personal aim calibration.
colors:
  panel-void: "#070908"
  panel-deep: "#0d100f"
  panel: "#151917"
  panel-raised: "#1b201d"
  instrument-ink: "#f1f0df"
  muted-ink: "#b8b9aa"
  active-radium: "#9be564"
  active-soft: "#c9f6a6"
  caution-amber: "#efb64b"
  invalid-red: "#f05a4f"
typography:
  display:
    fontFamily: "Bahnschrift, Arial Narrow, DIN Condensed, sans-serif"
    fontSize: "clamp(1.2rem, 2.3vw, 1.8rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Bahnschrift, Arial Narrow, DIN Condensed, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  resultNumber:
    fontFamily: "Bahnschrift, Arial Narrow, DIN Condensed, sans-serif"
    fontSize: "clamp(3.2rem, 7vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.03em"
  auxiliary:
    fontFamily: "Bahnschrift, Arial Narrow, DIN Condensed, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0.02em"
rounded:
  control: "6px"
  panel: "12px"
  instrument: "50%"
spacing:
  tight: "8px"
  standard: "14px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.active-radium}"
    textColor: "{colors.panel-void}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.instrument-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.panel-void}"
    textColor: "{colors.active-soft}"
    typography: "{typography.display}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "58px"
---

# Design System: Valorant Sensitivity Flight Deck

## Overview

**Creative North Star: "Night-Flight Calibration Console"**

The visual world comes from a small aircraft crossing darkness by trusted instruments alone. The interface behaves like a matte physical panel: every dial owns one truth, the eye follows a practiced cross-check, and state is conveyed by measured needle movement rather than decorative spectacle.

The system is dense only where measurement requires it. Quiet black fields, luminous markings, terse placards, damped motion, and rare caution lamps create confidence without imitating the familiar neon esports dashboard.

**Key Characteristics:**

- Direct numeric summaries on both the home overview and final result, with instruments reserved for decorative identity rather than precise result communication.
- Near-black matte material, luminous marks, and restrained caution colors.
- Physical, damped transitions that show trend as well as value.
- Direct operating language; metaphor never replaces the real metric.

## Colors

Use a restrained night-instrument palette: Panel Void and Panel Deep establish the dark physical console; Instrument Ink carries all readable markings; Active Radium is reserved for valid live state; Caution Amber and Invalid Red are strictly semantic.

### Primary

- **Active Radium:** valid targets, needles, primary controls, and completed-state lamps.

### Secondary

- **Caution Amber:** degraded input, low confidence, and recoverable warnings.
- **Invalid Red:** blocked input or destructive action only.

### Neutral

- **Panel Void:** page ground and instrument wells.
- **Panel Deep:** recessed readouts and history rows.
- **Panel:** the continuous physical console.
- **Instrument Ink:** primary markings and text.
- **Muted Ink:** instructions and secondary labels.

**The Caution Lamp Rule.** Amber and red are state signals, never decoration.

## Typography

**Display Font:** Bahnschrift (with Arial Narrow and condensed sans-serif fallbacks)
**Body Font:** Segoe UI Variable (with Segoe UI and Microsoft YaHei UI fallbacks)
**Label/Mono Font:** Bahnschrift

**Character:** Narrow instrument lettering compresses values and placards without pretending the entire product is code. The workhorse UI face carries Chinese instructions at comfortable reading widths.

### Hierarchy

- **Display** (600, responsive 1.2–1.8rem, 1.15): page and state headings.
- **Reading** (600, responsive 0.9–1.5rem): live numeric windows.
- **Primary Result** (600, responsive 3.2–6rem, 0.96): the final game sensitivity only.
- **Body** (400, 1rem, 1.65): explanations and recovery guidance.
- **Label** (600, 0.78rem, 0.06em): uppercase placards and controls.
- **Auxiliary** (400, 0.72rem, 1.35): conversion notes, units, and compact metadata.

**The Instrument Truth Rule.** Metric labels and values remain literal—recommendation, eDPI, cm/360°, confidence—not metaphorical cockpit jargon.

## Layout

The home view is a three-part console: a direct latest-result summary, central start lever, and local flight log, followed by a full-width four-game conversion bench. The test view gives the canvas the largest field, keeps stage context in the left rail, and places eight compact live evidence values in a centered top HUD between the timer and session readouts. Sensitivity changes temporarily replace that evidence strip with the upcoming percentage, exact game value, and a two-second countdown while sampling is paused. The result view prioritizes one large sensitivity number, compact supporting facts, the same evidence vocabulary, and a scan-friendly four-game conversion list; it deliberately avoids gauges.

校准第 1 步在基本输入上方提供紧凑的职业选手 DPI 目录：左侧搜索名册，右侧查看选手资料、选择 DPI 并回填当前游戏等效灵敏度。职业设置始终标注为测试起点。

Panel gaps use the standard 14px rhythm. Dense internal groups use 8px; major panel padding uses 24px or more. Below the safe desktop width, the active application is replaced with a clear desktop requirement instead of presenting an unreliable compressed test.

## Elevation & Depth

Depth is structural and shallow: recessed instrument wells, a single enclosing panel, small directional shadows, and highlights kept below the text plane. Active state comes from material color and needle position rather than colored outer halos. Generic floating cards and ambient glassmorphism are outside this system.

**The Panel Rule.** Surfaces belong to one physical console; they do not float independently.

## Shapes

Circular gauges sit inside squared or softly chamfered panel cutouts. Main panels use restrained 12px corners; controls and readouts use 6px corners. Controls feel machined and tactile, with firm edges, inset tracks, and repeated calibration ticks. Decorative pill shapes are not part of the language.

## Components

### Primary Button

- **Shape:** firm 6px control corner.
- **Material:** Active Radium face, dark ink, top highlight, and a short lower mechanical offset.
- **State:** hover brightens slightly; active compresses the lower offset; focus uses a two-pixel luminous outline.

### Secondary and Destructive Buttons

- **Shape:** the same machined control silhouette.
- **Material:** graphite face with neutral structural shadow.
- **State:** destructive controls use red only in the text and border, never as a full decorative field.

### Instrument Gauge

- **Shape:** circular recessed well with repeated calibration ticks.
- **Reading:** one literal metric per gauge, a damped needle, and an inset numeric window.
- **State:** needle position and semantic lamp color carry change; labels never rely on metaphor alone.

### Input Field

- **Shape:** 6px inset readout.
- **Material:** Panel Void with Active Soft numeric text.
- **State:** native invalid validation is replaced with an explicit recovery message and focused field.

### Status Placard

- **Shape:** compact engraved rectangle, not a decorative pill.
- **Content:** one lamp and one short literal state.

## Do's and Don'ts

### Do:

- **Do** let each instrument own one plainly named truth.
- **Do** use damped needle motion and short mechanical state feedback.
- **Do** preserve a stable cross-check order across home, live test, result, and history views.
- **Do** provide visual equivalents for every sound cue.
- **Do** let the canvas dominate every active aim-test state.
- **Do** use monotonic timing and pause visibly when focus or pointer lock is lost.

### Don't:

- **Don't** turn the interface into a neon esports HUD or glass card dashboard.
- **Don't** use warning colors for emphasis unrelated to system state.
- **Don't** hide task progress or controls behind the cockpit metaphor.
- **Don't** crowd the active aim field with decorative telemetry.
- **Don't** animate layout properties when a transform can carry the same state.
- **Don't** present community-measured conversion constants as Riot-official data.

## Mouse Lab Surface

鼠标实验室沿用同一个“夜航校准台”世界，但把操作模型从飞行仪表改成“体检目录、中央工作台、诊断档案”：

- 左侧目录负责七项测试的选择、完成状态和运行环境，不承担结果解读。
- 中央工作台一次只呈现一个任务，大面积运动测试优先获得可用空间。
- 右侧诊断档案持续显示实时状态、事件日志、最近结论和导出操作。
- 事件链路相关指标都使用“估算”“代理值”等准确标签，并在工作台和页脚重复说明测量边界。

在 1320px 以下，诊断档案移动到工作台下方；在 960px 以下，目录改为三列任务矩阵，页面允许纵向滚动但不能产生横向溢出。需要连续大幅移动的任务仍应提示使用桌面宽屏，而不是在窄屏伪装成可靠测量。
