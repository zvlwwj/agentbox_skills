from agentbox_runtime.schemas import ADDRESS, INT, ROLE, STRING, TARGET_WALLET, UINT, obj


class CommonRequestSchemas:
    address = ADDRESS
    int_ = INT
    role = ROLE
    string = STRING
    target_wallet = TARGET_WALLET
    uint = UINT
    object = staticmethod(obj)
