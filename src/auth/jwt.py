import jwt
import time
import os

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_EXPIRES = int(os.getenv("JWT_EXPIRES_SECONDS", 86400))
JWT_ALGO = "HS256"

def create_jwt(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRES,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def verify_jwt(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        return None
