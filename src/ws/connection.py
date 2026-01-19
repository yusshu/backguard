connection_id_counter = 1


def next_connection_id():
    global connection_id_counter
    cid = connection_id_counter
    connection_id_counter += 1
    return cid


class Connection:
    def __init__(self, ws, type_="unknown"):
        self.id = next_connection_id()
        self.ws = ws
        self.type = type_

    async def handle(self, cmd, args):
        print(f"⚠ received command '{cmd}' with args '{args}' but no handler defined")
        return False


class DeviceConnection(Connection):
    def __init__(self, ws, device):
        super().__init__(ws, "device")
        self.device = device

    async def handle_from_client(self, client, cmd, args):
        print(f"⚠ unhandled client command '{cmd}' for device")
        return False

    def serialize_state(self):
        return {}