export interface AdminRoleRecord {
  id?: number;
  user_id?: number;
  role_code?: string;
  created_at?: string;
}

export interface AdminProfileRecord {
  user_id?: number;
  user_type?: string;
  country_code?: string;
  company_name?: string | null;
  company_reg_no?: string | null;
  tax_id?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
}

export interface ProviderSummary {
  id: number;
  code: string;
  name: string;
  status: string;
  is_available_for_onboarding?: boolean;
  supports_beneficiaries?: boolean;
  supports_data_sync?: boolean;
  supports_quotes?: boolean;
  supports_transfers?: boolean;
  supports_webhooks?: boolean;
}

export interface AdminIntegrationLink {
  id?: number;
  user_id?: number;
  provider_id?: number;
  provider_code?: string;
  link_url: string;
  link_label: string;
  is_active: boolean;
  provider?: ProviderSummary;
  created_at?: string;
  updated_at?: string;
}

export interface AdminIntegrationRequest {
  id: number;
  user_id: number;
  provider_id: number;
  status: string;
  note: string | null;
  requested_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserIntegrationLinkSlot {
  provider: ProviderSummary;
  integration_link: AdminIntegrationLink | null;
  integration_request: AdminIntegrationRequest | null;
}

export interface AdminUserIntegrationLinksResponse {
  user_id: number;
  data: AdminUserIntegrationLinkSlot[];
}

export interface AdminIntegrationLinkUpsertResponse {
  message: string;
  user_id: number;
  provider: ProviderSummary;
  integration_link: AdminIntegrationLink;
  integration_request: AdminIntegrationRequest | null;
}
export interface AdminUser {
  id: number;
  email: string;
  phone: string | null;
  full_name: string;
  status: string;
  kyc_status: string;
  profile: AdminProfileRecord | null;
  roles: Array<string | AdminRoleRecord>;
  integration_links?: AdminIntegrationLink[];
  available_providers?: ProviderSummary[];
}

export interface AdminUserDetail extends AdminUser {
  integration_links: AdminIntegrationLink[];
  available_providers: ProviderSummary[];
}

export interface AdminOnboarding {
  profile_completed: boolean;
  selected_provider_code: string | null;
  selected_provider_account_status: string;
  provider_account_statuses: Record<string, unknown>;
  next_action: string | null;
  message: string;
}

export interface AdminAuthResponse {
  message?: string;
  token?: string;
  token_type?: string;
  user: AdminUser;
  onboarding?: AdminOnboarding;
  providers?: ProviderSummary[];
}

export interface AdminAuthChallenge {
  message: string;
  email: string;
  expires_in_minutes?: number | null;
}

export interface AdminTransaction {
  id: number;
  transfer_no?: string;
  user_id: number;
  provider_id: number;
  source_currency?: string;
  target_currency?: string;
  source_amount?: string;
  target_amount?: string;
  fee_amount?: string;
  status: string;
  submitted_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

