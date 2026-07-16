# Grok Desktop

<p align="center">
  <img src="docs/screenshots/app-icon.png" width="96" alt="Grok Desktop icon" />
</p>

<p align="center">
  <strong>Standalone Linux desktop for Grok Build</strong><br/>
  Electron shell over the official <code>grok</code> CLI (ACP) · multi-session · plan panel · zh/en · product-ready permissions
</p>

<p align="center">
  <strong>Grok Build 的 Linux 独立桌面端</strong><br/>
  官方 <code>grok</code> CLI（ACP）外壳 · 多会话并行 · 计划面板 · 中英界面 · 可上线的权限模式
</p>

<p align="center">
  <a href="https://github.com/xiaokaige1130-maker/linux-grok-desktop"><img src="https://img.shields.io/badge/GitHub-linux--grok--desktop-8b5cf6?style=flat-square" alt="repo" /></a>
  <img src="https://img.shields.io/badge/platform-Linux-0a0a0c?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/version-0.8.0-22c55e?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/i18n-zh%20%7C%20en-3b82f6?style=flat-square" alt="i18n" />
  <img src="https://img.shields.io/badge/license-see%20repo-64748b?style=flat-square" alt="license" />
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#中文">中文</a> ·
  <a href="https://github.com/xiaokaige1130-maker/linux-grok-desktop/releases">Releases</a>
</p>

<p align="center">
  <img src="docs/screenshots/hero.jpg" width="100%" alt="Grok Desktop banner" />
</p>

> **Not an official xAI product.** Community desktop shell. Auth, models, and quotas stay on your machine via the official CLI.  
> **非 xAI 官方产品。** 社区桌面壳；登录、模型与配额仍走本机官方 CLI。

---

<a id="english"></a>

## English

### Why Grok Desktop?

xAI’s Grok Build / CLI is powerful in the terminal. Many people want a **native window**: session list, parallel agents, diffs, plan checklist, wallpapers, and clear permission modes — without leaving Linux.

Grok Desktop is that shell:

| Pillar | What you get |
|--------|----------------|
| **Real agent** | Talks to official `grok agent` over ACP — same backend as the TUI |
| **Multi-session** | Run several chats in parallel; sidebar shows working / done |
| **Steer mid-flight** | Enter = **queue**; **Guide** = interrupt & send (CLI-like “change of mind”) |
| **Plan panel** | Top-bar **Plan** button (always visible in a session) + badge + `P` shortcut |
| **Permissions** | **Approval / Smart / Full access** — product-safe defaults |
| **i18n** | **中文 / English** in Settings → General |
| **Polish** | Wallpapers, notifications when background work finishes, update check |

**Roadmap:** Linux first (this repo) → macOS & Windows later.

### Screenshots

#### Main UI

Sidebar sessions by project, center thread, composer with model / effort.

![Main UI](docs/screenshots/main-ui.png)

#### Wide workspace

Parallel work, status strip, optional plan side panel.

![Wide workspace](docs/screenshots/main-ui-wide.png)

#### Queue + Guide

While the agent is working:

1. Type a correction → **Enter** → only **queues** (does not interrupt)  
2. Edit or delete queued items  
3. Click **Guide** on the bubble → **interrupt** and send immediately  

![Queue / Guide reference](docs/screenshots/queue-guide-ref.png)

#### Wallpapers

**Settings → Appearance**: gradients + space-themed presets + custom image + dim.

| X mark | Rocket | Orbit | SPACE | Stack |
|:---:|:---:|:---:|:---:|:---:|
| ![](docs/screenshots/wp-x-mark-preview.jpg) | ![](docs/screenshots/wp-rocket-preview.jpg) | ![](docs/screenshots/wp-orbit-preview.jpg) | ![](docs/screenshots/wp-space-type-preview.jpg) | ![](docs/screenshots/wp-stack-preview.jpg) |

### Feature matrix

| Area | Details |
|------|---------|
| **Sessions** | List / resume / rename / export / delete; smart titles |
| **Parallel agents** | Soft tab switch; spinner = running; green dot = done |
| **Steer** | Queue + Guide interrupt-and-send |
| **Plan** | Top-bar Plan + badge count + progress `done/total` + key `P` |
| **Diffs** | Line-level file diffs when tools write files |
| **Search** | Sidebar full-text over titles & history |
| **Permissions** | Approval · Smart (recommended) · Full access · optional YOLO |
| **Memory / Skills / Plugins / MCP** | Wired to real CLI surfaces |
| **Notifications** | Optional OS notify when a **background** session finishes |
| **Updates** | Optional GitHub Release check on launch |
| **Setup wizard** | First-run CLI + login diagnose |
| **Language** | zh / en |

### Access modes (permissions)

