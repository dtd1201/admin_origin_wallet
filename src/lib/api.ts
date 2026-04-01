import type { ContactSubmission } from "@/types/admin";

export interface ApiValidationErrors {
  [field: string]: string[];
}

export interface ApiErrorPayload {
  message?: string;
  errors?: ApiValidationErrors;
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
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
  contactSubmissions: import.meta.env.VITE_ADMIN_CONTACT_SUBMISSIONS_PATH || "/admin/contact-submissions",
};

export const getContactSubmissions = (page = 1, token?: string | null) =>
  requestApi<PaginatedResponse<ContactSubmission>>(`${adminEndpointConfig.contactSubmissions}?page=${page}`, {
    method: "GET",
    token,
  });

export const getContactSubmissionDetail = (id: number | string, token?: string | null) =>
  requestApi<ContactSubmission>(`${adminEndpointConfig.contactSubmissions}/${id}`, {
    method: "GET",
    token,
  });

export const deleteContactSubmission = (id: number | string, token?: string | null) =>
  requestApi<null>(`${adminEndpointConfig.contactSubmissions}/${id}`, {
    method: "DELETE",
    token,
  });

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
    throw new ApiRequestError(await getResponseError(response), response.status);
  }

  if (response.status === 204) {
    return null as TResponse;
  }

  return (await response.json()) as TResponse;
};
