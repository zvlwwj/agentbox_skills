---
name: agentbox-hermes-installer
description: 当用户要求为 Hermes 下载、安装、修复或更新 Agentbox 时，下载并安装完整 Agentbox Hermes bundle。
platforms: [macos]
metadata:
  hermes:
    requires_toolsets: [terminal, file, skills]
    requires_tools: [terminal, read_file, write_file]
---

# Agentbox Hermes Installer

当用户要求安装、下载、配置、修复或更新 Hermes 版 Agentbox 时使用这个 skill。

## 目标

安装完整 Agentbox Hermes bundle，包括：

- `agentbox-hermes` CLI
- Agentbox Hermes 游戏 skill
- runtime 文件
- local bridge
- macOS LaunchAgent 服务

这个 installer skill 只是启动安装流程的轻量入口。完整 Agentbox Hermes 能力来自下载后的 bundle。

## 默认下载源

默认从下面地址下载最新 release：

```text
https://github.com/zvlwwj/agentbox_skills/releases/latest/download/agentbox-hermes.zip
```

如果下载失败，应说明具体失败原因，并询问用户是否提供其他 Agentbox Hermes bundle URL 或本地 zip 路径。

## 安装位置

使用：

```text
~/.hermes/agentbox/bundle/agentbox-hermes
```

不要删除 `~/.hermes/agentbox/` 下的用户运行时数据，尤其是 signer、active role、operation state 和 bridge token 文件。

## 安装步骤

用 terminal 工具执行：

```bash
set -e
mkdir -p ~/.hermes/agentbox/bundle
curl -L -o /tmp/agentbox-hermes.zip https://github.com/zvlwwj/agentbox_skills/releases/latest/download/agentbox-hermes.zip
rm -rf ~/.hermes/agentbox/bundle/agentbox-hermes
unzip -q /tmp/agentbox-hermes.zip -d ~/.hermes/agentbox/bundle
cd ~/.hermes/agentbox/bundle/agentbox-hermes
npm install --omit=dev --ignore-scripts
python3 scripts/install_hermes_skills.py
```

## 验证

安装后验证：

```bash
~/.hermes/bin/agentbox-hermes --help
~/.hermes/bin/agentbox-hermes bridge status
```

如果验证成功，告诉用户重启 Hermes 或打开新的 Hermes session，让新安装的 `agentbox-hermes-skills` 被发现。

## 修复 / 更新

如果用户要求修复或更新 Agentbox，重复安装步骤即可。只要保留 `~/.hermes/agentbox/` 运行时数据，替换 bundle 目录是安全的。

## 规则

- 除非自动下载失败，否则不要要求用户手动下载文件。
- 不要删除 `~/.hermes/agentbox/active_signer.json`、角色文件、operation 文件、bridge 配置或其他运行时数据。
- 安装流程中不要继续执行游戏动作。
- 如果 `npm install` 因代理或 registry 设置失败，应检查 npm 日志并解释具体原因。
