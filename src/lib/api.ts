import type {
  AdminComplianceEvent,
  AdminComplianceReviewRequest,
  AdminComplianceReviewResponse,
  AdminAmlScreening,
  AdminAmlReviewResponse,
  AdminBankAccount,
  AdminBeneficiary,
  AdminKycDetailResponse,
  AdminKycProviderReviewResponse,
  AdminKycProviderSubmissionsResponse,
  AdminKycProviderSubmission,
  AdminProviderAccountSyncResponse,
  AdminRfiCase,
  AdminRfiDraftRequest,
  AdminLedgerEntry,
  AdminWalletAccount,
  AdminTransaction,
  ContactSubmission,
} from "@/types/admin";

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

export const adminUnauthorizedEvent = "origin-wallet-admin-unauthorized";

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
  bankAccounts: import.meta.env.VITE_ADMIN_BANK_ACCOUNTS_PATH || "/admin/bank-accounts",
  beneficiaries: import.meta.env.VITE_ADMIN_BENEFICIARIES_PATH || "/admin/beneficiaries",
  providerHealth: import.meta.env.VITE_ADMIN_PROVIDER_HEALTH_PATH || "/admin/provider-health",
  providerWebhookEvents:
    import.meta.env.VITE_ADMIN_PROVIDER_WEBHOOK_EVENTS_PATH || "/admin/provider-webhook-events",
  niumComplianceEvents:
    import.meta.env.VITE_ADMIN_NIUM_COMPLIANCE_EVENTS_PATH || "/admin/nium-compliance-events",
  niumRfiCases: import.meta.env.VITE_ADMIN_NIUM_RFI_CASES_PATH || "/admin/nium-rfi-cases",
  exchangeRates: import.meta.env.VITE_ADMIN_EXCHANGE_RATES_PATH || "/admin/exchange-rates",
  kycProfiles: import.meta.env.VITE_ADMIN_KYC_PROFILES_PATH || "/admin/kyc-profiles",
  kycProviderSubmissions:
    import.meta.env.VITE_ADMIN_KYC_PROVIDER_SUBMISSIONS_PATH || "/admin/kyc-provider-submissions",
  amlScreenings: import.meta.env.VITE_ADMIN_AML_SCREENINGS_PATH || "/admin/aml-screenings",
  transactions: import.meta.env.VITE_ADMIN_TRANSACTIONS_PATH || "/admin/transactions",
  transfers: import.meta.env.VITE_ADMIN_TRANSFERS_PATH || "/admin/transfers",
  fxOrders: import.meta.env.VITE_ADMIN_FX_ORDERS_PATH || "/admin/fx-orders",
  wallets: import.meta.env.VITE_ADMIN_WALLETS_PATH || "/admin/wallets",
  ledgerEntries: import.meta.env.VITE_ADMIN_LEDGER_ENTRIES_PATH || "/admin/ledger-entries",
  auditLogs: import.meta.env.VITE_ADMIN_AUDIT_LOGS_PATH || "/admin/audit-logs",
  contactSubmissions: import.meta.env.VITE_ADMIN_CONTACT_SUBMISSIONS_PATH || "/admin/contact-submissions",
};

export const getAdminBankAccounts = (page: number, token?: string | null) =>
  requestApi<PaginatedResponse<AdminBankAccount>>(`${adminEndpointConfig.bankAccounts}?page=${page}`, {
    method: "GET",
    token,
  });

export const getAdminBankAccount = (id: number, token?: string | null) =>
  requestApi<AdminBankAccount>(`${adminEndpointConfig.bankAccounts}/${id}`, { method: "GET", token });

export const getAdminBeneficiaries = (page: number, token?: string | null) =>
  requestApi<PaginatedResponse<AdminBeneficiary>>(`${adminEndpointConfig.beneficiaries}?page=${page}`, {
    method: "GET",
    token,
  });

export const getAdminBeneficiary = (id: number, token?: string | null) =>
  requestApi<AdminBeneficiary>(`${adminEndpointConfig.beneficiaries}/${id}`, { method: "GET", token });

export const getAdminKycProfile = (userId: number, token?: string | null) =>
  requestApi<AdminKycDetailResponse>(`/admin/users/${userId}/kyc-profile`, { method: "GET", token });

export const getAdminKycProviderSubmissions = (userId: number, token?: string | null) =>
  requestApi<AdminKycProviderSubmissionsResponse>(
    `/admin/users/${userId}/kyc-profile/provider-submissions`,
    { method: "GET", token },
  );

export const getAdminProviderAccountSubmissions = (page: number, token?: string | null) =>
  requestApi<PaginatedResponse<AdminKycProviderSubmission>>(
    `${adminEndpointConfig.kycProviderSubmissions}?page=${page}`,
    { method: "GET", token },
  );

export const syncAdminProviderAccount = (
  providerCode: string,
  userId: number,
  token?: string | null,
) => requestApi<AdminProviderAccountSyncResponse>(
  `/admin/providers/${encodeURIComponent(providerCode)}/users/${userId}/sync`,
  { method: "POST", body: {}, token },
);

export const approveAdminKycProviderSubmission = (
  userId: number,
  provider: string,
  reviewNote?: string | null,
  token?: string | null,
) =>
  requestApi<AdminKycProviderReviewResponse>(
    `/admin/users/${userId}/kyc-profile/providers/${encodeURIComponent(provider)}/approve`,
    { method: "POST", body: { review_note: reviewNote ?? null }, token },
  );

