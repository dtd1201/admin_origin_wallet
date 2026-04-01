import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Inbox, Loader2, Mail, ShieldAlert, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiRequestError, deleteContactSubmission, getContactSubmissionDetail, getContactSubmissions } from "@/lib/api";
import type { ContactSubmission } from "@/types/admin";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const formatSubmittedAt = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const buildVisiblePages = (currentPage: number, lastPage: number) => {
  if (lastPage <= 5) {
    return Array.from({ length: lastPage }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, lastPage, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages).filter((page) => page >= 1 && page <= lastPage).sort((a, b) => a - b);
};

const AdminContactSubmissions = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token, logout } = useAuth();
  const [page, setPage] = useState(1);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const submissionsQuery = useQuery({
    queryKey: ["admin", "contact-submissions", page, token],
    enabled: !!token,
    queryFn: async () => getContactSubmissions(page, token),
    placeholderData: (previousData) => previousData,
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "contact-submissions", "detail", selectedSubmissionId, token],
    enabled: !!token && selectedSubmissionId !== null,
    queryFn: async () => getContactSubmissionDetail(selectedSubmissionId as number, token),
    retry: false,
  });
  const deleteMutation = useMutation({
    mutationFn: async (submissionId: number) => deleteContactSubmission(submissionId, token),
    onSuccess: async (_, deletedSubmissionId) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "contact-submissions"] });
      if (selectedSubmissionId === deletedSubmissionId) {
        setSelectedSubmissionId(null);
      }
      setDeleteError("");
      setPage((currentPage) => (rows.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage));
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete contact submission.");
    },
  });

  useEffect(() => {
    const currentError = submissionsQuery.error ?? detailQuery.error ?? deleteMutation.error;

    if (!(currentError instanceof ApiRequestError)) {
      return;
    }

    if (currentError.status !== 401 && currentError.status !== 403) {
      return;
    }

    void (async () => {
      await logout();
      navigate("/admin/login", { replace: true });
    })();
  }, [detailQuery.error, logout, navigate, submissionsQuery.error]);

  const submissionsPage = submissionsQuery.data;
  const rows = submissionsPage?.data ?? [];
  const visiblePages = useMemo(
    () => buildVisiblePages(submissionsPage?.current_page ?? 1, submissionsPage?.last_page ?? 1),
    [submissionsPage?.current_page, submissionsPage?.last_page],
  );

  const summaryCards = [
    {
      title: "Total submissions",
      value: String(submissionsPage?.total ?? 0),
      icon: Inbox,
    },
    {
      title: "Current page",
      value: String(submissionsPage?.current_page ?? 1),
      icon: Mail,
    },
    {
      title: "Per page",
      value: String(submissionsPage?.per_page ?? 15),
      icon: ShieldAlert,
    },
  ];

  const openDetail = (submission: ContactSubmission) => {
    setSelectedSubmissionId(submission.id);
  };

  const selectedSubmission = detailQuery.data;

  const handleDelete = async (submission: ContactSubmission) => {
    setDeleteError("");
    const confirmed = window.confirm(`Delete contact submission from ${submission.name} (#${submission.id})?`);
    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(submission.id);
  };
  const listErrorMessage = submissionsQuery.isError
    ? getErrorMessage(submissionsQuery.error, "Unable to load contact submissions right now.")
    : "";
  const detailErrorMessage = detailQuery.isError
    ? getErrorMessage(detailQuery.error, "Unable to load contact submission details.")
    : "";

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl">Contact submissions</CardTitle>
              <CardDescription>Review contact form messages submitted from the public website.</CardDescription>
            </div>
            <Badge className="w-fit rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 hover:bg-emerald-100">
              Newest first
            </Badge>
          </CardHeader>
          <CardContent>
            {(deleteError || listErrorMessage) && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError || listErrorMessage}</div>
            )}

            <div className="space-y-4 lg:hidden">
              {submissionsQuery.isLoading ? (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
                  <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                  Loading contact submissions...
                </div>
              ) : submissionsQuery.isError ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 py-12 text-center text-red-700">
                  {listErrorMessage}
                </div>
              ) : rows.length > 0 ? (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="mt-1 break-all text-sm text-slate-600">{row.email}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void handleDelete(row)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600">
                      <div>
                        <span className="font-medium text-slate-900">Company:</span> {row.company || "Not provided"}
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">Subject:</span> {row.subject}
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">Submitted:</span> {formatSubmittedAt(row.submitted_at)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
                  No contact submissions found.
                </div>
              )}
            </div>

            <div className="hidden lg:block">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissionsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                        Loading contact submissions...
                      </TableCell>
                    </TableRow>
                  ) : submissionsQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-red-700">
                        {listErrorMessage}
                      </TableCell>
                    </TableRow>
                  ) : rows.length > 0 ? (
                    rows.map((row) => (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => openDetail(row)}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[220px] break-all text-slate-700">{row.email}</div>
                        </TableCell>
                        <TableCell>{row.company || "Not provided"}</TableCell>
                        <TableCell>
                          <div className="max-w-[260px] truncate text-slate-700">{row.subject}</div>
                        </TableCell>
                        <TableCell>{formatSubmittedAt(row.submitted_at)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDetail(row);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDelete(row);
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-slate-500">
                        No contact submissions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {submissionsPage && submissionsPage.last_page > 1 && (
              <div className="mt-6 space-y-3">
                <div className="text-center text-sm text-slate-500">
                  Showing {submissionsPage.from ?? 0} to {submissionsPage.to ?? 0} of {submissionsPage.total} submissions
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (submissionsPage.prev_page_url) {
                            setPage((current) => Math.max(1, current - 1));
                          }
                        }}
                        className={!submissionsPage.prev_page_url ? "pointer-events-none opacity-50" : undefined}
                      />
                    </PaginationItem>
                    {visiblePages.map((visiblePage) => (
                      <PaginationItem key={visiblePage}>
                        <PaginationLink
                          href="#"
                          isActive={visiblePage === submissionsPage.current_page}
                          onClick={(event) => {
                            event.preventDefault();
                            setPage(visiblePage);
                          }}
                        >
                          {visiblePage}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          if (submissionsPage.next_page_url) {
                            setPage((current) => current + 1);
                          }
                        }}
                        className={!submissionsPage.next_page_url ? "pointer-events-none opacity-50" : undefined}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Inbox summary</CardTitle>
              <CardDescription>Quick signals for the current contact submission queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {summaryCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-950">{card.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">{card.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={selectedSubmissionId !== null} onOpenChange={(open) => !open && setSelectedSubmissionId(null)}>
        <DialogContent className="rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Contact submission detail</DialogTitle>
            <DialogDescription>Review the full message and metadata from this contact form submission.</DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="py-10 text-center text-slate-500">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
              Loading contact submission details...
            </div>
          ) : detailErrorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{detailErrorMessage}</div>
          ) : selectedSubmission ? (
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Name</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{selectedSubmission.name}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Email</div>
                <div className="mt-2 break-all text-lg font-semibold text-slate-950">{selectedSubmission.email}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Company</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{selectedSubmission.company || "Not provided"}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Submitted at</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{formatSubmittedAt(selectedSubmission.submitted_at)}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Subject</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{selectedSubmission.subject}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 md:col-span-2">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Message</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{selectedSubmission.message}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">IP address</div>
                <div className="mt-2 break-all text-sm font-medium text-slate-950">{selectedSubmission.ip_address || "Not provided"}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">User agent</div>
                <div className="mt-2 break-all text-sm font-medium text-slate-950">{selectedSubmission.user_agent || "Not provided"}</div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            {selectedSubmission && (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => void handleDelete(selectedSubmission)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedSubmissionId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContactSubmissions;
