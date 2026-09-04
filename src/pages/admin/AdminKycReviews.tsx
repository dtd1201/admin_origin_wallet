import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  adminEndpointConfig,
  approveAdminKycProviderSubmission,
  buildApiUrl,
  clearAdminAmlScreening,
  confirmAdminAmlMatch,
  getAdminAmlScreenings,
  getAdminKycProfile,
  getAdminKycProviderSubmissions,
  rejectAdminKycProviderSubmission,
  requestApi,
  type PaginatedResponse,
} from "@/lib/api";
import type {
  AdminAmlScreening,
  AdminKycDocument,
  AdminKycProfile,
  AdminKycProviderSubmission,
  AdminKycRelatedPerson,
  AdminKycRequirement,
  AdminKycReviewResponse,
} from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "needs_more_info", label: "Needs more info" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
] as const;

const statusClassName = (status: string) => {
  const normalized = status.toLowerCase();

  if (["verified", "approved", "clear", "manual_clear"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (["rejected", "confirmed_match", "failed"].includes(normalized)) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  if (["needs_more_info", "potential_match"].includes(normalized)) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return "-";

  return String(value).slice(0, 10);
};

const formatPercent = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : String(value);
};

const formatMetadataValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return "-";

  return String(value);
};

const maskSensitiveValue = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) return "-";
  if (normalized.length <= 4) return "*".repeat(normalized.length);
  return `${"*".repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-4)}`;
};

const getProfileName = (profile: AdminKycProfile) =>
  profile.applicant_type === "business" ? profile.business_name || profile.legal_name : profile.legal_name;

const getRequiredRequirementCount = (profile: AdminKycProfile) =>
  profile.requirements?.filter((requirement) => requirement.status === "required").length ?? 0;

const isAmlClearForApproval = (
  status?: string | null,
  complianceDecision?: string | null,
) => {
  return (
    String(status ?? "").toLowerCase() === "completed" &&
    String(complianceDecision ?? "").toLowerCase() === "clear"
  );
};

const requiresManualAmlReview = (
  status?: string | null,
  complianceDecision?: string | null,
) => {
  return (
    String(status ?? "").toLowerCase() === "manual_review" &&
    String(complianceDecision ?? "").toLowerCase() === "pending_review"
  );
};

const isActiveAmlScreening = (status?: string | null) => String(status ?? "").toLowerCase() !== "superseded";

type UpdateRequestTarget = {
  key: string;
  label: string;
  category: string;
  requirement_type: string;
  subject_type?: string | null;
  subject_id?: number | null;
  metadata?: Record<string, unknown>;
};

const profileUpdateTarget = (profile: AdminKycProfile): UpdateRequestTarget => ({
  key: "profile_information",
  label: "Profile information",
  category: "profile",
  requirement_type: "form",
  subject_type: "profile",
  subject_id: profile.id,
  metadata: {
    applicant_type: profile.applicant_type,
    target_user_id: profile.user_id,
  },
});

const requirementUpdateTarget = (requirement: AdminKycRequirement): UpdateRequestTarget => ({
  key: requirement.key,
  label: requirement.label,
  category: requirement.category,
  requirement_type: requirement.requirement_type,
  subject_type: requirement.subject_type ?? null,
  subject_id: requirement.subject_id ?? null,
  metadata: requirement.metadata ?? undefined,
});

const documentUpdateTarget = (
  document: AdminKycDocument,
  relatedPerson?: AdminKycRelatedPerson,
): UpdateRequestTarget => ({
  key: relatedPerson ? `related_person_document_${document.id}` : `document_${document.id}`,
  label: relatedPerson ? `${relatedPerson.legal_name} ${document.type}` : document.type,
  category: relatedPerson ? "related_person_document" : "document",
  requirement_type: "document",
  subject_type: "document",
  subject_id: document.id,
  metadata: {
    document_type: document.type,
    related_person_id: relatedPerson?.id ?? null,
    related_person_name: relatedPerson?.legal_name ?? null,
  },
});

const relatedPersonUpdateTarget = (person: AdminKycRelatedPerson): UpdateRequestTarget => ({
  key: `related_person_${person.id}`,
  label: `${person.legal_name} information`,
  category: "related_person",
  requirement_type: "related_person",
  subject_type: "related_person",
  subject_id: person.id,
  metadata: {
    relationship_type: person.relationship_type,
  },
});

