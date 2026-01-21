# auth/app.py
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from sqlalchemy import select

from ..data.store import Store, hash_secret
from ..data.models import User
from .jwt import create_jwt, verify_jwt

def create_app(store: Store):
    app = Flask(__name__)

    CORS(
        app,
        supports_credentials=True,
        origins=[
            "http://localhost:3000",   # Next.js dev
            "http://127.0.0.1:3000",
        ]
    )

    @app.post("/register")
    def register():
        data = request.json or {}

        required = ("username", "name", "email", "password")
        if not all(k in data for k in required):
            return jsonify({"error": "Missing fields"}), 400

        stmt = select(User).where(
            (User.username == data["username"]) |
            (User.email == data["email"])
        )
        if store.session.scalar(stmt):
            return jsonify({"error": "User already exists"}), 409

        user = User(
            username=data["username"],
            name=data["name"],
            email=data["email"],
            password=hash_secret(data["password"]),
        )

        store.session.add(user)
        store.session.commit()
        store.session.refresh(user)

        return jsonify({"id": user.id}), 201

    @app.post("/login")
    def login():
        data = request.json or {}

        if "username" not in data or "password" not in data:
            return jsonify({"error": "Missing credentials"}), 400

        user = store.get_user(data["username"], data["password"])
        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        token = create_jwt(user.id)

        resp = make_response({
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "token": token,
        })

        return resp

    @app.get("/verify")
    def verify():
        token = request.cookies.get("auth")
        if not token:
            return jsonify({"valid": False}), 401

        payload = verify_jwt(token)
        if not payload:
            return jsonify({"valid": False}), 401

        user = store.session.get(User, payload["sub"])
        if not user:
            return jsonify({"valid": False}), 401

        return jsonify({
            "valid": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "name": user.name,
                "email": user.email,
            }
        })
    
    @app.post("/device_name")
    def change_device_name():
        # --- Auth ---
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401

        token = auth.removeprefix("Bearer ").strip()
        payload = verify_jwt(token)

        if not payload:
            return jsonify({"error": "Unauthorized"}), 401

        data = request.json or {}
        device_id = data.get("deviceId")
        new_name = (data.get("name") or "").strip()

        if not device_id or not new_name:
            return jsonify({"error": "Invalid payload"}), 400

        device = store.get_device_by_id(device_id)
        if not device:
            return jsonify({"error": "Device not found"}), 404

        device.name = new_name
        store.session.commit()

        return jsonify({
            "id": device.id,
            "name": device.name,
        })

    return app
