from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from eth_account import Account
from eth_account.signers.local import LocalAccount

from .config import PlayerSettings
from .errors import precheck_error


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class CustodyWalletRecord:
    wallet_id: str
    address: str
    status: str
    created_at: str
    updated_at: str
    private_key: str
    role_id: Optional[int] = None
    role_wallet: Optional[str] = None
    registration_tx_hash: Optional[str] = None
    pending_nickname: Optional[str] = None
    pending_gender: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "CustodyWalletRecord":
        return cls(
            wallet_id=payload["wallet_id"],
            address=payload["address"],
            status=payload["status"],
            created_at=payload["created_at"],
            updated_at=payload["updated_at"],
            private_key=payload["private_key"],
            role_id=payload.get("role_id"),
            role_wallet=payload.get("role_wallet"),
            registration_tx_hash=payload.get("registration_tx_hash"),
            pending_nickname=payload.get("pending_nickname"),
            pending_gender=payload.get("pending_gender"),
        )


class WalletStore:
    def __init__(self, settings: PlayerSettings) -> None:
        self.settings = settings
        self.store_dir = settings.custody_store_dir()

    def _ensure_store_dir(self) -> None:
        self.store_dir.mkdir(parents=True, exist_ok=True)

    def _file_path(self, wallet_id: str) -> Path:
        return self.store_dir / f"{wallet_id}.json"

    def create_wallet(self) -> CustodyWalletRecord:
        self._ensure_store_dir()
        account = Account.create()
        wallet_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        timestamp = _utc_now()
        record = CustodyWalletRecord(
            wallet_id=wallet_id,
            address=account.address,
            status="awaiting_funds",
            created_at=timestamp,
            updated_at=timestamp,
            private_key=account.key.hex(),
        )
        self.save_record(record)
        return record

    def load_record(self, wallet_id: str) -> CustodyWalletRecord:
        path = self._file_path(wallet_id)
        if not path.exists():
            raise precheck_error("UNKNOWN_WALLET_ID", "Hosted registration wallet was not found", {"walletId": wallet_id})
        return CustodyWalletRecord.from_dict(json.loads(path.read_text()))

    def save_record(self, record: CustodyWalletRecord) -> None:
        self._ensure_store_dir()
        self._file_path(record.wallet_id).write_text(json.dumps(record.to_dict(), indent=2, sort_keys=True))

    def list_records(self) -> List[CustodyWalletRecord]:
        self._ensure_store_dir()
        items: List[CustodyWalletRecord] = []
        for path in sorted(self.store_dir.glob("*.json")):
            items.append(CustodyWalletRecord.from_dict(json.loads(path.read_text())))
        return items

    def update_record(self, wallet_id: str, **changes: Any) -> CustodyWalletRecord:
        record = self.load_record(wallet_id)
        for key, value in changes.items():
            setattr(record, key, value)
        record.updated_at = _utc_now()
        self.save_record(record)
        return record

    def load_account(self, wallet_id: str) -> Tuple[CustodyWalletRecord, LocalAccount]:
        record = self.load_record(wallet_id)
        return record, Account.from_key(record.private_key)