| Mode | Behavior | Best for |
|------|----------|----------|
| **Approval** | Confirm before writes / shell | Untrusted repos |
| **Smart** ★ | Auto-allow routine tools; still prompt on risk | Daily use |
| **Full access** | Auto-approve tools by default | Trusted local projects |
| **YOLO** (under Full) | More aggressive auto-run | Only if you fully trust the env |

Change anytime: **Settings → Permissions**.

### Requirements

- **OS:** Linux (Ubuntu 22.04+ recommended)  
- **Node.js 18+** (source / packaging only)  
- **Official Grok CLI** installed & logged in: [x.ai/cli](https://x.ai/cli)

This repo is **only the desktop shell**. Login state lives under `~/.grok/`.

### Install

#### From Release (recommended)

1. Open [Releases](https://github.com/xiaokaige1130-maker/linux-grok-desktop/releases)  
2. Download `linux-grok-desktop_*_amd64.deb`  
3. Install:

```bash
sudo dpkg -i linux-grok-desktop_0.8.0_amd64.deb
# if dependencies missing:
sudo apt-get install -f
```

Or use the AppImage: `chmod +x Grok-Desktop-*-x86_64.AppImage && ./Grok-Desktop-*-x86_64.AppImage`

#### From source

```bash
git clone https://github.com/xiaokaige1130-maker/linux-grok-desktop.git
cd linux-grok-desktop
npm install
npm start
# optional desktop shortcut for the dev tree:
./scripts/install-desktop.sh
```

#### Build packages

```bash
npm run dist:deb       # .deb
npm run dist:appimage  # AppImage
npm run dist           # both
```

Artifacts land in `release/` (not committed).

### First-run checklist

1. Install CLI: `curl -fsSL https://x.ai/cli/install.sh | bash` (or your preferred method)  
2. `grok login` (or `grok login --oauth`)  
3. Launch **Grok Desktop** — setup overlay re-checks CLI + login  
4. **New chat** → pick a workspace folder → start building  

### Everyday tips

| Topic | Tip |
|-------|-----|
| **Sidebar status** | Spinner = working · green dot = finished (clears when you open it) |
| **Queue vs Guide** | Enter only queues; Guide interrupts |
| **Plan** | Click **Plan** in the top bar (or press `P`) |
| **Language** | Settings → General → Language |
| **Permissions** | Settings → Permissions → pick a mode |
| **Wallpaper** | Settings → Appearance |

### Project layout

```
linux-grok-desktop/
├── main.js           # Electron main (multi-agent pool, IPC, notify, update)
├── preload.js        # Safe bridge
├── renderer/         # UI (HTML / CSS / app.js / i18n.js)
├── src/              # ACP client, sessions, search, diff, settings, plugins…
├── assets/           # Icons & wallpaper presets
├── docs/screenshots/ # README images
├── scripts/          # run / install-desktop / smoke
└── package.json      # electron-builder
```

### Privacy

- CLI / sessions: `~/.grok/`  
- Desktop settings: `~/.config/linux-grok-desktop/settings.json`  
- No account telemetry from this app; auth is the official CLI’s job  

### FAQ

**Won’t connect / agent dies?**  
Ensure `grok` is on `PATH` or `~/.local/bin/grok`, and you are logged in. Run `grok --version`.

**Guide didn’t interrupt?**  
Enter only queues. You must click **Guide** on the queue bubble.

**Plan button missing?**  
Open a session first — Plan sits in the top bar next to Export / Rename.

**Wallpaper unchanged?**  
Fully quit and reopen; pick a swatch under Appearance; adjust dim. Packaged builds include `assets/wallpapers/`.

**Relation to official TUI?**  
Same `grok agent` backend over ACP. Quotas and model availability follow your xAI account / CLI.

### Contributing

Issues & PRs welcome:  
https://github.com/xiaokaige1130-maker/linux-grok-desktop

### License & notice

- Use per this repository’s terms.  
- Independent of xAI / Grok official product terms.  
- Wallpaper presets are stylized aerospace / X aesthetics — **not** trademark replicas.  
- **Community project, not an official xAI product.**

---

<a id="中文"></a>

## 中文

### 为什么做桌面版？

Grok Build / CLI 在终端里很强，但很多人希望有一个**独立窗口**：会话列表、多 agent 并行、Diff、计划清单、壁纸，以及清晰的权限策略——而且先把 **Linux** 打磨到可上线，再做 Mac / Windows。

| 支柱 | 你得到什么 |
|------|------------|
| **真实 Agent** | 对接官方 `grok agent`（ACP），能力与 TUI 同源 |
| **多会话** | 同时跑多个对话；侧栏显示运行中 / 已完成 |
| **插话引导** | Enter = **排队**；**引导** = 打断并立刻发送 |
| **计划面板** | 顶栏 **计划** 按钮（有会话就始终可见）+ 数量角标 + 快捷键 `P` |
| **权限模式** | **审批 / 智能 / 完全访问**，产品级默认策略 |
| **中英界面** | 设置 → 常规 → 界面语言 |
| **体验** | 壁纸、后台完成通知、启动检查更新、首次环境引导 |

### 界面预览

#### 主界面

![主界面](docs/screenshots/main-ui.png)

#### 宽屏工作区

![工作区宽屏](docs/screenshots/main-ui-wide.png)

#### 排队 + 引导

任务进行中：

1. 写纠正 → **Enter** → 只**排队**（不打断）  
2. 可改 / 删排队  
3. 点气泡 **「引导」** → **打断**并立刻发送  

![排队引导示意](docs/screenshots/queue-guide-ref.png)

#### 聊天背景

**设置 → 外观**：渐变 + 航天主题 + 自选图 + 压暗。

### 功能一览

| 模块 | 说明 |
|------|------|
| **会话** | 列表 / 恢复 / 重命名 / 导出 / 删除 |
| **多会话并行** | 运行中转圈、完成后绿点 |
| **插话引导** | Enter 排队 → 引导打断发送 |
| **计划** | 顶栏计划按钮 + 角标 + 进度 + `P` |
| **Diff** | 写文件时行级差异 |
| **全文搜索** | 侧栏搜标题与历史 |
| **权限** | 审批 · 智能（推荐）· 完全访问 · 可选 YOLO |
| **记忆 / Skills / 插件 / MCP** | 对接真实 CLI |
| **通知 / 更新 / 首次引导** | 可关的产品能力 |
| **语言** | 中文 / English |

### 访问模式（权限）

| 模式 | 行为 | 适用 |
|------|------|------|
| **审批模式** | 写文件 / 跑命令前确认 | 陌生仓库 |
| **智能模式** ★ | 常规工具自动放行，高风险仍提示 | 日常推荐 |
| **完全访问** | 工具默认自动批准 | 可信本机项目 |
| **YOLO**（完全访问下） | 更激进自动执行 | 仅完全信任的环境 |

路径：**设置 → 权限**。

### 环境要求

- **系统**：Linux（推荐 Ubuntu 22.04+）  
- **Node.js 18+**（源码运行 / 打包）  
- **官方 Grok CLI** 已安装并登录：[x.ai/cli](https://x.ai/cli)

本仓库只是**桌面壳**，登录态在 `~/.grok/`。

### 安装

#### 安装包（推荐）

1. 打开 [Releases](https://github.com/xiaokaige1130-maker/linux-grok-desktop/releases)  
2. 下载 `linux-grok-desktop_*_amd64.deb`  
3. 安装：

```bash
sudo dpkg -i linux-grok-desktop_0.8.0_amd64.deb
sudo apt-get install -f   # 如有依赖问题
```

#### 源码运行

```bash
git clone https://github.com/xiaokaige1130-maker/linux-grok-desktop.git
cd linux-grok-desktop
npm install
npm start
```

#### 自己打包

```bash
npm run dist:deb
npm run dist:appimage
```

产物在 `release/`。

### 首次使用

1. 安装 CLI 并 `grok login`  
2. 启动 Grok Desktop，按引导检测环境  
3. **新对话** → 选工作目录 → 开始  

### 日常提示

| 主题 | 说明 |
|------|------|
| **侧栏状态** | 转圈 = 运行中 · 绿点 = 刚完成 |
| **排队 vs 引导** | Enter 只排队；引导才打断 |
| **计划** | 顶栏点「计划」或按 `P` |
| **语言** | 设置 → 常规 |
| **权限** | 设置 → 权限 |

### 数据与隐私

- 会话 / CLI：`~/.grok/`  
- 桌面设置：`~/.config/linux-grok-desktop/settings.json`  
- 本应用不收集账号；鉴权完全走官方 CLI  

### 常见问题

**连不上 agent？**  
检查 `grok` 是否在 PATH，是否已登录：`grok --version`。

**引导没生效？**  
Enter 只排队，必须点排队气泡上的 **引导**。

**找不到计划按钮？**  
先打开一个会话；按钮在顶栏右侧（导出 / 重命名旁边），有条目时显示数量角标。

**和官方 TUI 的关系？**  
同一套 `grok agent` + ACP；额度与模型以账号 / CLI 为准。

### 贡献

欢迎 Issue / PR：  
https://github.com/xiaokaige1130-maker/linux-grok-desktop

### 许可与声明

- 按本仓库声明使用。  
- 与 xAI / Grok 官方产品条款独立。  
- 壁纸为风格化航天美学图，**非**官方商标复制。  
- **社区桌面壳，非 xAI 官方产品。**

---

## Changelog (recent)

### 0.8.0

- Plan button moved to top bar (always visible in session) + badge + `P`  
- Product access modes: Approval / Smart / Full access  
- i18n: Chinese & English  
- Settings layout cleanup  
- README bilingual + install docs  

### 0.7.0

- First-run setup, done notifications, update check, shortcuts help  
