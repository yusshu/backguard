import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";
const JWT_EXPIRES = Number(process.env.JWT_EXPIRES_SECONDS ?? 86_400);

export interface JwtPayload {
  sub: number;
  iat: number;
  exp: number;
}

export const createJwt = (userId: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
    exp: now + JWT_EXPIRES,
  };

  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256" });
};

export const verifyJwt = (token: string): JwtPayload | undefined => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return undefined;
  }
};
