export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'https://onrender.com/api';
export const SERVER_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export function getAuthToken() {
  return localStorage.getItem('codemarket_token');
}

export function getAuthHeaders(includeJson = true) {
  const headers = new Headers();
  const token = getAuthToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (includeJson) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}
