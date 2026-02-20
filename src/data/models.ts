export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  password: string;
}

export interface Device {
  id: string;
  name: string;
  type: string;
  secret: string;
}

