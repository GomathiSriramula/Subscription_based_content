const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'http://localhost:4000');

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiRequestOptions {
  method?: HttpMethod;
  token?: string;
  body?: unknown;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined || body === null ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}`;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pagevault:session-expired'));
    }

    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}
