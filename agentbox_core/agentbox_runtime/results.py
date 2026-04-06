from __future__ import annotations

from typing import Any, Dict, Optional

from .errors import AgentboxSkillError


def success_result(
    action: str,
    summary: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    tx_hash: Optional[str] = None,
    chain_id: Optional[int] = None,
    block_number: Optional[int] = None,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "ok": True,
        "action": action,
        "summary": summary,
        "data": data or {},
    }
    if tx_hash is not None:
        result["txHash"] = tx_hash
    if chain_id is not None:
        result["chainId"] = chain_id
    if block_number is not None:
        result["blockNumber"] = block_number
    return result


def error_result(action: str, error: AgentboxSkillError) -> Dict[str, Any]:
    payload = {
        "ok": False,
        "action": action,
        **error.to_dict(),
    }
    payload.setdefault("txHash", None)
    return payload
