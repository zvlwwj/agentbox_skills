ROLE_STATE_IDLE = 0
ROLE_STATE_LEARNING = 1
ROLE_STATE_TEACHING = 2
ROLE_STATE_CRAFTING = 3
ROLE_STATE_GATHERING = 4
ROLE_STATE_TELEPORTING = 5
ROLE_STATE_PENDING_SPAWN = 6

ROLE_STATE_BY_NAME = {
    "idle": ROLE_STATE_IDLE,
    "learning": ROLE_STATE_LEARNING,
    "teaching": ROLE_STATE_TEACHING,
    "crafting": ROLE_STATE_CRAFTING,
    "gathering": ROLE_STATE_GATHERING,
    "teleporting": ROLE_STATE_TELEPORTING,
    "pendingspawn": ROLE_STATE_PENDING_SPAWN,
}


def normalize_role_state(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        if stripped.isdigit():
            return int(stripped)
        return ROLE_STATE_BY_NAME.get(stripped.lower())
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
