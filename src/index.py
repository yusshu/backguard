import os
from dotenv import load_dotenv

from .ws.server import Server
from .data.models import Base
from .data.db import SessionLocal, engine
from .data.store import Store
from .auth.app import create_app

load_dotenv()

WS_PORT = int(os.getenv("WS_PORT", 3000))
HTTP_PORT = int(os.getenv("HTTP_PORT", 5000))

session = SessionLocal()
store = Store(session)

Base.metadata.create_all(engine)

server = Server(store, host='0.0.0.0', port=WS_PORT)
server.start()

app = create_app(store)
app.run(host='0.0.0.0', port=HTTP_PORT, debug=False)

