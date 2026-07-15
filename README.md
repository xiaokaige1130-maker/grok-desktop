# Grok Desktop（Linux）

Grok Build 的 Linux 桌面壳：用 Electron 接官方 `grok` CLI（ACP），提供中文界面、会话列表、多会话并行与更顺手的日常操作。

## 功能概览

- 会话列表 / 恢复 / 重命名 / 导出
- 多会话并行（后台 agent 池，左侧切换即可）
- 插话排队（任务进行中可排队补充指示）
- 工具与文件 diff 预览
- 全文搜索、计划面板
- Skills / 插件 / MCP / 记忆入口

## 环境要求

- Linux（推荐 Ubuntu 22.04+）
- Node.js 18+
- 已安装 [Grok CLI](https://x.ai/cli) 并完成登录

## 运行

```bash
cd linux-grok-desktop
npm install
npm start
# 或
./scripts/run.sh
```

安装桌面快捷方式（可选）：

```bash
./scripts/install-desktop.sh
```

## 冒烟测试

```bash
npm run smoke
# 或
node scripts/smoke-test.js
```

## 打包安装包

需本机 Node.js 18+，会生成 `release/` 下的 AppImage 与 deb（该目录已 gitignore，不入库）。

```bash
npm install
npm run dist          # AppImage + deb
# 或
npm run dist:appimage
npm run dist:deb
```

产物示例：

- `release/Grok-Desktop-0.6.0-x86_64.AppImage` — 免安装，`chmod +x` 后运行  
- `release/linux-grok-desktop_0.6.0_amd64.deb` — `sudo dpkg -i …` 安装  

安装包**不包含** Grok CLI，使用前请先安装并登录官方 `grok`。

## 说明

- 本仓库为独立桌面壳，**不替代**官方 CLI；鉴权与模型能力仍由本机 `grok` 提供。
- 私有数据（会话、配置）默认在 `~/.grok/`。

## 许可

按仓库内声明使用；与 xAI / Grok 官方产品条款独立。