export const rejectAdminKycProviderSubmission = (
  userId: number,
  provider: string,
  rejectionReason: string,
  reviewNote?: string | null,
  token?: string | null,
) =>
  requestApi<AdminKycProviderReviewResponse>(
    `/admin/users/${userId}/kyc-profile/providers/${encodeURIComponent(provider)}/reject`,
    {
      method: "POST",
      body: { rejection_reason: rejectionReason, review_note: reviewNote ?? null },
      token,
    },
  );

export const confirmAdminAmlMatch = (screeningId: number, reviewNote?: string | null, token?: string | null) =>
  requestApi<AdminAmlReviewResponse>(`${adminEndpointConfig.amlScreenings}/${screeningId}/confirm-match`, {
    method: "POST",
    body: { review_note: reviewNote ?? null },
    token,
  });

export const clearAdminAmlScreening = (screeningId: number, reviewNote?: string | null, token?: string | null) =>
  requestApi<AdminAmlReviewResponse>(`${adminEndpointConfig.amlScreenings}/${screeningId}/clear`, {
    method: "POST",
    body: { review_note: reviewNote ?? null },
    token,
  });

export const getAdminAmlScreenings = (userId: number, token?: string | null) =>
  requestApi<PaginatedResponse<AdminAmlScreening>>(
    `${adminEndpointConfig.amlScreenings}?user_id=${userId}`,
    { method: "GET", token },
  );

export const getAdminComplianceEvents = (query: string, token?: string | null) =>
  requestApi<PaginatedResponse<AdminComplianceEvent>>(
    `${adminEndpointConfig.niumComplianceEvents}${query ? `?${query}` : ""}`,
    { method: "GET", token },
  );

export const getAdminComplianceEvent = (id: number, token?: string | null) =>
  requestApi<AdminComplianceEvent>(`${adminEndpointConfig.niumComplianceEvents}/${id}`, {
    method: "GET",
    token,
  });

export const reviewAdminComplianceEvent = (
  id: number,
  body: AdminComplianceReviewRequest,
  token?: string | null,
) =>
  requestApi<AdminComplianceReviewResponse>(`${adminEndpointConfig.niumComplianceEvents}/${id}/review`, {
    method: "POST",
    body: { ...body },
    token,
  });

export const getAdminRfiCases = (query: string, token?: string | null) =>
  requestApi<PaginatedResponse<AdminRfiCase>>(
    `${adminEndpointConfig.niumRfiCases}${query ? `?${query}` : ""}`,
    { method: "GET", token },
  );

export const getAdminRfiCase = (id: number, token?: string | null) =>
  requestApi<AdminRfiCase>(`${adminEndpointConfig.niumRfiCases}/${id}`, { method: "GET", token });

export const saveAdminRfiDraft = (id: number, body: AdminRfiDraftRequest, token?: string | null) =>
  requestApi<AdminRfiCase>(`${adminEndpointConfig.niumRfiCases}/${id}/draft`, {
    method: "PUT",
    body: { answers: body.answers },
    token,
  });

export const approveAdminRfiCase = (id: number, token?: string | null) =>
  requestApi<AdminRfiCase>(`${adminEndpointConfig.niumRfiCases}/${id}/approve`, {
    method: "POST",
    body: {},
    token,
  });

export const submitAdminRfiCase = (id: number, token?: string | null) =>
  requestApi<AdminRfiCase>(`${adminEndpointConfig.niumRfiCases}/${id}/submit`, {
    method: "POST",
    body: {},
    token,
  });

export const getAdminWallets = (query: string, token?: string | null) =>
  requestApi<PaginatedResponse<AdminWalletAccount>>(
    `${adminEndpointConfig.wallets}${query ? `?${query}` : ""}`,
    { method: "GET", token },
  );

export const getAdminWallet = (id: number, token?: string | null) =>
  requestApi<AdminWalletAccount>(`${adminEndpointConfig.wallets}/${id}`, { method: "GET", token });

export const getAdminLedgerEntries = (query: string, token?: string | null) =>
  requestApi<PaginatedResponse<AdminLedgerEntry>>(
    `${adminEndpointConfig.ledgerEntries}${query ? `?${query}` : ""}`,
    { method: "GET", token },
  );

export const getAdminLedgerEntry = (id: number, token?: string | null) =>
  requestApi<AdminLedgerEntry>(`${adminEndpointConfig.ledgerEntries}/${id}`, { method: "GET", token });

export const getAdminTransactionRecords = (page: number, token?: string | null) =>
  requestApi<PaginatedResponse<AdminTransaction>>(`${adminEndpointConfig.transactions}?page=${page}`, {
    method: "GET",
    token,
  });

export const getAdminTransactionRecord = (id: number, token?: string | null) =>
  requestApi<AdminTransaction>(`${adminEndpointConfig.transactions}/${id}`, { method: "GET", token });

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
    if ((response.status === 401 || response.status === 403) && typeof window !== "undefined") {
      window.dispatchEvent(new Event(adminUnauthorizedEvent));
    }
    throw new ApiRequestError(await getResponseError(response), response.status);
  }

  if (response.status === 204) {
    return null as TResponse;
  }

  return (await response.json()) as TResponse;
};
