import bcrypt from "bcryptjs";
import type { Device, User } from "./models.js";

export const hashSecret = (raw: string): string => bcrypt.hashSync(raw, 10);
export const verifySecret = (raw: string, hashed: string): boolean => bcrypt.compareSync(raw, hashed);

export class Store {
  constructor(private readonly prisma: any) {}

  async createUser(payload: Omit<User, "id">): Promise<User> {
    const user = await this.prisma.user.create({
      data: payload,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        password: true,
      },
    });

    return user;
  }

  getUserById(userId: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, email: true, password: true },
    });
  }

  async getUser(username: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, name: true, email: true, password: true },
    });

    if (!user) return null;
    return verifySecret(password, user.password) ? user : null;
  }

  getAllDevices(): Promise<Device[]> {
    return this.prisma.device.findMany({
      select: { id: true, name: true, type: true, secret: true },
    });
  }

  getDeviceById(deviceId: string): Promise<Device | null> {
    return this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, type: true, secret: true },
    });
  }

  async updateDeviceName(deviceId: string, name: string): Promise<Device> {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { name },
      select: { id: true, name: true, type: true, secret: true },
    });
  }

  async getOrRegisterDevice(identification: string, secret: string, deviceType = "fan", deviceName?: string): Promise<Device | null> {
    const existing = await this.getDeviceById(identification);
    if (existing) {
      return verifySecret(secret, existing.secret) ? existing : null;
    }

    return this.prisma.device.create({
      data: {
        id: identification,
        type: deviceType,
        name: deviceName ?? identification,
        secret: hashSecret(secret),
      },
      select: { id: true, name: true, type: true, secret: true },
    });
  }

  async setDeviceConfig(deviceId: string, key: string, value: string): Promise<void> {
    await this.prisma.configuration.upsert({
      where: { deviceId_key: { deviceId, key } },
      create: { deviceId, key, value },
      update: { value },
    });
  }

  async getDeviceConfig(deviceId: string, key: string): Promise<string | undefined> {
    const config = await this.prisma.configuration.findUnique({
      where: { deviceId_key: { deviceId, key } },
      select: { value: true },
    });

    return config?.value;
  }
}
