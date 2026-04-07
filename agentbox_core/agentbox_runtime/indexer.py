from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlencode

import requests

from .errors import rpc_error


@dataclass
class IndexerClient:
    base_url: str
    timeout_seconds: int = 10

    def _build_url(self, path: str, query: Optional[Dict[str, Any]] = None) -> str:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        if query:
            filtered = {key: value for key, value in query.items() if value is not None}
            if filtered:
                url = f"{url}?{urlencode(filtered, doseq=True)}"
        return url

    def get_json(self, path: str, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = self._build_url(path, query=query)
        try:
            response = requests.get(url, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            raise rpc_error("INDEXER_HTTP", f"Indexer request failed with status {status}: {url}") from exc
        except requests.RequestException as exc:
            raise rpc_error("INDEXER_UNAVAILABLE", f"Unable to reach indexer: {url}") from exc
        except ValueError as exc:
            raise rpc_error("INDEXER_INVALID_JSON", f"Indexer returned invalid JSON: {url}") from exc

    def post_json(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = self._build_url(path)
        try:
            response = requests.post(url, json=payload, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "unknown"
            raise rpc_error("INDEXER_HTTP", f"Indexer request failed with status {status}: {url}") from exc
        except requests.RequestException as exc:
            raise rpc_error("INDEXER_UNAVAILABLE", f"Unable to reach indexer: {url}") from exc
        except ValueError as exc:
            raise rpc_error("INDEXER_INVALID_JSON", f"Indexer returned invalid JSON: {url}") from exc

    def get_role_by_wallet(self, role_wallet: str) -> Dict[str, Any]:
        return self.get_json(f"/wallets/{role_wallet}/role")

    def get_global_config(self) -> Dict[str, Any]:
        return self.get_json("/configs/global")

    def get_core_contracts(self) -> Dict[str, Any]:
        return self.get_json("/configs/core-contracts")

    def get_land_by_id(self, land_id: int) -> Dict[str, Any]:
        return self.get_json(f"/lands/{land_id}")

    def get_land_by_coordinate(self, x: int, y: int) -> Dict[str, Any]:
        return self.get_json("/lands", query={"x_min": x, "x_max": x, "y_min": y, "y_max": y, "limit": 1, "offset": 0})

    def list_roles(
        self,
        *,
        x_min: Optional[int] = None,
        x_max: Optional[int] = None,
        y_min: Optional[int] = None,
        y_max: Optional[int] = None,
        state: Optional[str] = None,
        owner_address: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return self.get_json(
            "/roles",
            query={
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max,
                "state": state,
                "owner_address": owner_address,
                "limit": limit,
                "offset": offset,
            },
        )

    def list_lands(
        self,
        *,
        x_min: Optional[int] = None,
        x_max: Optional[int] = None,
        y_min: Optional[int] = None,
        y_max: Optional[int] = None,
        owner_address: Optional[str] = None,
        is_resource_point: Optional[bool] = None,
        has_ground_tokens: Optional[bool] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return self.get_json(
            "/lands",
            query={
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max,
                "owner_address": owner_address,
                "is_resource_point": is_resource_point,
                "has_ground_tokens": has_ground_tokens,
                "limit": limit,
                "offset": offset,
            },
        )

    def get_last_mint(self) -> Dict[str, Any]:
        return self.get_json("/economy/last-mint")

    def list_npc_configs(self, *, limit: int = 500, offset: int = 0) -> Dict[str, Any]:
        return self.get_json("/configs/npcs", query={"limit": limit, "offset": offset})

    def list_recipe_configs(self, *, limit: int = 500, offset: int = 0) -> Dict[str, Any]:
        return self.get_json("/configs/recipes", query={"limit": limit, "offset": offset})

    def list_equipment_configs(self, *, limit: int = 500, offset: int = 0) -> Dict[str, Any]:
        return self.get_json("/configs/equipment", query={"limit": limit, "offset": offset})

    def get_messages(
        self,
        *,
        from_wallet: Optional[str] = None,
        to_wallet: Optional[str] = None,
        from_block: Optional[int] = None,
        to_block: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        return self.get_json(
            "/messages",
            query={
                "from_wallet": from_wallet,
                "to_wallet": to_wallet,
                "from_block": from_block,
                "to_block": to_block,
                "limit": limit,
                "offset": offset,
            },
        )

    def publish_markdown_document(
        self,
        *,
        title: str,
        markdown: str,
        slug: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self.post_json(
            "/docs/publish-markdown",
            {
                "title": title,
                "markdown": markdown,
                "slug": slug,
                "metadata": metadata or {},
            },
        )
