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
class SignerRecord:
    signer_id: str
    address: str
    status: str
    created_at: str
    updated_at: str
    private_key: str
    label: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "SignerRecord":
        return cls(
            signer_id=payload["signer_id"],
            address=payload["address"],
            status=payload["status"],
            created_at=payload["created_at"],
            updated_at=payload["updated_at"],
            private_key=payload["private_key"],
            label=payload.get("label"),
        )


class SignerStore:
    def __init__(self, settings: PlayerSettings) -> None:
        self.settings = settings
        self.store_dir = settings.signer_store_dir()
        self.record_path = self.store_dir / "active_signer.json"

    def _ensure_store_dir(self) -> None:
        self.store_dir.mkdir(parents=True, exist_ok=True)

    def save_record(self, record: SignerRecord) -> None:
        self._ensure_store_dir()
        self.record_path.write_text(json.dumps(record.to_dict(), indent=2, sort_keys=True))

    def load_record(self, signer_id: Optional[str] = None) -> SignerRecord:
        if not self.record_path.exists():
            raise precheck_error("UNKNOWN_SIGNER_ID", "Signer was not found")
        payload = json.loads(self.record_path.read_text())
        record = SignerRecord.from_dict(payload)
        if signer_id is not None and record.signer_id != signer_id:
            raise precheck_error(
                "UNKNOWN_SIGNER_ID",
                "Signer was not found",
                {"signerId": signer_id},
            )
        return record

    def list_records(self) -> List[SignerRecord]:
        if not self.record_path.exists():
            return []
        return [self.load_record()]

    def active_signer_id(self) -> Optional[str]:
        if not self.record_path.exists():
            return None
        return self.load_record().signer_id

    def _build_record(self, account: LocalAccount, *, label: Optional[str]) -> SignerRecord:
        timestamp = _utc_now()
        return SignerRecord(
            signer_id=datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f"),
            address=account.address,
            status="active",
            created_at=timestamp,
            updated_at=timestamp,
            private_key=account.key.hex(),
            label=label,
        )

    def create_signer(self, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        account = Account.create()
        return self.ensure_account(account, label=label, activate=activate)

    def ensure_account(self, account: LocalAccount, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        existing = self.find_by_address(account.address)
        if existing is not None:
            if label is not None:
                existing.label = label
            existing.private_key = account.key.hex()
            existing.status = "active"
            existing.updated_at = _utc_now()
            self.save_record(existing)
            return existing
        record = self._build_record(account, label=label)
        self.save_record(record)
        return record

    def import_signer(self, private_key: str, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        account = Account.from_key(private_key)
        return self.ensure_account(account, label=label, activate=activate)

    def export_signer(self) -> SignerRecord:
        return self.load_record()

    def find_by_address(self, address: str) -> Optional[SignerRecord]:
        if not self.record_path.exists():
            return None
        record = self.load_record()
        if record.address.lower() == address.lower():
            return record
        return None

    def activate(self, signer_id: str) -> SignerRecord:
        record = self.load_record(signer_id)
        if record.status != "active":
            record.status = "active"
            record.updated_at = _utc_now()
            self.save_record(record)
        return record

    def load_account(self, signer_id: Optional[str] = None) -> Tuple[SignerRecord, LocalAccount]:
        record = self.load_record(signer_id)
        return record, Account.from_key(record.private_key)

    def load_active_account(self) -> Tuple[Optional[SignerRecord], Optional[LocalAccount]]:
        if not self.record_path.exists():
            return None, None
        record = self.load_record()
        account = Account.from_key(record.private_key)
        if record.status != "active":
            record.status = "active"
            record.updated_at = _utc_now()
            self.save_record(record)
        return record, account


class SignerService:
    def __init__(self, settings: PlayerSettings) -> None:
        self.store = SignerStore(settings)

    def prepare_signer(self, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        return self.store.create_signer(label=label, activate=activate)

    def import_signer(self, private_key: str, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        return self.store.import_signer(private_key, label=label, activate=activate)

    def export_signer(self) -> SignerRecord:
        return self.store.export_signer()

    def ensure_account(self, account: LocalAccount, *, label: Optional[str] = None, activate: bool = True) -> SignerRecord:
        return self.store.ensure_account(account, label=label, activate=activate)

    def activate(self, signer_id: str) -> SignerRecord:
        return self.store.activate(signer_id)

    def list_signers(self) -> List[SignerRecord]:
        return self.store.list_records()

    def load_active_account(self) -> Tuple[Optional[SignerRecord], Optional[LocalAccount]]:
        return self.store.load_active_account()
