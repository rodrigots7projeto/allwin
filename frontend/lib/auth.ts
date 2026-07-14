const AUTH_KEY = "allwin_auth_v1";

export interface AuthData {
  autenticado: boolean;
  usuario: string;
  loginEm: string;
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return true; // SSR: assume ok
  try {
    const data: AuthData | null = JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null");
    return data?.autenticado === true;
  } catch {
    return false;
  }
}

export function getAuthData(): AuthData | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function login(usuario: string, senha: string): boolean {
  if (usuario.trim().toLowerCase() === "rodrigo" && senha === "258456") {
    const data: AuthData = {
      autenticado: true,
      usuario: "Rodrigo",
      loginEm: new Date().toISOString(),
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}
