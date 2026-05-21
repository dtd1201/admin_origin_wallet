import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, buildApiUrl, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminAmlScreening, AdminKycDocument, AdminKycProfile, AdminKycReviewResponse } from "@/types/admin";
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
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "needs_more_info", label: "Needs more info" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
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

const formatPercent = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : String(value);
};

const getProfileName = (profile: AdminKycProfile) =>
  profile.applicant_type === "business" ? profile.business_name || profile.legal_name : profile.legal_name;

const getOpenRequirementCount = (profile: AdminKycProfile) =>
  profile.requirements?.filter((requirement) =>
    ["required", "needs_more_info", "rejected"].includes(requirement.status),
  ).length ?? 0;

const AdminKycReviews = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<(typeof statusOptions)[number]["value"]>("all");
  const [selectedProfile, setSelectedProfile] = useState<AdminKycProfile | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [documentError, setDocumentError] = useState("");

  const queryPath = useMemo(() => {
    if (statusFilter === "all") {
      return adminEndpointConfig.kycProfiles;
    }

    return `${adminEndpointConfig.kycProfiles}?status=${statusFilter}`;
  }, [statusFilter]);

  const profilesQuery = useQuery({
    queryKey: ["admin", "kyc-profiles", statusFilter, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminKycProfile>>(queryPath, { method: "GET", token }),
  });

  const rows = profilesQuery.data?.data ?? [];

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedProfile(null);
      return;
    }

    if (!selectedProfile) {
      setSelectedProfile(rows[0]);
      return;
    }

    const latestProfile = rows.find((row) => row.id === selectedProfile.id);
    if (latestProfile) {
      setSelectedProfile(latestProfile);
      return;
    }

    setSelectedProfile(rows[0]);
  }, [rows, selectedProfile?.id]);

  useEffect(() => {
    setReviewNote(selectedProfile?.review_note ?? "");
    setRejectionReason("");
    setReviewError("");
    setDocumentError("");
  }, [selectedProfile?.id]);

  const stats = useMemo(
    () => [
      { label: "Total profiles", value: profilesQuery.data?.total ?? 0 },
      { label: "Submitted", value: rows.filter((row) => row.status === "submitted").length },
      { label: "Open requirements", value: rows.reduce((total, row) => total + getOpenRequirementCount(row), 0) },
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

  const approveMutation = useMutation({
    mutationFn: async (profile: AdminKycProfile) =>
      requestApi<AdminKycReviewResponse>(`/admin/users/${profile.user_id}/kyc-profile/approve`, {
        method: "POST",
        token,
        body: { review_note: reviewNote.trim() || null },
      }),
    onSuccess: async (response) => {
      await invalidateKycProfiles();
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
          review_note: reviewNote.trim() || null,
        },
      }),
    onSuccess: async (response) => {
      await invalidateKycProfiles();
      setSelectedProfile(response.kyc_profile);
      setRejectDialogOpen(false);
      setRejectionReason("");
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
      await invalidateKycProfiles();
      setReviewError("");
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to run AML screening.");
    },
  });

  const selectedOpenRequirementCount = selectedProfile ? getOpenRequirementCount(selectedProfile) : 0;
  const isReviewing = approveMutation.isPending || rejectMutation.isPending || amlMutation.isPending;

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
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
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

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requirements</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length > 0 ? (
                      rows.map((profile) => {
                        const isSelected = selectedProfile?.id === profile.id;
                        const openRequirements = getOpenRequirementCount(profile);

                        return (
                          <TableRow key={profile.id} className={isSelected ? "bg-emerald-50/60" : undefined}>
                            <TableCell>
                              <div className="font-medium text-slate-900">{getProfileName(profile)}</div>
                              <div className="text-xs text-slate-500">
                                {profile.user?.email ?? `User #${profile.user_id}`}
                              </div>
                            </TableCell>
                            <TableCell className="capitalize">{profile.applicant_type}</TableCell>
                            <TableCell>
                              <Badge className={statusClassName(profile.status)}>{profile.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={openRequirements > 0 ? "secondary" : "outline"}>
                                {openRequirements} open
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(profile.submitted_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                className={isSelected ? "bg-slate-950 text-white hover:bg-slate-800" : ""}
                                onClick={() => setSelectedProfile(profile)}
                              >
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-36 text-center text-slate-500">
                          {profilesQuery.isLoading ? "Loading KYC/KYB profiles..." : "No KYC/KYB profiles found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Card className="rounded-3xl border-slate-200 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Review detail
                </CardTitle>
                <CardDescription>
                  Internal approval must be completed before releasing the customer to provider onboarding.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedProfile ? (
                  <div className="space-y-6">
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
                        <DetailItem label="Applicant type" value={selectedProfile.applicant_type} />
                        <DetailItem label="Country" value={selectedProfile.country_code} />
                        <DetailItem label="Submitted" value={formatDate(selectedProfile.submitted_at)} />
                        <DetailItem label="Reviewed" value={formatDate(selectedProfile.reviewed_at)} />
                      </div>
                    </div>

                    <Section title="Profile information">
                      <div className="grid gap-3 text-sm md:grid-cols-2">
                        <DetailItem label="Legal name" value={selectedProfile.legal_name} />
                        <DetailItem label="Date of birth" value={selectedProfile.date_of_birth || "-"} />
                        <DetailItem label="Nationality" value={selectedProfile.nationality_country_code || "-"} />
                        <DetailItem label="Residence" value={selectedProfile.residence_country_code || "-"} />
                        {selectedProfile.applicant_type === "business" && (
                          <>
                            <DetailItem label="Business name" value={selectedProfile.business_name || "-"} />
                            <DetailItem
                              label="Registration no."
                              value={selectedProfile.business_registration_number || "-"}
                            />
                            <DetailItem label="Tax ID" value={selectedProfile.tax_id || "-"} />
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
                          selectedProfile.requirements.map((requirement) => (
                            <div
                              key={requirement.key}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 p-3 text-sm"
                            >
                              <div>
                                <div className="font-medium text-slate-900">{requirement.label}</div>
                                {requirement.rejection_reason && (
                                  <div className="text-xs text-red-600">{requirement.rejection_reason}</div>
                                )}
                              </div>
                              <Badge className={statusClassName(requirement.status)}>{requirement.status}</Badge>
                            </div>
                          ))
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
                                  {document.original_name || document.file_path || "Stored KYC evidence"}
                                </div>
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
                              <Badge className={statusClassName(document.status)}>{document.status}</Badge>
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
                                <Badge className={statusClassName(person.status)}>{person.status}</Badge>
                              </div>
                              <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-2">
                                <DetailItem label="Role" value={person.relationship_type} />
                                <DetailItem label="Ownership" value={formatPercent(person.ownership_percentage)} />
                                <DetailItem label="Country" value={person.country_code || "-"} />
                                <DetailItem label="DOB" value={person.date_of_birth || "-"} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No related persons submitted.</div>
                        )}
                      </div>
                    </Section>

                    <Section title="AML screenings">
                      <div className="space-y-2">
                        {selectedProfile.aml_screenings?.length ? (
                          selectedProfile.aml_screenings.map((screening) => (
                            <div key={screening.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <div className="font-medium text-slate-900">{screening.subject_name}</div>
                                  <div className="text-xs text-slate-500">{screening.subject_role}</div>
                                </div>
                                <Badge className={statusClassName(screening.status)}>{screening.status}</Badge>
                              </div>
                              <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-2">
                                <DetailItem label="Provider" value={screening.screening_provider} />
                                <DetailItem label="Risk" value={screening.risk_level || "-"} />
                                <DetailItem label="Score" value={screening.risk_score ?? "-"} />
                                <DetailItem label="Screened" value={formatDate(screening.screened_at)} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No AML screening has been run yet.</div>
                        )}
                      </div>
                    </Section>

                    <div className="space-y-2">
                      <Label htmlFor="review-note">Review note</Label>
                      <Textarea
                        id="review-note"
                        value={reviewNote}
                        onChange={(event) => setReviewNote(event.target.value)}
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
                        disabled={isReviewing || selectedOpenRequirementCount > 0}
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

                    {selectedOpenRequirementCount > 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Resolve open requirements before approving this profile.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">
                    Select a KYC/KYB profile to review.
                  </div>
                )}
              </CardContent>
            </Card>
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
