from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class AgentboxSkillError(Exception):
    error_code: str
    message: str
    retryable: bool = False
    data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "errorCode": self.error_code,
            "errorMessage": self.message,
            "retryable": self.retryable,
            "data": self.data or {},
        }


def precheck_error(code: str, message: str, data: Optional[Dict[str, Any]] = None) -> AgentboxSkillError:
    return AgentboxSkillError(f"PRECHECK_{code}", message, retryable=False, data=data)


def rpc_error(code: str, message: str, data: Optional[Dict[str, Any]] = None) -> AgentboxSkillError:
    return AgentboxSkillError(f"RPC_{code}", message, retryable=True, data=data)


def tx_error(code: str, message: str, data: Optional[Dict[str, Any]] = None) -> AgentboxSkillError:
    return AgentboxSkillError(f"TX_{code}", message, retryable=True, data=data)


def revert_error(code: str, message: str, data: Optional[Dict[str, Any]] = None) -> AgentboxSkillError:
    return AgentboxSkillError(f"REVERT_{code}", message, retryable=False, data=data)


def map_exception(exc: Exception) -> AgentboxSkillError:
    if isinstance(exc, AgentboxSkillError):
        return exc

    text = str(exc)
    lowered = text.lower()

    if "execution reverted" in lowered:
        return revert_error("CONTRACT_REVERT", text)
    if "timeout" in lowered:
        return tx_error("TIMEOUT", text)
    if "nonce" in lowered:
        return tx_error("NONCE", text)
    return rpc_error("UNEXPECTED", text)
