# Grok Desktop · v0.4

可发布向的 Grok Build 独立桌面端（Linux）。  
**不用手动开 CLI 界面**——启动窗口即可对话；底层自动调用本机 `grok` agent。

与终端共用：`~/.grok/sessions` · `~/.grok/memory` · skills · plugins · `config.toml`。

## 第一次用

1. 安装并登录 CLI：`grok login`（只需一次）
2. 启动桌面：

```bash
cd ~/linux-grok-desktop && npm start
# 或安装菜单项后
./scripts/install-desktop.sh && grok-desktop
```

3. 点 **新对话** 选项目目录，或点左侧历史会话继续

## 功能一览

| 模块 | 说明 |
|------|------|
| **对话** | 项目分组会话、恢复、流式回复、重命名/删除 |
| **图片** | 粘贴 / 拖入 / 附件；展示生成图 |
| **记忆** | 启用开关、浏览/编辑 MEMORY.md、清空 |
| **Skills** | 浏览、预览、新建、打开目录 |
| **插件** | 已安装 / 市场、安装启用禁用卸载 |
| **设置** | 模型、权限、密度、记忆、路径信息 |

## 验证

```bash
npm run smoke
```

## 架构

```
Electron
 ├─ main + src/{sessions,acp,memory,skills,plugins,settings}
 └─ renderer 多视图：对话 | 记忆 | Skills | 插件 | 设置
```
