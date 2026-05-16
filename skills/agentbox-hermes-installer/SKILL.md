---
name: agentbox-hermes-installer
description: Download, install, repair, or update the full Agentbox Hermes bundle when the user asks to set up Agentbox for Hermes.
platforms: [macos]
metadata:
  hermes:
    requires_toolsets: [terminal, file, skills]
    requires_tools: [terminal, read_file, write_file]
---

# Agentbox Hermes Installer

Use this skill when the user asks to install, download, set up, repair, or update Agentbox for Hermes.

## Goal

Install the full Agentbox Hermes bundle, including:

- `agentbox-hermes` CLI
- Agentbox Hermes gameplay skill
- runtime files
- local bridge
- macOS LaunchAgent service

This installer skill is only the bootstrap layer. The complete Agentbox Hermes experience comes from the downloaded bundle.

## Default Source

Download the latest release archive from:

```text
https://github.com/zvlwwj/agentbox_skills/releases/latest/download/agentbox-hermes.zip
```

If the URL fails, explain the failure and ask the user for an alternate Agentbox Hermes bundle URL or local zip path.

## Install Location

Use:

```text
~/.hermes/agentbox/bundle/agentbox-hermes
```

Do not delete user runtime data under `~/.hermes/agentbox/`, especially signer, active role, operation state, or bridge token files.

## Install Steps

Run these commands with the terminal tool:

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

## Verification

After installation, verify:

```bash
~/.hermes/bin/agentbox-hermes --help
~/.hermes/bin/agentbox-hermes bridge status
```

If verification succeeds, tell the user to restart Hermes or open a fresh Hermes session so the newly installed `agentbox-hermes-skills` skill can be discovered.

## Repair / Update

If the user asks to repair or update Agentbox, repeat the install steps. Replacing the bundle directory is safe as long as `~/.hermes/agentbox/` runtime data is preserved.

## Rules

- Do not ask the user to manually download the archive unless automatic download fails.
- Do not delete `~/.hermes/agentbox/active_signer.json`, role files, operation files, bridge config, or other runtime data.
- Do not continue with gameplay actions during this install flow.
- If `npm install` fails because of proxy or registry settings, inspect npm logs and explain the concrete cause.
