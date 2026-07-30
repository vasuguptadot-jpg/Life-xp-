import { setAuthTokenGetter } from "@workspace/api-client-react";

export function initAuth() {
  setAuthTokenGetter(() => {
    const token = localStorage.getItem("accessToken");
    return token ? `Bearer ${token}` : undefined;
  });
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

export function getRefreshToken() {
  return localStorage.getItem("refreshToken");
}
