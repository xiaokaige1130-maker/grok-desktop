# Grok Desktop（Linux）

<p align="center">
  <img src="docs/screenshots/app-icon.png" width="96" alt="Grok Desktop 图标" />
</p>

<p align="center">
  <strong>Grok Build 的 Linux 独立桌面端</strong><br/>
  用 Electron 对接官方 <code>grok</code> CLI（ACP），中文界面 · 多会话并行 · 插话引导 · 可换壁纸
</p>

<p align="center">
  <a href="https://github.com/xiaokaige1130-maker/linux-grok-desktop"><img src="https://img.shields.io/badge/GitHub-linux--grok--desktop-8b5cf6?style=flat-square" alt="repo" /></a>
  <img src="https://img.shields.io/badge/platform-Linux-0a0a0c?style=flat-square" alt="platform" />
  <img src="https://img.shields.io/badge/version-0.6.0-22c55e?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/license-see%20repo-64748b?style=flat-square" alt="license" />
</p>

<p align="center">
  <img src="docs/screenshots/hero.jpg" width="100%" alt="Grok Desktop 横幅" />
</p>

---

## 界面预览

### 主界面

左侧按项目分组的**最近会话**，中间对话区，右侧可选**计划面板**；底部输入框支持模型/强度切换。

![主界面](docs/screenshots/main-ui.png)

### 多会话与工作区

支持同时打开多个会话并行跑任务；左侧可看到**运行中转圈**、**完成后绿点**。

![工作区宽屏](docs/screenshots/main-ui-wide.png)

### 插话：排队 +「引导」

任务进行中时：

1. 在输入框写纠正内容，按 **Enter** → 只进入**排队**（不打断当前任务）  
2. 可继续改、删除排队里的条目  
3. 确认没问题后，点排队气泡上的 **「引导」** → **打断**当前轮，立刻发送，助手马上读到  

> 类似 CLI 里发现不对就改口，但多了一步「先排着、确认再引导」，避免误发。

### 聊天背景（壁纸）

**设置 → 外观 → 聊天背景**：渐变预设 + 黑白航天主题 + 自选图片，并支持**背景压暗**。

| X 标志 | 火箭 | 轨道 | SPACE | 多级箭体 |
|:---:|:---:|:---:|:---:|:---:|
| ![](docs/screenshots/wp-x-mark-preview.jpg) | ![](docs/screenshots/wp-rocket-preview.jpg) | ![](docs/screenshots/wp-orbit-preview.jpg) | ![](docs/screenshots/wp-space-type-preview.jpg) | ![](docs/screenshots/wp-stack-preview.jpg) |

---

## 功能一览

| 模块 | 说明 |
|------|------|
| **会话** | 列表 / 恢复 / 重命名 / 智能起名 / 导出 / 删除 |
| **多会话并行** | 后台 agent 池，左侧切换即可；运行中转圈、完成后绿点 |
| **插话引导** | Enter 排队 → 点「引导」打断并立刻发送 |
| **工具与 Diff** | 写文件时展示行级差异，可打开/定位文件 |
| **全文搜索** | 侧栏搜索标题与历史内容，点开可高亮定位 |
| **计划面板** | Plan 模式条目展示（状态中文） |
| **Skills / 插件 / MCP / 记忆** | 设置与侧栏入口 |
| **外观** | 密度、聊天壁纸、压暗 |
| **中文 UI** | 菜单、状态、计划/工具状态文案中文化 |

---

## 环境要求

- **系统**：Linux（推荐 Ubuntu 22.04+ / 同类发行版）  
- **Node.js**：18+（从源码运行 / 打包时需要）  
- **Grok CLI**：已安装并完成登录（[官方 CLI](https://x.ai/cli)）  

本仓库是**桌面壳**，不替代官方 CLI；登录态与模型能力仍在本机 `~/.grok/`。

---

## 快速开始

### 从源码运行

```bash
git clone https://github.com/xiaokaige1130-maker/linux-grok-desktop.git
cd linux-grok-desktop
npm install
npm start
# 或
./scripts/run.sh
```

可选：安装本机快捷方式（开发目录）：

```bash
./scripts/install-desktop.sh
```

### 用安装包

打包后生成（`release/` 目录，默认不入库）：

```bash
npm install
npm run dist          # AppImage + deb
# 或
npm run dist:deb
npm run dist:appimage
```

| 产物 | 用法 |
|------|------|
| `release/linux-grok-desktop_0.6.0_amd64.deb` | `sudo dpkg -i …` ，缺依赖时 `sudo apt-get install -f` |
| `release/Grok-Desktop-0.6.0-x86_64.AppImage` | `chmod +x` 后双击或命令行运行 |

安装包**不包含** Grok CLI，使用前请先安装并 `grok login`。

### 冒烟测试

```bash
npm run smoke
# 或
node scripts/smoke-test.js
```

---

## 日常使用提示

### 会话状态（左侧列表）

| 状态 | 显示 |
|------|------|
| 运行中 | 标题前小圈旋转 +「运行中」 |
| 刚完成 | **绿点** +「已完成」 |
| 点开该会话 | 绿点清除 |

### 插话流程（任务进行中）

```
写纠正 → Enter（排队）→ 可改/删 → 点「引导」→ 打断并发送 → 助手按新话继续
```

### 换壁纸

**设置 → 外观 → 聊天背景** → 点选预设或「图」自选本地图片 → 可调「背景压暗」。

---

## 项目结构

```
linux-grok-desktop/
├── main.js              # Electron 主进程（多 agent、IPC）
├── preload.js           # 预加载桥
├── renderer/            # 界面（HTML / CSS / app.js）
├── src/                 # ACP、会话、搜索、diff、设置、插件等
├── assets/              # 图标、壁纸预设
├── docs/screenshots/    # README 截图
├── scripts/             # 启动、安装快捷方式、冒烟测试
└── package.json         # 依赖与 electron-builder 配置
```

---

## 数据与隐私

- 会话与 CLI 数据：默认在 `~/.grok/`  
- 桌面端设置：`~/.config/linux-grok-desktop/settings.json`  
- 本仓库不收集账号；鉴权完全走本机官方 CLI  

---

## 常见问题

**Q：打不开 / 连不上 agent？**  
A：确认 `grok` 在 PATH 或 `~/.local/bin/grok`，且已登录；终端执行 `grok --version` 检查。

**Q：插话后助手没马上听？**  
A：Enter 只是排队；必须点气泡上的 **「引导」** 才会打断并发送。

**Q：壁纸没变化？**  
A：完全退出再开；在外观里点预设色块；可调压暗。安装版需包含 `assets/wallpapers/`。

**Q：和官方 TUI 的关系？**  
A：桌面端通过 ACP 调同一套 `grok agent`；能力与配额以官方 CLI/账号为准。

---

## 贡献与反馈

Issue / PR 欢迎：  
https://github.com/xiaokaige1130-maker/linux-grok-desktop

---

## 许可与声明

- 按本仓库声明使用。  
- 与 xAI / Grok 官方产品条款独立。  
- 壁纸预设为风格化航天/X 美学图，**非**官方商标复制。  
- 本项目为社区桌面壳，**非** xAI 官方产品。
