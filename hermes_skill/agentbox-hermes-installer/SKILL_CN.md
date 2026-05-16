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

## 卸载

当用户要求卸载、移除、清理或重置 Hermes 版 Agentbox 时，使用本节。

默认行为：

- 保留用户运行时数据。
- 停止并移除 local bridge 服务。
- 删除已安装的 bundle 和 CLI shim。
- 除非用户明确要求彻底重置，否则不要删除 signer、role、operation 或 bridge token 文件。

执行：

```bash
set -e
if [ -x ~/.hermes/bin/agentbox-hermes ]; then
  ~/.hermes/bin/agentbox-hermes bridge uninstall-service || true
fi
rm -rf ~/.hermes/agentbox/bundle/agentbox-hermes
rm -f ~/.hermes/bin/agentbox-hermes
```

普通卸载后，告诉用户本地 Agentbox 运行时数据仍然保留在：

```text
~/.hermes/agentbox/
```

## 彻底清理数据

只有当用户明确要求删除私钥、重置全部 Agentbox 数据或彻底移除所有内容时，才使用本节。

执行前必须提醒用户：这会删除本地 signer / 私钥数据，并要求用户明确确认。

仅在用户确认后执行：

```bash
set -e
if [ -x ~/.hermes/bin/agentbox-hermes ]; then
  ~/.hermes/bin/agentbox-hermes bridge uninstall-service || true
fi
rm -rf ~/.hermes/agentbox
rm -f ~/.hermes/bin/agentbox-hermes
```

## 卸载 installer skill 本身

如果用户只是想移除这个 bootstrap skill，执行：

```bash
hermes skills uninstall agentbox-hermes-installer
```

## 规则

- 除非自动下载失败，否则不要要求用户手动下载文件。
- 不要删除 `~/.hermes/agentbox/active_signer.json`、角色文件、operation 文件、bridge 配置或其他运行时数据。
- 安装流程中不要继续执行游戏动作。
- 如果 `npm install` 因代理或 registry 设置失败，应检查 npm 日志并解释具体原因。
- 除非用户明确确认要删除本地私钥数据，否则不要执行彻底清理数据。
