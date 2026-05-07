import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBridgeConfigSchema, registerBridge } from "./bridge.js";
import { JSPlayerRuntime } from "./runtime/player-runtime.js";

const runtimeCache = new Map();
const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const INTERNAL_BRIDGE_ONLY_TOOLS = new Set([
  "agentbox.signer.prepare",
  "agentbox.signer.import",
  "agentbox.signer.export",
  "agentbox.signer.read",
  "agentbox.registration.confirm",
  "agentbox.roles.list_owned",
  "agentbox.roles.read_active",
  "agentbox.roles.select_active",
  "agentbox.roles.clear_active",
]);

function getRuntime(pluginRoot) {
  const key = pluginRoot || process.cwd();
  if (!runtimeCache.has(key)) runtimeCache.set(key, new JSPlayerRuntime(key));
  return runtimeCache.get(key);
}

function formatToolResult(result) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    details: result,
  };
}

function pluginToolName(name) {
  return name.replaceAll(".", "_");
}

export default {
  id: "agentbox-skills",
  name: "Agentbox Skills",
  description: "OpenClaw plugin exposing Agentbox gameplay tools and a local bridge for web features.",
  configSchema: createBridgeConfigSchema(),
  register(api) {
    const pluginRoot = api.pluginDir || PLUGIN_ROOT;
    const runtime = getRuntime(pluginRoot);
    const tools = runtime.listTools().filter((tool) => !INTERNAL_BRIDGE_ONLY_TOOLS.has(tool.name));
    api.logger?.info?.(`agentbox-skills: registering ${tools.length} tools`);
    for (const tool of tools) {
      api.registerTool({
        name: pluginToolName(tool.name),
        description: tool.description,
        parameters: tool.parameters,
        async execute(_callId, params) {
          const result = await runtime.invoke(tool.name, params ?? {});
          return formatToolResult(result);
        },
      });
    }
    registerBridge(api, runtime);
  },
};
