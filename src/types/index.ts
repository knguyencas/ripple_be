export interface RegisterInput {
  email?: string;
  username: string;
  password: string;
  ageGroup?: string;
}

export interface LoginInput {
  username: string;
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