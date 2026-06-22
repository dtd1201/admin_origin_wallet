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
  logo_url?: string | null;
  status: string;
  is_available_for_onboarding?: boolean;
  supports_beneficiaries?: boolean;
  supports_data_sync?: boolean;
  supports_quotes?: boolean;
  supports_transfers?: boolean;
  supports_webhooks?: boolean;
}

export interface AdminProviderHealth {
  id?: number;
  provider_id?: number;
  provider_code: string;
  provider?: ProviderSummary | null;
  status: "operational" | "degraded" | "down" | "maintenance" | string;
  environment?: "sandbox" | "production" | string | null;
  last_checked_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  latency_ms?: number | string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminProviderWebhookEvent {
  id: number;
  provider_id?: number | null;
  provider_code: string;
  provider?: ProviderSummary | null;
  event_id?: string | null;
  event_type: string;
  status: "received" | "processed" | "failed" | "ignored" | "retrying" | string;
  related_reference?: string | null;
  attempts?: number | null;
  received_at?: string | null;
  processed_at?: string | null;
  next_retry_at?: string | null;
  error_message?: string | null;
  payload?: Record<string, unknown> | null;
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
  kyc_profile?: AdminKycProfile | null;
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
  metadata?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown> | null;
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

export interface AdminTransferApproval {
  id: number;
  transfer_id: number;
  approver_user_id?: number | null;
  action: "approved" | "rejected" | string;
  note?: string | null;
  created_at?: string | null;
  approver?: AdminUser | null;
}

export interface AdminTransfer {
  id: number;
  transfer_no: string;
  user_id: number;
  provider_id: number;
  user?: AdminUser | null;
  provider?: ProviderSummary | null;
  beneficiary_id?: number | null;
  external_transfer_id?: string | null;
  external_payment_id?: string | null;
  transfer_type: string;
  source_currency: string;
  target_currency: string;
  source_amount: string | number;
  target_amount?: string | number | null;
  fee_amount?: string | number | null;
  status: string;
  failure_code?: string | null;
  failure_reason?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  approvals?: AdminTransferApproval[];
}

export interface AdminWalletAccount {
  id: number;
  user_id?: number | null;
  user?: AdminUser | null;
  provider_id?: number | null;
  provider?: ProviderSummary | null;
  provider_code?: string | null;
  account_reference?: string | null;
  currency: string;
  available_balance: string | number;
  ledger_balance?: string | number | null;
  hold_balance?: string | number | null;
  status: "active" | "frozen" | "closed" | "pending" | string;
  last_reconciled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminLedgerEntry {
  id: number;
  wallet_id?: number | null;
  wallet?: AdminWalletAccount | null;
  user_id?: number | null;
  user?: AdminUser | null;
  provider_id?: number | null;
  provider?: ProviderSummary | null;
  reference: string;
  entry_type: "credit" | "debit" | "hold" | "release" | "adjustment" | "reversal" | string;
  status: "pending" | "posted" | "reversed" | "failed" | string;
  currency: string;
  amount: string | number;
  balance_after?: string | number | null;
  source_type?: string | null;
  source_id?: number | string | null;
  description?: string | null;
  posted_at?: string | null;
  created_at?: string | null;
}

export interface AdminAuditLog {
  id: number;
  actor_id?: number | null;
  actor?: AdminUser | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: number | string | null;
  summary?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

type SnapshotValue = string | number | boolean | null | undefined;

export interface AdminFxOrderCustomerSnapshot {
  user?: {
    id?: number;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: string | null;
    kyc_status?: string | null;
  } | null;
  profile?: Record<string, SnapshotValue> | null;
  kyc_profile?: Record<string, SnapshotValue> | null;
  provider?: Record<string, SnapshotValue> | null;
}

export interface AdminFxOrder {
  id: number;
  order_no: string;
  user_id: number;
  provider_id: number;
  user?: AdminUser | null;
  provider?: ProviderSummary | null;
  source_currency: string;
  target_currency: string;
  source_amount: string | number;
  target_amount?: string | number | null;
  fx_rate?: string | number | null;
  fee_amount?: string | number | null;
  fee_currency?: string | null;
  status: "pending" | "confirmed" | "rejected" | "cancelled" | string;
  customer_snapshot?: AdminFxOrderCustomerSnapshot | null;
  raw_data?: Record<string, unknown> | null;
  admin_note?: string | null;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminFxOrderResponse {
  message?: string;
  order: AdminFxOrder;
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
