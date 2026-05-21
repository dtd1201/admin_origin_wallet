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

export interface ManagedExchangeRate {
  id: number;
  rate_type: "provider" | "bank";
  audience: "public" | "authenticated";
  provider_id?: number | null;
  provider?: ProviderSummary | null;
  source_code: string;
  source_name: string;
  source_currency: string;
  target_currency: string;
  buy_rate: string | number | null;
  sell_rate: string | number | null;
  mid_rate: string | number | null;
  fee_amount: string | number;
  status: string;
  display_order: number;
  notes?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

export interface AdminKycDocument {
  id: number;
  kyc_profile_id?: number;
  kyc_related_person_id?: number | null;
  type: string;
  status: string;
  file_url: string;
  storage_disk?: string | null;
  file_path?: string | null;
  original_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  file_hash?: string | null;
  side?: string | null;
  document_number?: string | null;
  issuing_country_code?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminKycRelatedPerson {
  id: number;
  kyc_profile_id?: number;
  relationship_type: string;
  status: string;
  legal_name: string;
  date_of_birth?: string | null;
  nationality_country_code?: string | null;
  residence_country_code?: string | null;
  ownership_percentage?: string | number | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  documents?: AdminKycDocument[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminKycRequirement {
  id: number;
  key: string;
  label: string;
  category: string;
  status: string;
  requirement_type: string;
  subject_type?: string | null;
  subject_id?: number | null;
  review_note?: string | null;
  rejection_reason?: string | null;
}

export interface AdminAmlMatch {
  id: number;
  list_type: string;
  source: string;
  matched_name: string;
  score?: string | number | null;
  country_code?: string | null;
  status: string;
}

export interface AdminAmlScreening {
  id: number;
  subject_name: string;
  subject_role: string;
  screening_provider: string;
  status: string;
  risk_level?: string | null;
  risk_score?: string | number | null;
  screened_at?: string | null;
  review_note?: string | null;
  matches?: AdminAmlMatch[];
}

export interface AdminKycProfile {
  id: number;
  user_id: number;
  user?: AdminUser | null;
  status: string;
  applicant_type: "individual" | "business" | string;
  legal_name: string;
  date_of_birth?: string | null;
  nationality_country_code?: string | null;
  residence_country_code?: string | null;
  business_name?: string | null;
  business_registration_number?: string | null;
  tax_id?: string | null;
  registered_country_code?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country_code: string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: AdminUser | null;
  review_note?: string | null;
  rejection_reason?: string | null;
  documents?: AdminKycDocument[];
  related_persons?: AdminKycRelatedPerson[];
  requirements?: AdminKycRequirement[];
  aml_screenings?: AdminAmlScreening[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminKycReviewResponse {
  message?: string;
  user?: AdminUser;
  kyc_profile: AdminKycProfile;
  kyc_submission?: AdminKycProfile;
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


export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  company: string | null;
  subject: string;
  message: string;
  ip_address: string | null;
  user_agent: string | null;
  submitted_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
