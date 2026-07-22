# Grok Desktop 0.8.7 — Release Notes

**Release date:** 2026-07-21
**Platforms:** Windows x64 (primary this cycle) · Linux / macOS continue to share the same codebase

---

## 一句话

把 Windows 桌面端做到「能关窗、能托盘、能通知、能记忆窗口」，并把右上角 **计划 / 导出 / 重命名 / 删除** 收成一套产品级工具栏。

---

## Highlights / 亮点

### 1. Windows 原生感

| 能力 | 说明 |
|------|------|
| 系统托盘 | 常驻右下角；右键显示 / 新建 / 设置 / 退出 |
| 关闭 → 托盘 | 点 × 不退出（可在设置关闭） |
| 首次提示 | 第一次藏托盘会通知，避免误以为闪退 |
| 完成后通知 | 失焦、托盘、后台会话都会弹系统通知；点击回到对应会话 |
| 任务栏 | 运行中进度条；完成后闪烁 |
| 窗口记忆 | 大小 / 位置 / 最大化下次启动还原 |
| 开机自启 | 设置可选 |
| 菜单与快捷键 | 标准菜单 + Ctrl+N / , / P / W / Tab / Q |

### 2. 顶栏 UI 统一

- **去掉**状态条上重复的第二个「计划」
- **只保留**右上角计划按钮
- **计划 · 导出 · 重命名 · 删除** 同一工具栏样式（图标 + 文案 + 统一 hover）
- 计划打开时高亮；有条目时显示数字角标

---

## What’s new (English)

### Desktop shell

- System tray with show / new session / settings / quit
- Close-to-tray (default on Windows & Linux); real quit via tray, menu, or **Ctrl+Q**
- Optional minimize-to-tray and launch-at-login
- Focus-aware “session done” notifications (including current session when unfocused)
- Notification click restores window and opens the session
- Taskbar progress while agents run; flash when finished in background
- Persist window bounds and maximized state
- Application menu + product shortcuts
- Single-instance; second launch focuses the existing window
- Dark native theme for title bar chrome

### UI

- Unified top-bar session toolbar: **Plan · Export · Rename · Delete**
- Removed the duplicate Plan control from the live strip
- Consistent icons, spacing, active/badge states for Plan

---

## Upgrade notes / 升级说明

1. 关闭旧版 Grok Desktop（若托盘里还在，右键退出）。
2. 运行新的 Portable 或 Setup。
3. 仍使用本机官方 `grok` CLI 登录与额度，桌面端不单独账号。
4. 桌面设置在：`%APPDATA%\grok-desktop\settings.json`（Windows）。

---

## Downloads / 下载

Build locally:

```bash
npm install
npm run dist:win:portable   # portable
npm run dist:win:setup      # installer
```

Artifacts:

- `release/Grok-Desktop-0.8.7-Windows-Portable-x64.exe`
- `release/Grok-Desktop-0.8.7-Windows-Setup-x64.exe` (after setup build)

---

## Known limitations

- SmartScreen may warn on unsigned community builds (code signing not included).
- Update check opens GitHub only; no silent auto-install yet.
- Jump lists / auto-updater are not in this release.

---

## Full changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete entry.
