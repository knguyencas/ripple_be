export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  city?: string;
  ageGroup?: string;
}

export interface LoginInput {
  email: string;
  password: string;
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