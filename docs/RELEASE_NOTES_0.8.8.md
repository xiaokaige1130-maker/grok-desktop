# Grok Desktop 0.8.8 — Release Notes

**Release date:** 2026-07-22  
**Platforms:** Windows x64 (primary this cycle) · Linux / macOS share the same codebase

---

## 一句话

引入 Bootstrap UI 组件（计划 Offcanvas）、全局浮层滚动条，并按官方 Grok CLI 落地 **任务 / 计划 / 目标** 三种工作模式。

---

## Highlights

### 1. Bootstrap 与弹出层

- 依赖 `bootstrap@5.3`，CSS/JS 接入，打包包含 dist
- 执行计划 → **Offcanvas** 抽屉（遮罩、Esc、顶层 z-index）
- 斜杠菜单、搜索结果、下拉菜单、Goal 条：浮层不挤布局
- 全局主题化细滚动条

### 2. 工作模式（官方 CLI）

| 模式 | CLI | 用户侧 |
|------|-----|--------|
| 任务 (Normal) | 默认 | 直接干活 |
| 计划 (Plan) | `/plan` | 先方案再动手 |
| 目标 (/goal) | `/goal …` | 输入框无需 `/goal`，发送自动包装 |

Composer 附加：`@` → **`+`**。

### 3. Windows 安装包

- `release/Grok-Desktop-0.8.8-Windows-Portable-x64.exe`
- `release/Grok-Desktop-0.8.8-Windows-Setup-x64.exe`

```bash
npm run dist:win
```

---

## Notes

- 仍依赖本机官方 Grok CLI 登录与额度
- 未签名构建可能被 SmartScreen 拦截
