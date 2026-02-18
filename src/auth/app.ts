import cors from "cors";
import express from "express";
import { Prisma } from "@prisma/client";
import { createJwt, verifyJwt } from "./jwt.js";
import { Store, hashSecret } from "../data/store.js";

const getCookieValue = (cookieHeader: string | undefined, name: string): string | undefined => {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
};

export const createApp = (store: Store) => {
  const app = express();

  app.use(express.json());
  app.use(
    cors({
      credentials: true,
      origin: ["http://localhost:3000", "http://127.0.0.1:3000", "https://frontguard.vercel.app"],
    }),
  );

  app.post("/register", async (req, res) => {
    const data = req.body ?? {};

    const required = ["username", "name", "email", "password"];
    if (!required.every((key) => data[key])) {
      return res.status(400).json({ error: "Missing fields" });
    }

    try {
      const user = await store.createUser({
        username: data.username,
        name: data.name,
        email: data.email,
        password: hashSecret(data.password),
      });

      return res.status(201).json({ id: user.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "User already exists" });
      }

      return res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/login", async (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const user = await store.getUser(username, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      token: createJwt(user.id),
    });
  });

  app.get("/verify", async (req, res) => {
    const token = getCookieValue(req.headers.cookie, "auth");

    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const payload = verifyJwt(token);
    if (!payload) {
      return res.status(401).json({ valid: false });
    }

    const user = await store.getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ valid: false });
    }

    return res.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
      },
    });
  });

  app.post("/device_name", async (req, res) => {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = verifyJwt(auth.slice(7).trim());
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const deviceId = req.body?.deviceId as string | undefined;
    const newName = String(req.body?.name ?? "").trim();

    if (!deviceId || !newName) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const existing = await store.getDeviceById(deviceId);
    if (!existing) {
      return res.status(404).json({ error: "Device not found" });
    }

    const device = await store.updateDeviceName(deviceId, newName);

    return res.json({
      id: device.id,
      name: device.name,
    });
  });

  return app;
};
