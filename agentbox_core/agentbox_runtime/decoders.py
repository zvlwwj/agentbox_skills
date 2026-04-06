from __future__ import annotations

from typing import Any


def _get(value: Any, index: int, key: str) -> Any:
    if isinstance(value, dict):
        return value.get(key)
    return value[index]


def decode_core_contracts(value: Any) -> dict[str, Any]:
    return {
        "roleContract": _get(value, 0, "roleContract"),
        "configContract": _get(value, 1, "configContract"),
        "economyContract": _get(value, 2, "economyContract"),
        "randomizerContract": _get(value, 3, "randomizerContract"),
        "resourceContract": _get(value, 4, "resourceContract"),
        "landContract": _get(value, 5, "landContract"),
    }


def decode_global_config(value: Any) -> dict[str, Any]:
    return {
        "mapWidth": _get(value, 0, "mapWidth"),
        "mapHeight": _get(value, 1, "mapHeight"),
        "mintIntervalBlocks": _get(value, 2, "mintIntervalBlocks"),
        "mintAmount": _get(value, 3, "mintAmount"),
        "stabilizationBlocks": _get(value, 4, "stabilizationBlocks"),
        "craftDurationBlocks": _get(value, 5, "craftDurationBlocks"),
        "halvingIntervalBlocks": _get(value, 6, "halvingIntervalBlocks"),
        "landPrice": _get(value, 7, "landPrice"),
    }


def decode_role_identity(value: Any) -> dict[str, Any]:
    return {
        "isValidRole": _get(value, 0, "isValidRole"),
        "roleId": _get(value, 1, "roleId"),
        "owner": _get(value, 2, "owner"),
        "controller": _get(value, 3, "controller"),
    }


def decode_role_snapshot(value: Any) -> dict[str, Any]:
    return {
        "exists": _get(value, 0, "exists"),
        "state": _get(value, 1, "state"),
        "x": _get(value, 2, "x"),
        "y": _get(value, 3, "y"),
        "speed": _get(value, 4, "speed"),
        "attack": _get(value, 5, "attack"),
        "defense": _get(value, 6, "defense"),
        "hp": _get(value, 7, "hp"),
        "maxHp": _get(value, 8, "maxHp"),
        "range": _get(value, 9, "range"),
        "mp": _get(value, 10, "mp"),
    }


def decode_role_action_snapshot(value: Any) -> dict[str, Any]:
    keys = [
        "craftingStartBlock",
        "craftingRequiredBlocks",
        "craftingRecipeId",
        "learningStartBlock",
        "learningRequiredBlocks",
        "learningTargetId",
        "learningSkillId",
        "learningIsNPC",
        "learningTeacherWallet",
        "teachingStartBlock",
        "teachingRequiredBlocks",
        "teachingSkillId",
        "teachingStudentWallet",
        "teleportStartBlock",
        "teleportRequiredBlocks",
        "teleportTargetX",
        "teleportTargetY",
        "gatheringStartBlock",
        "gatheringRequiredBlocks",
        "gatheringTargetLandId",
        "gatheringAmount",
    ]
    if isinstance(value, dict):
        return {key: value.get(key) for key in keys}
    return {key: value[idx] for idx, key in enumerate(keys)}


def decode_land_snapshot(value: Any) -> dict[str, Any]:
    return {
        "landId": _get(value, 0, "landId"),
        "x": _get(value, 1, "x"),
        "y": _get(value, 2, "y"),
        "owner": _get(value, 3, "owner"),
        "landContractAddress": _get(value, 4, "landContractAddress"),
        "isResourcePoint": _get(value, 5, "isResourcePoint"),
        "resourceType": _get(value, 6, "resourceType"),
        "stock": _get(value, 7, "stock"),
        "groundTokens": _get(value, 8, "groundTokens"),
    }


def decode_npc_snapshot(value: Any) -> dict[str, Any]:
    return {
        "skillId": _get(value, 0, "skillId"),
        "x": _get(value, 1, "x"),
        "y": _get(value, 2, "y"),
        "startBlock": _get(value, 3, "startBlock"),
        "isTeaching": _get(value, 4, "isTeaching"),
        "studentWallet": _get(value, 5, "studentWallet"),
    }


def decode_recipe_snapshot(value: Any) -> dict[str, Any]:
    return {
        "requiredResources": _get(value, 0, "requiredResources"),
        "requiredAmounts": _get(value, 1, "requiredAmounts"),
        "requiredSkill": _get(value, 2, "requiredSkill"),
        "requiredBlocks": _get(value, 3, "requiredBlocks"),
        "outputEquipmentId": _get(value, 4, "outputEquipmentId"),
    }


def decode_equipment_snapshot(value: Any) -> dict[str, Any]:
    return {
        "slot": _get(value, 0, "slot"),
        "speedBonus": _get(value, 1, "speedBonus"),
        "attackBonus": _get(value, 2, "attackBonus"),
        "defenseBonus": _get(value, 3, "defenseBonus"),
        "maxHpBonus": _get(value, 4, "maxHpBonus"),
        "rangeBonus": _get(value, 5, "rangeBonus"),
    }


def decode_economy_balances(value: Any) -> dict[str, Any]:
    return {
        "totalBalance": _get(value, 0, "totalBalance"),
        "unreliableBalance": _get(value, 1, "unreliableBalance"),
        "reliableBalance": _get(value, 2, "reliableBalance"),
    }


def decode_finishable(value: Any) -> dict[str, Any]:
    return {
        "canFinish": _get(value, 0, "canFinish"),
        "state": _get(value, 1, "state"),
        "finishBlock": _get(value, 2, "finishBlock"),
    }
