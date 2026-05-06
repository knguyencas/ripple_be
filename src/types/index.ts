export interface RegisterInput {
  email?: string;
  username: string;
  password: string;
  ageGroup?: string;
  mediaKeySalt?: string;
  encryptedMediaKey?: string;
  mediaKeyIv?: string;
  mediaKeyVersion?: number;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface ForgotPasswordInput {
  email?: string;
}

export interface ResetPasswordInput {
  token?: string;
  newPassword?: string;
}

export interface LogInput {
  mood: string;
  moodScore: number;
  factors: string[];
  note?: string;
}

export interface JwtPayload {
  id: string;
}
