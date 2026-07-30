# FPS 多游戏个人灵敏度生成器

一个纯静态、可本地运行的 FPS 鼠标灵敏度校准工具。通过内嵌瞄准测试、鼠标移动范围校准和多项操作指标，为玩家生成个人灵敏度建议，并在《无畏契约》《守望先锋 2》《CS2》和《三角洲行动》之间进行等效换算。

**在线体验：** https://chitose11.github.io/fps-sensitivity-flight-deck/

## 主要功能

- 四款 FPS 游戏切换及等效 `cm/360°` 灵敏度换算
- DPI、当前游戏灵敏度和测试视野设置
- ProSettings VALORANT 职业选手静态快照，可搜索、筛选并浏览全部匹配数据
- 可选的只读 WebHID 鼠标识别与浏览器事件回报率估算
- 舒适鼠标移动范围校准
- 65%、82%、100%、122%、150% 五档候选灵敏度实测
- 大范围转向、微小目标定位、连续目标切换、平滑追踪和桌面微调测试
- 命中率、空枪、反应时间、点击偏差、路径效率和过冲等实时指标
- 主推荐、低/高备选、eDPI、`cm/360°`、置信度及四游戏推荐值
- 浏览器本地历史、结果比较和 JSON 导出
- 首页独立灵敏度转换器和鼠标实验室

## 使用

直接打开 `index.html`，或通过任意静态 HTTP 服务运行：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

WebHID 需要 Chrome 或 Edge，并通过 HTTPS 或 localhost 打开。所有测试记录默认保存在当前浏览器的 `localStorage` 中。

## 项目结构

- `index.html`：主灵敏度校准器
- `mouse-lab.html`：鼠标实验室
- `assets/`：样式、交互逻辑和内嵌图标
- `data/`：职业选手静态数据快照
- `scripts/`：数据快照生成脚本
- `docs/`：研究和实现说明
- `PRODUCT.md`：产品规格
- `DESIGN.md`：视觉与交互规范

## 说明

本项目是个人校准工具，不属于 Riot Games、Blizzard Entertainment、Valve 或腾讯的官方产品。游戏换算常量来自社区长期实测和公开资料，最终数值以游戏客户端实际接受值为准。
