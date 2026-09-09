export interface Context {
  userId?: string;
  apiUrl: string;
}

export async function createContext(): Promise<Context> {
  return {
    userId: "recruiter-eval-session",
    apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  };
}
