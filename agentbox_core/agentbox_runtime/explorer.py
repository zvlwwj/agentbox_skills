from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .errors import precheck_error, rpc_error


@dataclass
class ExplorerVerificationClient:
    api_key: str
    api_url: str
    browser_base_url: str
    timeout_seconds: int = 15

    def __post_init__(self) -> None:
        if not self.api_key:
            raise precheck_error("MISSING_EXPLORER_API_KEY", "EXPLORER_API_KEY is required for contract verification")
        if not self.api_url:
            raise precheck_error("MISSING_EXPLORER_API_URL", "EXPLORER_API_URL is required for contract verification")
        if not self.browser_base_url:
            raise precheck_error("MISSING_EXPLORER_BROWSER_BASE_URL", "EXPLORER_BROWSER_BASE_URL is required for contract verification")

    def _post_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = urlencode(payload).encode("utf-8")
        request = Request(self.api_url, data=body, method="POST")
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise rpc_error("EXPLORER_HTTP", f"Explorer verification request failed with status {exc.code}") from exc
        except URLError as exc:
            raise rpc_error("EXPLORER_UNAVAILABLE", f"Unable to reach explorer API: {self.api_url}") from exc
        except json.JSONDecodeError as exc:
            raise rpc_error("EXPLORER_INVALID_JSON", "Explorer API returned invalid JSON") from exc

    def submit_verification(
        self,
        *,
        contract_address: str,
        source_code: str,
        contract_name: str,
        compiler_version: str,
        optimization_used: bool,
        runs: int,
        constructor_arguments: str = "",
    ) -> dict[str, Any]:
        payload = {
            "module": "contract",
            "action": "verifysourcecode",
            "apikey": self.api_key,
            "contractaddress": contract_address,
            "sourceCode": source_code,
            "contractname": contract_name,
            "compilerversion": compiler_version,
            "optimizationUsed": 1 if optimization_used else 0,
            "runs": runs,
            "constructorArguements": constructor_arguments,
            "codeformat": "solidity-single-file",
        }
        return self._post_form(payload)

    def build_contract_url(self, contract_address: str) -> str:
        return f"{self.browser_base_url.rstrip('/')}/address/{contract_address}"