const AdminKycReviews = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]["value"]>("all");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<AdminKycProfile | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [approvalReviewNote, setApprovalReviewNote] = useState("");
  const [rejectionReviewNote, setRejectionReviewNote] = useState("");
  const [updateReviewNote, setUpdateReviewNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [updateRequestDialogOpen, setUpdateRequestDialogOpen] = useState(false);
  const [updateRequestTarget, setUpdateRequestTarget] = useState<UpdateRequestTarget | null>(null);
  const [updateRequestReason, setUpdateRequestReason] = useState("");
  const [selectedProviderSubmission, setSelectedProviderSubmission] = useState<AdminKycProviderSubmission | null>(null);
  const [providerAction, setProviderAction] = useState<"approve" | "reject" | null>(null);
  const [providerReviewNote, setProviderReviewNote] = useState("");
  const [providerRejectionReason, setProviderRejectionReason] = useState("");
  const [providerActionError, setProviderActionError] = useState("");
  const [selectedAmlScreening, setSelectedAmlScreening] = useState<AdminAmlScreening | null>(null);
  const [amlAction, setAmlAction] = useState<"confirm" | "clear" | null>(null);
  const [amlReviewNote, setAmlReviewNote] = useState("");
  const [amlActionError, setAmlActionError] = useState("");

  const queryPath = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter !== "all") params.set("status", statusFilter);

    return `${adminEndpointConfig.kycProfiles}?${params.toString()}`;
  }, [page, statusFilter]);

  const profilesQuery = useQuery({
    queryKey: ["admin", "kyc-profiles", statusFilter, page, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminKycProfile>>(queryPath, { method: "GET", token }),
  });

  const profileDetailQuery = useQuery({
    queryKey: ["admin", "kyc-profile-detail", selectedUserId, token],
    enabled: !!token && reviewDialogOpen && selectedUserId !== null,
    queryFn: () => getAdminKycProfile(selectedUserId as number, token),
  });

  const providerSubmissionsQuery = useQuery({
    queryKey: ["admin", "kyc-provider-submissions", selectedUserId, token],
    enabled: !!token && reviewDialogOpen && selectedUserId !== null,
    queryFn: () => getAdminKycProviderSubmissions(selectedUserId as number, token),
  });

  const amlScreeningsQuery = useQuery({
    queryKey: ["admin", "aml-screenings", selectedUserId, token],
    enabled: !!token && reviewDialogOpen && selectedUserId !== null,
    queryFn: () => getAdminAmlScreenings(selectedUserId as number, token),
  });

  const rows = useMemo(() => profilesQuery.data?.data ?? [], [profilesQuery.data?.data]);
  const canGoBack = (profilesQuery.data?.current_page ?? page) > 1;
  const canGoNext = (profilesQuery.data?.current_page ?? page) < (profilesQuery.data?.last_page ?? page);
  useEffect(() => {
    if (profileDetailQuery.data) setSelectedProfile(profileDetailQuery.data.kyc_profile);
  }, [profileDetailQuery.data]);

  useEffect(() => {
    setApprovalReviewNote("");
    setRejectionReviewNote("");
    setUpdateReviewNote("");
    setRejectionReason("");
    setReviewError("");
    setDocumentError("");
    setUpdateRequestTarget(null);
    setUpdateRequestReason("");
    setUpdateRequestDialogOpen(false);
    setSelectedProviderSubmission(null);
    setProviderAction(null);
    setProviderReviewNote("");
    setProviderRejectionReason("");
    setProviderActionError("");
    setSelectedAmlScreening(null);
    setAmlAction(null);
    setAmlReviewNote("");
    setAmlActionError("");
  }, [selectedProfile?.id]);

  const stats = useMemo(
    () => [
      { label: "Total profiles", value: profilesQuery.data?.total ?? 0 },
      { label: "Submitted", value: rows.filter((row) => row.status === "submitted").length },
      { label: "Required items", value: rows.reduce((total, row) => total + getRequiredRequirementCount(row), 0) },
    ],
    [profilesQuery.data?.total, rows],
  );

  const openDocument = async (document: AdminKycDocument) => {
    if (!token) {
      setDocumentError("Missing admin session.");
      return;
    }

    setDocumentError("");

    try {
      const response = await fetch(buildApiUrl(document.file_url), {
        headers: {
          Accept: document.mime_type || "application/octet-stream",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to open document. Status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Unable to open document.");
    }
  };

  const invalidateKycProfiles = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "kyc-profiles"] });
  };

  const invalidateSelectedKycProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "kyc-profile-detail", selectedUserId] });
  };

  const approveMutation = useMutation({
    mutationFn: async (profile: AdminKycProfile) =>
      requestApi<AdminKycReviewResponse>(`/admin/users/${profile.user_id}/kyc-profile/approve`, {
        method: "POST",
        token,
        body: { review_note: approvalReviewNote.trim() || null },
      }),
    onSuccess: async (response) => {
      await Promise.all([invalidateKycProfiles(), invalidateSelectedKycProfile()]);
      setSelectedProfile(response.kyc_profile);
      setReviewError("");
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to approve KYC/KYB profile.");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (profile: AdminKycProfile) =>
      requestApi<AdminKycReviewResponse>(`/admin/users/${profile.user_id}/kyc-profile/reject`, {
        method: "POST",
        token,
        body: {
          rejection_reason: rejectionReason.trim(),
          review_note: rejectionReviewNote.trim() || null,
        },
      }),
    onSuccess: async (response) => {
      await Promise.all([invalidateKycProfiles(), invalidateSelectedKycProfile()]);
      setSelectedProfile(response.kyc_profile);
      setRejectDialogOpen(false);
      setRejectionReason("");
      setRejectionReviewNote("");
      setReviewError("");
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to reject KYC/KYB profile.");
    },
  });

  const amlMutation = useMutation({
    mutationFn: async (profile: AdminKycProfile) =>
      requestApi<{ message?: string; aml_screenings: AdminAmlScreening[] }>(
        `/admin/users/${profile.user_id}/kyc-profile/aml-screenings/run`,
        {
          method: "POST",
          token,
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        invalidateKycProfiles(),
        invalidateSelectedKycProfile(),
        queryClient.invalidateQueries({ queryKey: ["admin", "aml-screenings", selectedUserId] }),
      ]);
      setReviewError("");
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to run AML screening.");
    },
  });

  const closeAmlAction = () => {
    setAmlAction(null);
    setSelectedAmlScreening(null);
    setAmlReviewNote("");
    setAmlActionError("");
  };

  const refreshAmlData = async () => {
    await Promise.all([
      invalidateKycProfiles(),
      invalidateSelectedKycProfile(),
      queryClient.invalidateQueries({ queryKey: ["admin", "aml-screenings", selectedUserId] }),
    ]);
  };

  const amlClearMutation = useMutation({
    mutationFn: (screening: AdminAmlScreening) =>
      clearAdminAmlScreening(screening.id, amlReviewNote.trim() || null, token),
    onSuccess: async () => {
      closeAmlAction();
      await refreshAmlData();
    },
    onError: (error) => {
      setAmlActionError(error instanceof Error ? error.message : "Unable to manually clear AML screening.");
    },
  });

  const amlConfirmMutation = useMutation({
    mutationFn: (screening: AdminAmlScreening) =>
      confirmAdminAmlMatch(screening.id, amlReviewNote.trim() || null, token),
    onSuccess: async () => {
      closeAmlAction();
      await refreshAmlData();
    },
    onError: (error) => {
      setAmlActionError(error instanceof Error ? error.message : "Unable to confirm AML match.");
    },
  });

  const requestUpdateMutation = useMutation({
    mutationFn: async ({
      profile,
      target,
      reason,
    }: {
      profile: AdminKycProfile;
      target: UpdateRequestTarget;
      reason: string;
    }) =>
      requestApi<AdminKycReviewResponse>(`/admin/users/${profile.user_id}/kyc-profile/requirements/request-update`, {
        method: "POST",
        token,
        body: {
          key: target.key,
          label: target.label,
          category: target.category,
          requirement_type: target.requirement_type,
          subject_type: target.subject_type ?? null,
          subject_id: target.subject_id ?? null,
          reason: reason.trim(),
          review_note: updateReviewNote.trim() || null,
          metadata: target.metadata ?? {},
        },
      }),
    onSuccess: async (response) => {
      await Promise.all([invalidateKycProfiles(), invalidateSelectedKycProfile()]);
      setSelectedProfile(response.kyc_profile);
      setUpdateRequestDialogOpen(false);
      setUpdateRequestTarget(null);
      setUpdateRequestReason("");
      setUpdateReviewNote("");
      setReviewError("");
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to request a KYC/KYB update.");
    },
  });

  const providerApproveMutation = useMutation({
    mutationFn: (submission: AdminKycProviderSubmission) => {
      if (!submission.provider?.code) throw new Error("Provider is unavailable for review.");

      return approveAdminKycProviderSubmission(
        submission.user_id,
        submission.provider.code,
        providerReviewNote.trim() || null,
        token,
      );
    },
    onSuccess: async () => {
      setProviderAction(null);
      setSelectedProviderSubmission(null);
      setProviderReviewNote("");
      setProviderActionError("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "kyc-provider-submissions", selectedUserId] });
    },
    onError: (error) => {
      setProviderActionError(error instanceof Error ? error.message : "Unable to approve provider submission.");
    },
  });

  const providerRejectMutation = useMutation({
    mutationFn: (submission: AdminKycProviderSubmission) => {
      if (!submission.provider?.code) throw new Error("Provider is unavailable for review.");

      return rejectAdminKycProviderSubmission(
        submission.user_id,
        submission.provider.code,
        providerRejectionReason.trim(),
        providerReviewNote.trim() || null,
        token,
      );
    },
    onSuccess: async () => {
      setProviderAction(null);
      setSelectedProviderSubmission(null);
      setProviderRejectionReason("");
      setProviderReviewNote("");
      setProviderActionError("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "kyc-provider-submissions", selectedUserId] });
    },
    onError: (error) => {
      setProviderActionError(error instanceof Error ? error.message : "Unable to reject provider submission.");
    },
  });

  const openUpdateRequestDialog = (target: UpdateRequestTarget) => {
    setUpdateRequestTarget(target);
    setUpdateRequestReason("");
    setReviewError("");
    setUpdateRequestDialogOpen(true);
  };

  const selectedRequiredRequirementCount = selectedProfile ? getRequiredRequirementCount(selectedProfile) : 0;
  const selectedActiveAmlScreenings =
    selectedProfile?.aml_screenings?.filter((screening) => isActiveAmlScreening(screening.status)) ?? [];
  const selectedAmlMissing = Boolean(selectedProfile) && selectedActiveAmlScreenings.length === 0;
  const selectedBlockingAmlCount = selectedActiveAmlScreenings.filter(
    (screening) => !isAmlClearForApproval(screening.status, screening.compliance_decision),
  ).length;
  const selectedAmlApprovalBlocked = selectedAmlMissing || selectedBlockingAmlCount > 0;
  const providerApprovalCompatible =
    Boolean(selectedProfile) &&
    ["verified", "approved"].includes(String(selectedProfile?.status).toLowerCase()) &&
    !selectedAmlApprovalBlocked;
  const isReviewing =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    amlMutation.isPending ||
    amlClearMutation.isPending ||
    amlConfirmMutation.isPending ||
    requestUpdateMutation.isPending;

  const openProviderAction = (submission: AdminKycProviderSubmission, action: "approve" | "reject") => {
    setSelectedProviderSubmission(submission);
    setProviderAction(action);
    setProviderReviewNote("");
    setProviderRejectionReason("");
    setProviderActionError("");
  };

  const openAmlAction = (screening: AdminAmlScreening, action: "confirm" | "clear") => {
    setSelectedAmlScreening(screening);
    setAmlAction(action);
    setAmlReviewNote("");
    setAmlActionError("");
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-2xl">KYC/KYB reviews</CardTitle>
            <CardDescription>
              Review customer identity profiles, required documents, related persons, and AML results before provider handoff.
            </CardDescription>
          </div>
          <div className="w-full max-w-xs">
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as typeof statusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>

          {reviewError && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {reviewError}
            </div>
          )}

          {profilesQuery.isError && (
            <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {profilesQuery.error instanceof Error ? profilesQuery.error.message : "Unable to load KYC/KYB profiles."}
            </div>
          )}

          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table className="min-w-[1040px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requirements</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length > 0 ? (
                      rows.map((profile) => {
                        const requiredRequirements = getRequiredRequirementCount(profile);

                        return (
                          <TableRow key={profile.id}>
                            <TableCell>
                              <div className="font-medium text-slate-900">{getProfileName(profile)}</div>
                              <div className="text-xs text-slate-500">
                                {profile.user?.email ?? `User #${profile.user_id}`}
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{profile.applicant_type}</TableCell>
                            <TableCell>{profile.country_code || profile.registered_country_code || "-"}</TableCell>
                            <TableCell>
                              <Badge className={statusClassName(profile.status)}>{profile.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={requiredRequirements > 0 ? "secondary" : "outline"}>
                                {requiredRequirements} required
                              </Badge>
                            </TableCell>
                            <TableCell>{profile.documents?.length ?? 0}</TableCell>
                            <TableCell>{formatDate(profile.submitted_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="bg-slate-950 text-white hover:bg-slate-800"
                                onClick={() => {
                                  setSelectedUserId(profile.user_id);
                                  setSelectedProfile(null);
                                  setReviewDialogOpen(true);
                                }}
                              >
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-36 text-center text-slate-500">
                          {profilesQuery.isLoading ? "Loading KYC/KYB profiles..." : "No KYC/KYB profiles found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <div>
                Page {profilesQuery.data?.current_page ?? page} of {profilesQuery.data?.last_page ?? 1}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoBack}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canGoNext}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>

            <Dialog
              open={reviewDialogOpen}
              onOpenChange={(open) => {
                setReviewDialogOpen(open);
                if (!open) {
                  setSelectedUserId(null);
                  setSelectedProfile(null);
                }
              }}
            >
              <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto rounded-3xl">
                <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  KYC/KYB review
                </DialogTitle>
                <DialogDescription>
                  Internal approval must be completed before releasing the customer to provider onboarding.
                </DialogDescription>
              </DialogHeader>
              <div>
                {profileDetailQuery.isLoading ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">
                    Loading KYC/KYB detail...
                  </div>
                ) : profileDetailQuery.isError ? (
                  <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {profileDetailQuery.error instanceof Error
                      ? profileDetailQuery.error.message
                      : "Unable to load KYC/KYB detail."}
                  </div>
                ) : selectedProfile ? (
                  <div className="space-y-6">
                    {reviewError && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {reviewError}
                      </div>
                    )}

                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-slate-950">{getProfileName(selectedProfile)}</div>
                          <div className="text-sm text-slate-500">
                            {selectedProfile.user?.email ?? `User #${selectedProfile.user_id}`}
                          </div>
                        </div>
                        <Badge className={statusClassName(selectedProfile.status)}>{selectedProfile.status}</Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                        <DetailItem label="User ID" value={`#${selectedProfile.user_id}`} />
                        <DetailItem label="Email" value={selectedProfile.user?.email || "-"} />
                        <DetailItem label="Phone" value={selectedProfile.user?.phone || "-"} />
                        <DetailItem label="Applicant type" value={selectedProfile.applicant_type} />
                        <DetailItem label="Country" value={selectedProfile.country_code} />
                        <DetailItem label="Submitted" value={formatDate(selectedProfile.submitted_at)} />
                        <DetailItem label="Reviewed" value={formatDate(selectedProfile.reviewed_at)} />
                      </div>
                    </div>

                    <Section title="Profile information">
                      <div className="mb-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                          onClick={() => openUpdateRequestDialog(profileUpdateTarget(selectedProfile))}
                        >
                          Request profile update
                        </Button>
                      </div>
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <DetailItem label="Legal name" value={selectedProfile.legal_name} />
                        <DetailItem label="Date of birth" value={formatDateOnly(selectedProfile.date_of_birth)} />
                        <DetailItem label="Nationality" value={selectedProfile.nationality_country_code || "-"} />
                        <DetailItem label="Residence" value={selectedProfile.residence_country_code || "-"} />
                        {selectedProfile.applicant_type === "business" && (
                          <>
                            <DetailItem label="Business name" value={selectedProfile.business_name || "-"} />
                            <DetailItem
                              label="Registration no."
                              value={selectedProfile.business_registration_number || "-"}
                            />
                            <DetailItem label="Tax ID" value={maskSensitiveValue(selectedProfile.tax_id)} />
                            <DetailItem label="Registered country" value={selectedProfile.registered_country_code || "-"} />
                          </>
                        )}
                        <DetailItem
                          label="Address"
                          value={[
                            selectedProfile.address_line1,
                            selectedProfile.city,
                            selectedProfile.state,
                            selectedProfile.postal_code,
                            selectedProfile.country_code,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        />
                      </div>
                    </Section>

                    <Section title="Requirements">
                      <div className="space-y-2">
                        {selectedProfile.requirements?.length ? (
                          selectedProfile.requirements.map((requirement) => {
                            const resubmittedAt =
                              typeof requirement.metadata?.resubmitted_at === "string"
                                ? requirement.metadata.resubmitted_at
                                : "";
                            const resubmissionNote =
                              typeof requirement.metadata?.resubmission_note === "string"
                                ? requirement.metadata.resubmission_note
                                : "";

                            return (
                              <div
                                key={requirement.key}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 p-3 text-sm"
                              >
                                <div>
                                  <div className="font-medium text-slate-900">{requirement.label}</div>
                                  {requirement.rejection_reason && (
                                    <div className="text-xs text-red-600">{requirement.rejection_reason}</div>
                                  )}
                                  {resubmittedAt && (
                                    <div className="mt-1 text-xs font-medium text-emerald-700">
                                      Resubmitted {formatDate(resubmittedAt)}
                                    </div>
                                  )}
                                  {resubmissionNote && (
                                    <div className="mt-1 text-xs text-slate-500">Customer note: {resubmissionNote}</div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className={statusClassName(requirement.status)}>{requirement.status}</Badge>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                    onClick={() => openUpdateRequestDialog(requirementUpdateTarget(requirement))}
                                  >
                                    Request update
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-slate-500">No requirements recorded.</div>
                        )}
                      </div>
                    </Section>

                    <Section title="Documents">
                      <div className="space-y-2">
                        {documentError && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {documentError}
                          </div>
                        )}
                        {selectedProfile.documents?.length ? (
                          selectedProfile.documents.map((document) => (
                            <div
                              key={document.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 p-3 text-sm"
                            >
                              <div>
                                <div className="font-medium text-slate-900">{document.type}</div>
                                <div className="mt-1 break-all text-xs text-slate-500">
                                  {document.original_name || "Stored KYC evidence"}
                                </div>
                                {document.document_number && (
                                  <div className="mt-1 text-xs text-slate-500">
                                    Document no. {maskSensitiveValue(document.document_number)}
                                  </div>
                                )}
                                {document.metadata?.resubmission_requirement_key && (
                                  <div className="mt-1 text-xs font-medium text-emerald-700">
                                    Resubmitted for {formatMetadataValue(document.metadata.resubmission_requirement_key)}
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="mt-2 rounded-full"
                                  onClick={() => void openDocument(document)}
                                >
                                  Open document
                                </Button>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={statusClassName(document.status)}>{document.status}</Badge>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                  onClick={() => openUpdateRequestDialog(documentUpdateTarget(document))}
                                >
                                  Request resend
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No documents submitted.</div>
                        )}
                      </div>
                    </Section>

                    <Section title="Related persons">
                      <div className="space-y-2">
                        {selectedProfile.related_persons?.length ? (
                          selectedProfile.related_persons.map((person) => (
                            <div key={person.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-medium text-slate-900">{person.legal_name}</div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className={statusClassName(person.status)}>{person.status}</Badge>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                    onClick={() => openUpdateRequestDialog(relatedPersonUpdateTarget(person))}
                                  >
                                    Request update
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-2">
                                <DetailItem label="Role" value={person.relationship_type} />
                                <DetailItem label="Ownership" value={formatPercent(person.ownership_percentage)} />
                                <DetailItem label="Country" value={person.country_code || "-"} />
                                <DetailItem label="DOB" value={formatDateOnly(person.date_of_birth)} />
                              </div>
                              {person.documents?.length ? (
                                <div className="mt-3 space-y-2">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Documents
                                  </div>
                                  {person.documents.map((document) => (
                                    <div
                                      key={document.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                                    >
                                      <div>
                                        <div className="font-medium text-slate-900">{document.type}</div>
                                        <div className="break-all text-xs text-slate-500">
                                          {document.original_name || "Stored related-person evidence"}
                                        </div>
                                        {document.document_number && (
                                          <div className="text-xs text-slate-500">
                                            Document no. {maskSensitiveValue(document.document_number)}
                                          </div>
                                        )}
                                        {document.metadata?.resubmission_requirement_key && (
                                          <div className="text-xs font-medium text-emerald-700">
                                            Resubmitted for {formatMetadataValue(document.metadata.resubmission_requirement_key)}
                                          </div>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full"
                                        onClick={() => void openDocument(document)}
                                      >
                                        Open
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                        onClick={() => openUpdateRequestDialog(documentUpdateTarget(document, person))}
                                      >
                                        Request resend
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No related persons submitted.</div>
                        )}
                      </div>
                    </Section>

                    <Section title="AML screenings">
                      {amlScreeningsQuery.isLoading ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          Loading AML screenings...
                        </div>
                      ) : amlScreeningsQuery.isError ? (
                        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          {amlScreeningsQuery.error instanceof Error
                            ? amlScreeningsQuery.error.message
                            : "Unable to load AML screenings."}
                        </div>
                      ) : amlScreeningsQuery.data?.data.length ? (
                        <div className="space-y-3">
                          {amlScreeningsQuery.data.data.map((screening) => (
                            <div key={screening.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-slate-900">AML screening</div>
                                  <div className="text-xs text-slate-500">{screening.subject_role}</div>
                                </div>
                                <Badge className={statusClassName(screening.status)}>{screening.status}</Badge>
                              </div>
                              <div className="mt-3 grid gap-3 text-slate-600 md:grid-cols-2 lg:grid-cols-3">
                                <DetailItem label="Screening status" value={screening.status} />
                                <DetailItem label="Provider" value={screening.screening_provider} />
                                <DetailItem label="Created" value={formatDate(screening.created_at)} />
                                <DetailItem label="Completed" value={formatDate(screening.screened_at)} />
                                <DetailItem label="Review status" value={screening.status} />
                                <DetailItem
                                  label="Reviewer"
                                  value={screening.reviewed_by?.full_name || screening.reviewed_by?.email || "-"}
                                />
                              </div>
                              <div className="mt-3 space-y-2">
                                {screening.matches?.length ? (
                                  screening.matches.map((match) => (
                                    <div key={match.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 text-slate-600 md:grid-cols-3">
                                      <DetailItem label="Match status" value={match.status} />
                                      <DetailItem label="Match type" value={match.list_type} />
                                      <DetailItem label="Match score" value={match.score ?? "-"} />
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No AML matches found.</div>
                                )}
                              </div>
                              {screening.review_note ? (
                                <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
                                  Review note: {screening.review_note}
                                </div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {isAmlClearForApproval(screening.status, screening.compliance_decision) ? (
                                  <div className="text-xs font-medium text-emerald-700">AML cleared automatically</div>
                                ) : null}
                                {requiresManualAmlReview(screening.status, screening.compliance_decision) ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                                      disabled={isReviewing}
                                      onClick={() => openAmlAction(screening, "clear")}
                                    >
                                      Clear AML
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                      disabled={isReviewing}
                                      onClick={() => openAmlAction(screening, "confirm")}
                                    >
                                      Confirm AML Match
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          No AML screenings found.
                        </div>
                      )}
                    </Section>

                    <Section title="Provider submissions">
                      {providerSubmissionsQuery.isLoading ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          Loading provider submissions...
                        </div>
                      ) : providerSubmissionsQuery.isError ? (
                        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                          {providerSubmissionsQuery.error instanceof Error
                            ? providerSubmissionsQuery.error.message
                            : "Unable to load provider submissions."}
                        </div>
                      ) : providerSubmissionsQuery.data?.data.length ? (
                        <div className="space-y-3">
                          {providerSubmissionsQuery.data.data.map((submission) => {
                            const providerCodeAvailable = Boolean(submission.provider?.code);

                            return (
                              <div key={submission.id} className="rounded-2xl border border-slate-200 p-4 text-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-slate-500" />
                                    <div className="font-semibold text-slate-900">
                                      {submission.provider?.name || "Provider unavailable"}
                                    </div>
                                  </div>
                                  <Badge className={statusClassName(submission.status)}>{submission.status}</Badge>
                                </div>
                                <div className="mt-4 grid gap-3 text-slate-600 md:grid-cols-2 lg:grid-cols-3">
                                  <DetailItem label="Submission status" value={submission.status} />
                                  <DetailItem label="Provider account status" value={submission.provider_account?.status || "-"} />
                                  <DetailItem label="Submitted" value={formatDate(submission.submitted_at)} />
                                  <DetailItem label="Approved" value={formatDate(submission.approved_at)} />
                                  <DetailItem label="Rejected" value={formatDate(submission.rejected_at)} />
                                  <DetailItem label="Reviewed" value={formatDate(submission.reviewed_at)} />
                                  <DetailItem
                                    label="Reviewed by"
                                    value={submission.reviewed_by?.full_name || submission.reviewed_by?.email || "-"}
                                  />
                                </div>
                                {submission.failure_reason ? (
                                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-red-700">
                                    Failure reason: {submission.failure_reason}
                                  </div>
                                ) : null}
                                {submission.review_note ? (
                                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-slate-600">
                                    Review note: {submission.review_note}
                                  </div>
                                ) : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="rounded-full bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                                    disabled={!providerCodeAvailable || !providerApprovalCompatible || providerApproveMutation.isPending || providerRejectMutation.isPending}
                                    onClick={() => openProviderAction(submission, "approve")}
                                  >
                                    Approve provider
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    disabled={!providerCodeAvailable || providerApproveMutation.isPending || providerRejectMutation.isPending}
                                    onClick={() => openProviderAction(submission, "reject")}
                                  >
                                    Reject provider
                                  </Button>
                                </div>
                                {!providerApprovalCompatible ? (
                                  <div className="mt-3 text-xs text-amber-700">
                                    Provider approval requires verified internal KYC and a compatible AML state. The backend makes the final decision.
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          No provider submissions found.
                        </div>
                      )}
                    </Section>

                    <div className="space-y-2">
                      <Label htmlFor="approval-review-note">Approval review note</Label>
                      <Textarea
                        id="approval-review-note"
                        value={approvalReviewNote}
                        onChange={(event) => setApprovalReviewNote(event.target.value)}
                        placeholder="Optional internal note"
                        className="min-h-24 rounded-2xl border-slate-200"
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        disabled={isReviewing}
                        onClick={() => void amlMutation.mutateAsync(selectedProfile)}
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Run AML
                      </Button>
                      <Button
                        type="button"
                        className="rounded-2xl bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                        disabled={isReviewing || selectedRequiredRequirementCount > 0 || selectedAmlApprovalBlocked}
                        onClick={() => void approveMutation.mutateAsync(selectedProfile)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={isReviewing}
                        onClick={() => setRejectDialogOpen(true)}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>

                    {selectedRequiredRequirementCount > 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Submit all required KYC requirements before approving this profile.
                      </div>
                    )}

                    {selectedAmlApprovalBlocked && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        {selectedAmlMissing
                          ? "Run AML screening before approving this profile."
                          : "Clear or manually clear all active AML screenings before approving this profile."}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">
                    Select a KYC/KYB profile to review.
                  </div>
                )}
              </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Reject KYC/KYB profile</DialogTitle>
            <DialogDescription>
              Give the customer a clear reason so the profile can be corrected and resubmitted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Rejection reason</Label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Missing document, mismatch, expired document..."
              className="min-h-28 rounded-2xl border-slate-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rejection-review-note">Internal review note</Label>
            <Textarea
              id="rejection-review-note"
              value={rejectionReviewNote}
              onChange={(event) => setRejectionReviewNote(event.target.value)}
              placeholder="Optional note retained with this rejection"
              className="min-h-24 rounded-2xl border-slate-200"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={!selectedProfile || !rejectionReason.trim() || rejectMutation.isPending}
              onClick={() => selectedProfile && void rejectMutation.mutateAsync(selectedProfile)}
            >
              Reject profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={amlAction !== null}
        onOpenChange={(open) => {
          if (!open) closeAmlAction();
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>{amlAction === "confirm" ? "Confirm AML match" : "Clear AML screening"}</DialogTitle>
            <DialogDescription>
              {amlAction === "confirm"
                ? "Confirm that the potential AML match is a true match. This decision affects KYC eligibility."
                : "Confirm that this screening has been reviewed and can be manually cleared. The backend remains authoritative."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Current status</div>
            <div className="mt-1 font-semibold text-slate-900">{selectedAmlScreening?.status || "-"}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aml-review-note">Review note</Label>
            <Textarea
              id="aml-review-note"
              value={amlReviewNote}
              onChange={(event) => setAmlReviewNote(event.target.value)}
              placeholder="Optional internal review note"
              className="min-h-24 rounded-2xl border-slate-200"
            />
          </div>
          {amlActionError ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {amlActionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAmlAction}>Cancel</Button>
            <Button
              type="button"
              className={amlAction === "confirm" ? "bg-red-600 text-white hover:bg-red-700" : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"}
              disabled={!selectedAmlScreening || amlClearMutation.isPending || amlConfirmMutation.isPending}
              onClick={() => {
                if (!selectedAmlScreening) return;
                if (amlAction === "confirm") amlConfirmMutation.mutate(selectedAmlScreening);
                if (amlAction === "clear") amlClearMutation.mutate(selectedAmlScreening);
              }}
            >
              {amlAction === "confirm" ? "Confirm AML match" : "Confirm AML clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={providerAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProviderAction(null);
            setSelectedProviderSubmission(null);
            setProviderReviewNote("");
            setProviderRejectionReason("");
            setProviderActionError("");
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>{providerAction === "approve" ? "Approve provider submission" : "Reject provider submission"}</DialogTitle>
            <DialogDescription>
              {providerAction === "approve"
                ? "Confirm that this verified customer can be released to the provider. The backend will revalidate KYC and AML eligibility."
                : "Reject this provider submission with a clear reason for the internal record."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Provider</div>
            <div className="mt-1 font-semibold text-slate-900">
              {selectedProviderSubmission?.provider?.name || "Provider unavailable"}
            </div>
          </div>
          {providerAction === "reject" ? (
            <div className="space-y-2">
              <Label htmlFor="provider-rejection-reason">Rejection reason</Label>
              <Textarea
                id="provider-rejection-reason"
                value={providerRejectionReason}
                onChange={(event) => {
                  setProviderRejectionReason(event.target.value);
                  setProviderActionError("");
                }}
                placeholder="Explain why this provider submission is being rejected"
                className="min-h-28 rounded-2xl border-slate-200"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="provider-review-note">Review note</Label>
            <Textarea
              id="provider-review-note"
              value={providerReviewNote}
              onChange={(event) => setProviderReviewNote(event.target.value)}
              placeholder="Optional internal note"
              className="min-h-24 rounded-2xl border-slate-200"
            />
          </div>
          {providerActionError ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {providerActionError}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProviderAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={providerAction === "approve" ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-red-600 text-white hover:bg-red-700"}
              disabled={!selectedProviderSubmission || providerApproveMutation.isPending || providerRejectMutation.isPending}
              onClick={() => {
                if (!selectedProviderSubmission) return;
                if (providerAction === "reject" && !providerRejectionReason.trim()) {
                  setProviderActionError("Rejection reason is required.");
                  return;
                }
                if (providerAction === "approve") providerApproveMutation.mutate(selectedProviderSubmission);
                if (providerAction === "reject") providerRejectMutation.mutate(selectedProviderSubmission);
              }}
            >
              {providerAction === "approve" ? "Confirm provider approval" : "Confirm provider rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={updateRequestDialogOpen}
        onOpenChange={(open) => {
          setUpdateRequestDialogOpen(open);
          if (!open) {
            setUpdateRequestTarget(null);
            setUpdateRequestReason("");
          }
        }}
      >
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Request customer update</DialogTitle>
            <DialogDescription>
              Ask the customer to correct or resend this specific KYC/KYB item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Requested item</div>
              <div className="mt-1 font-semibold">{updateRequestTarget?.label || "-"}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="update-request-reason">Reason sent to customer</Label>
              <Textarea
                id="update-request-reason"
                value={updateRequestReason}
                onChange={(event) => setUpdateRequestReason(event.target.value)}
                placeholder="Explain what is inaccurate, missing, unclear, expired, or must be resent."
                className="min-h-32 rounded-2xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="update-review-note">Internal review note</Label>
              <Textarea
                id="update-review-note"
                value={updateReviewNote}
                onChange={(event) => setUpdateReviewNote(event.target.value)}
                placeholder="Optional internal context for this request"
                className="min-h-24 rounded-2xl border-slate-200"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUpdateRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
              disabled={
                !selectedProfile ||
                !updateRequestTarget ||
                !updateRequestReason.trim() ||
                requestUpdateMutation.isPending
              }
              onClick={() =>
                selectedProfile &&
                updateRequestTarget &&
                void requestUpdateMutation.mutateAsync({
                  profile: selectedProfile,
                  target: updateRequestTarget,
                  reason: updateRequestReason,
                })
              }
            >
              Send update request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-900">{value || "-"}</div>
    </div>
  );
}

export default AdminKycReviews;
