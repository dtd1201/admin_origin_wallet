export interface ApiValidationErrors {
  [field: string]: string[];
}

export interface ApiErrorPayload {
  message?: string;
  errors?: ApiValidationErrors;
}

export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string | null;
  from: number | null;
  last_page: number;
  last_page_url: string | null;
  links: Array<Record<string, unknown>>;
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const adminAuthEndpointConfig = {
  login: import.meta.env.VITE_ADMIN_AUTH_LOGIN_PATH || "/admin/auth/login",
  loginVerify: import.meta.env.VITE_ADMIN_AUTH_LOGIN_VERIFY_PATH || "/admin/auth/login/verify",
  me: import.meta.env.VITE_ADMIN_AUTH_ME_PATH || "/admin/auth/me",
  logout: import.meta.env.VITE_ADMIN_AUTH_LOGOUT_PATH || "/admin/auth/logout",
};

export const adminEndpointConfig = {
  users: import.meta.env.VITE_ADMIN_USERS_PATH || "/admin/users",
  providers: import.meta.env.VITE_ADMIN_PROVIDERS_PATH || "/admin/integration-providers",
  transactions: import.meta.env.VITE_ADMIN_TRANSACTIONS_PATH || "/admin/transactions",
};

export const buildApiUrl = (path: string) => {
  if (!apiBaseUrl) {
    throw new Error("Missing VITE_API_BASE_URL");
  }

  return path.startsWith("http") ? path : `${apiBaseUrl}${path}`;
};

const getResponseError = async (response: Response) => {
  try {
    const data = (await response.json()) as ApiErrorPayload;
    const fieldErrors = data?.errors ? Object.values(data.errors).flat().join(" ") : "";
    return data?.message || fieldErrors || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
};

export const requestApi = async <TResponse>(
  path: string,
  {
    method = "GET",
    body,
    token,
  }: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: Record<string, unknown>;
    token?: string | null;
  } = {},
): Promise<TResponse> => {
  const url = buildApiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot connect to API at ${url}`);
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }

  if (response.status === 204) {
    return null as TResponse;
  }

  return (await response.json()) as TResponse;
};
