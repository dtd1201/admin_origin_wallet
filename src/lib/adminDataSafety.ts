export const maskAdminIdentifier = (value?: string | number | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
};

export const getAdminErrorCategory = (value?: string | null) => {
  const normalized = String(value || "").toLowerCase();
  if (!normalized) return "None";
  if (/auth|credential|forbidden|unauthori[sz]ed|permission/.test(normalized)) return "Authentication";
  if (/timeout|timed out|deadline/.test(normalized)) return "Timeout";
  if (/rate.?limit|too many requests|throttl/.test(normalized)) return "Rate limit";
  if (/valid|malformed|invalid|unprocessable/.test(normalized)) return "Validation";
  if (/network|connect|dns|unreachable/.test(normalized)) return "Connectivity";
  if (/provider|upstream|gateway|service unavailable/.test(normalized)) return "Provider service";
  return "Processing";
};

type SafeSummaryItem = { label: string; value: string };

const firstScalar = (records: Array<Record<string, unknown> | null | undefined>, keys: string[]) => {
  for (const record of records) {
    for (const key of keys) {
      const value = record?.[key];
      if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    }
  }
  return null;
};

export const buildSafeAuditSummary = (
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null,
): SafeSummaryItem[] => {
  const records = [after, before, metadata];
  const operation = firstScalar(records, ["operation", "operation_name", "event_type"]);
  const status = firstScalar(records, ["status", "result", "outcome"]);
  const httpStatus = firstScalar(records, ["http_status", "http_status_code", "status_code"]);
  const timestamp = firstScalar(records, ["timestamp", "occurred_at", "processed_at", "updated_at", "created_at"]);
  const reference = firstScalar(records, ["reference", "related_reference", "external_id", "provider_reference", "customer_id"]);
  const errorCategory = firstScalar(records, ["error_category", "failure_category"]);
  const success = firstScalar(records, ["success"]);

  return [
    operation && { label: "Operation", value: operation },
    status && { label: "Status", value: status },
    httpStatus && { label: "HTTP status", value: httpStatus },
    success && { label: "Result", value: success === "true" ? "Success" : success === "false" ? "Failure" : success },
    reference && { label: "Reference", value: maskAdminIdentifier(reference) },
    errorCategory && { label: "Error category", value: errorCategory },
    timestamp && { label: "Timestamp", value: timestamp },
  ].filter((item): item is SafeSummaryItem => Boolean(item));
};
