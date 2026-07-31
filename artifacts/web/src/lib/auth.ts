import { setAuthTokenGetter } from "@workspace/api-client-react";

export function initAuth() {
  // Return the raw token — custom-fetch.ts wraps it with "Bearer " automatically.
  setAuthTokenGetter(() => {
    return localStorage.getItem("accessToken");
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
