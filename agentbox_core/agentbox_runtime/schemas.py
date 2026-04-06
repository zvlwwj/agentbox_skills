from __future__ import annotations
from typing import Dict, List, Optional


def obj(properties: Dict, required: Optional[List[str]] = None) -> Dict:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


ADDRESS = {"type": "string", "description": "EVM address"}
UINT = {"type": "integer", "minimum": 0}
INT = {"type": "integer"}
STRING = {"type": "string"}
BOOL = {"type": "boolean"}
PROFILE_MODE = {"type": "string", "enum": ["manual", "skip", "auto_generate"]}
READ_SOURCE = {"type": "string", "enum": ["auto", "chain", "indexer"]}


ROLE = {"type": "string", "description": "Role entity reference address"}
TARGET_WALLET = {"type": "string", "description": "Target address for another entity or wallet"}
WALLET_ID = {"type": "string", "description": "Hosted registration wallet id"}
