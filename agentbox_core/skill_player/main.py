from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

SKILL_DIR = Path(__file__).resolve().parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

from agentbox_runtime.errors import map_exception
from agentbox_runtime.player_logic import PlayerRuntime
from agentbox_runtime.results import error_result


_RUNTIME: Optional[PlayerRuntime] = None


def _runtime() -> PlayerRuntime:
    global _RUNTIME
    if _RUNTIME is None:
        _RUNTIME = PlayerRuntime()
    return _RUNTIME


def manifest() -> Dict[str, Any]:
    path = Path(__file__).with_name("manifest.json")
    return json.loads(path.read_text())


def list_tools() -> List[Dict[str, Any]]:
    try:
        return _runtime().list_tools()
    except Exception:
        runtime = PlayerRuntime.__new__(PlayerRuntime)
        try:
            return [tool.to_manifest() for tool in runtime._build_tools()]
        except Exception:
            return []


def invoke(tool_name: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        return _runtime().invoke(tool_name, payload)
    except Exception as exc:
        return error_result(tool_name, map_exception(exc))
