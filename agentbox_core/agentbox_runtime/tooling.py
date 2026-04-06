from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


Handler = Callable[[Any, dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Handler

    def to_manifest(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }
