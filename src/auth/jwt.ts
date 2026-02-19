import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";

export interface JwtPayload {
  sub: number;
  iat: number;
}

export const createJwt = (userId: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: userId,
    iat: now,
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
