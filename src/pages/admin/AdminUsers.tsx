import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Plus, Search, Trash2, UserCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type {
  AdminRoleRecord,
  AdminUser,
  AdminUserDetail,
  AdminUserIntegrationLinkSlot,
  AdminUserIntegrationLinksResponse,
  ProviderSummary,
} from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type IntegrationLinkForm = {
  provider_code: string;
  provider_name: string;
  provider_status: string;
  link_url: string;
  link_label: string;
  is_active: boolean;
  enabled: boolean;
  request_status?: string | null;
  request_note?: string | null;
};

type UserFormState = {
  email: string;
  phone: string;
  full_name: string;
  password: string;
  status: "active" | "pending" | "suspended";
  kyc_status: "pending" | "approved" | "rejected";
  integration_links: IntegrationLinkForm[];
};

const emptyUserForm: UserFormState = {
  email: "",
  phone: "",
  full_name: "",
  password: "",
  status: "active",
  kyc_status: "pending",
  integration_links: [],
};

const getRoleLabel = (role: string | AdminRoleRecord) => (typeof role === "string" ? role : role.role_code || "unknown");

const normalizeIntegrationLinks = (providers: ProviderSummary[]): IntegrationLinkForm[] => {
  return providers.map((provider) => ({
    provider_code: provider.code,
    provider_name: provider.name,
    provider_status: provider.status,
    link_url: "",
    link_label: `Connect ${provider.name}`,
    is_active: true,
    enabled: false,
    request_status: null,
    request_note: null,
  }));
};

const normalizeIntegrationSlots = (slots: AdminUserIntegrationLinkSlot[]): IntegrationLinkForm[] => {
  return slots.map((slot) => ({
    provider_code: slot.provider.code,
    provider_name: slot.provider.name,
    provider_status: slot.provider.status,
    link_url: slot.integration_link?.link_url ?? "",
    link_label: slot.integration_link?.link_label ?? `Connect ${slot.provider.name}`,
    is_active: slot.integration_link?.is_active ?? true,
    enabled: Boolean(slot.integration_link),
    request_status: slot.integration_request?.status ?? null,
    request_note: slot.integration_request?.note ?? null,
  }));
};

const AdminUsers = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [formState, setFormState] = useState<UserFormState>(emptyUserForm);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin", "users", token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminUser>>(adminEndpointConfig.users, { method: "GET", token }),
  });

  const providersQuery = useQuery({
    queryKey: ["admin", "providers", token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<ProviderSummary>>(adminEndpointConfig.providers, { method: "GET", token }),
  });

  const userDetailQuery = useQuery({
    queryKey: ["admin", "user-detail", selectedUserId, token],
    enabled: !!token && dialogMode === "edit" && selectedUserId !== null,
    queryFn: async () => requestApi<AdminUserDetail>(`${adminEndpointConfig.users}/${selectedUserId}`, { method: "GET", token }),
  });

  const userIntegrationLinksQuery = useQuery({
    queryKey: ["admin", "user-integration-links", selectedUserId, token],
    enabled: !!token && dialogMode === "edit" && selectedUserId !== null,
    queryFn: async () =>
      requestApi<AdminUserIntegrationLinksResponse>(`${adminEndpointConfig.users}/${selectedUserId}/integration-links`, {
        method: "GET",
        token,
      }),
  });

  const rows = useMemo(() => usersQuery.data?.data ?? [], [usersQuery.data?.data]);
  const activeProviders = useMemo(
    () => (providersQuery.data?.data ?? []).filter((provider) => provider.status === "active"),
    [providersQuery.data?.data],
  );
  const listIntegrationQueries = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["admin", "users", "list-integration-links", row.id, token],
      enabled: !!token,
      queryFn: async () =>
        requestApi<AdminUserIntegrationLinksResponse>(`${adminEndpointConfig.users}/${row.id}/integration-links`, {
          method: "GET",
          token,
        }),
    })),
  });

  const pendingRequestMap = useMemo(() => {
    return rows.reduce<Record<number, { count: number; providers: string[] }>>((accumulator, row, index) => {
      const query = listIntegrationQueries[index];
      const pendingProviders =
        query?.data?.data
          .filter((slot) => slot.integration_request?.status?.toLowerCase() === "pending")
          .map((slot) => slot.provider.name) ?? [];

      accumulator[row.id] = {
        count: pendingProviders.length,
        providers: pendingProviders,
      };

      return accumulator;
    }, {});
  }, [listIntegrationQueries, rows]);

  useEffect(() => {
    if (dialogMode === "create") {
      setFormState({
        ...emptyUserForm,
        integration_links: normalizeIntegrationLinks(activeProviders),
      });
      setFormError("");
    }
  }, [activeProviders, dialogMode]);

  useEffect(() => {
    if (dialogMode === "edit" && userDetailQuery.data && userIntegrationLinksQuery.data) {
      setFormState({
        email: userDetailQuery.data.email,
        phone: userDetailQuery.data.phone ?? "",
        full_name: userDetailQuery.data.full_name,
        password: "",
        status:
          userDetailQuery.data.status === "suspended"
            ? "suspended"
            : userDetailQuery.data.status === "pending"
              ? "pending"
              : "active",
        kyc_status:
          userDetailQuery.data.kyc_status === "approved"
            ? "approved"
            : userDetailQuery.data.kyc_status === "rejected"
              ? "rejected"
              : "pending",
        integration_links: normalizeIntegrationSlots(userIntegrationLinksQuery.data.data),
      });
      setFormError("");
    }
  }, [dialogMode, userDetailQuery.data, userIntegrationLinksQuery.data]);

  const query = search.trim().toLowerCase();
  const filteredRows = !query
    ? rows
    : rows.filter((row) => {
        const haystack = [row.full_name, row.email, row.status, row.kyc_status, row.phone, row.profile?.user_type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: UserFormState) =>
      requestApi<AdminUser>(adminEndpointConfig.users, {
        method: "POST",
        token,
        body: {
          email: payload.email.trim(),
          phone: payload.phone.trim(),
          full_name: payload.full_name.trim(),
          password: payload.password,
          status: payload.status,
          kyc_status: payload.kyc_status,
          integration_links: payload.integration_links
            .filter((link) => link.enabled)
            .map((link) => ({
              provider_code: link.provider_code,
              link_url: link.link_url.trim(),
              link_label: link.link_label.trim(),
              is_active: link.is_active,
            })),
        },
      }),
    onSuccess: async () => {
      await invalidateUsers();
      setDialogMode(null);
      setSelectedUserId(null);
      setFormState(emptyUserForm);
      setFormError("");
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to create user.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, payload }: { userId: number; payload: UserFormState }) =>
      requestApi<AdminUserDetail>(`${adminEndpointConfig.users}/${userId}`, {
        method: "PUT",
        token,
        body: {
          full_name: payload.full_name.trim(),
          status: payload.status,
          ...(payload.password.trim() ? { password: payload.password } : {}),
          integration_links: payload.integration_links
            .filter((link) => link.enabled)
            .map((link) => ({
              provider_code: link.provider_code,
              link_url: link.link_url.trim(),
              link_label: link.link_label.trim(),
              is_active: link.is_active,
            })),
        },
      }),
    onSuccess: async () => {
      await invalidateUsers();
      if (selectedUserId !== null) {
        await queryClient.invalidateQueries({ queryKey: ["admin", "user-detail", selectedUserId] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "user-integration-links", selectedUserId] });
        await queryClient.invalidateQueries({ queryKey: ["admin", "users", "list-integration-links", selectedUserId] });
      }
      setDialogMode(null);
      setSelectedUserId(null);
      setFormState(emptyUserForm);
      setFormError("");
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to update user.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: number) =>
      requestApi<null>(`${adminEndpointConfig.users}/${userId}`, {
        method: "DELETE",
        token,
      }),
    onSuccess: async () => {
      await invalidateUsers();
      setDeleteError("");
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete user.");
    },
  });

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelectedUserId(null);
    setFormError("");
  };

  const openEditDialog = (user: AdminUser) => {
    setDialogMode("edit");
    setSelectedUserId(user.id);
    setFormError("");
  };

  const updateIntegrationLink = (providerCode: string, updater: (current: IntegrationLinkForm) => IntegrationLinkForm) => {
    setFormState((current) => ({
      ...current,
      integration_links: current.integration_links.map((link) =>
        link.provider_code === providerCode ? updater(link) : link,
      ),
    }));
  };

  const handleSubmit = async () => {
    setFormError("");

    if (!formState.full_name.trim()) {
      setFormError("Full name is required.");
      return;
    }

    if (dialogMode === "create") {
      if (!formState.email.trim() || !formState.password.trim()) {
        setFormError("Email and password are required for new users.");
        return;
      }
      await createMutation.mutateAsync(formState);
      return;
    }

    if (dialogMode === "edit" && selectedUserId !== null) {
      await updateMutation.mutateAsync({ userId: selectedUserId, payload: formState });
    }
  };

  const handleDelete = async (user: AdminUser) => {
    setDeleteError("");
    const confirmed = window.confirm(`Delete user ${user.full_name} (#${user.id})?`);
    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(user.id);
  };

  const stats = useMemo(
    () => [
      { label: "Total users", value: usersQuery.data?.total ?? 0 },
      { label: "Active", value: rows.filter((row) => row.status === "active").length },
      { label: "Pending KYC", value: rows.filter((row) => row.kyc_status === "pending").length },
    ],
    [rows, usersQuery.data?.total],
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isEditLoading = dialogMode === "edit" && (userDetailQuery.isLoading || userIntegrationLinksQuery.isLoading);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-2xl">Users</CardTitle>
            <CardDescription>Search, review, and manage customer accounts from one place.</CardDescription>
          </div>
          <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, status, or KYC"
                className="h-11 rounded-2xl border-slate-200 pl-11"
              />
            </div>
            <Button onClick={openCreateDialog} className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800 sm:w-auto">
              <Plus className="h-4 w-4" />
              Add user
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {deleteError && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div>}

          <div className="mb-4 grid gap-4 md:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-4 lg:hidden">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => {
                const pendingRequests = pendingRequestMap[row.id] ?? { count: 0, providers: [] };
                const hasPendingRequests = pendingRequests.count > 0;

                return (
                  <div key={row.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                        <UserCircle2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-900">{row.full_name}</div>
                        <div className="text-xs text-slate-500">#{row.id}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{row.status}</Badge>
                          <Badge variant="outline">KYC {row.kyc_status}</Badge>
                          {hasPendingRequests && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                              {pendingRequests.count} pending request{pendingRequests.count > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-start gap-2 break-all">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <span>{row.email}</span>
                      </div>
                      <div>{row.phone || "No phone"}</div>
                      <div>
                        {row.profile?.user_type || "No profile"} • {row.profile?.country_code || "-"}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.roles?.length ? (
                        row.roles.map((role, index) => (
                          <Badge key={`${row.id}-${index}`} variant="outline">
                            {getRoleLabel(role)}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">user</Badge>
                      )}
                    </div>

                    {hasPendingRequests && (
                      <div className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-amber-700">
                        Waiting on: {pendingRequests.providers.join(", ")}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
                        <Pencil className="h-4 w-4" />
                        Edit
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
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
                {usersQuery.isLoading ? "Loading users..." : "No user records match the current search."}
              </div>
            )}
          </div>

          <div className="hidden lg:block">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((row) => {
                    const pendingRequests = pendingRequestMap[row.id] ?? { count: 0, providers: [] };
                    const hasPendingRequests = pendingRequests.count > 0;

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                              <UserCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{row.full_name}</div>
                              <div className="text-xs text-slate-500">#{row.id}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {row.roles?.length ? (
                                  row.roles.map((role, index) => (
                                    <Badge key={`${row.id}-${index}`} variant="outline">
                                      {getRoleLabel(role)}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline">user</Badge>
                                )}
                                {hasPendingRequests && (
                                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                                    {pendingRequests.count} pending request{pendingRequests.count > 1 ? "s" : ""}
                                  </Badge>
                                )}
                              </div>
                              {hasPendingRequests && (
                                <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-amber-700">
                                  Waiting on: {pendingRequests.providers.join(", ")}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="inline-flex items-center gap-2 text-slate-700">
                            <Mail className="h-4 w-4 text-slate-400" />
                            {row.email}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">{row.phone || "No phone"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.profile?.user_type || "No profile"}</div>
                          <div className="text-sm text-slate-500">{row.profile?.country_code || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Badge variant="secondary">{row.status}</Badge>
                            <Badge variant="outline">KYC {row.kyc_status}</Badge>
                            {hasPendingRequests && (
                              <Badge className="w-fit bg-amber-100 text-amber-900 hover:bg-amber-100">Integration request pending</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
                              <Pencil className="h-4 w-4" />
                              Edit
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
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-slate-500">
                      {usersQuery.isLoading ? "Loading users..." : "No user records match the current search."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add user" : "Edit user"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Create a customer account and choose which active providers should appear on the integrations screen."
                : "Update user status, password, and active provider links for this customer."}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="grid gap-6 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="user-full-name">Full name</Label>
                  <Input
                    id="user-full-name"
                    value={formState.full_name}
                    onChange={(event) => setFormState((current) => ({ ...current, full_name: event.target.value }))}
                    placeholder="Created User"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={formState.email}
                    disabled={dialogMode === "edit"}
                    onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                    placeholder="user@example.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="user-phone">Phone</Label>
                  <Input
                    id="user-phone"
                    value={formState.phone}
                    disabled={dialogMode === "edit"}
                    onChange={(event) => setFormState((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="+84901234567"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="user-password">{dialogMode === "create" ? "Password" : "Reset password"}</Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={formState.password}
                    onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                    placeholder={dialogMode === "create" ? "secret123" : "Leave blank to keep the current password"}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={formState.status}
                    onValueChange={(value: "active" | "pending" | "suspended") =>
                      setFormState((current) => ({ ...current, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>KYC status</Label>
                  <Select
                    value={formState.kyc_status}
                    disabled={dialogMode === "edit"}
                    onValueChange={(value: "pending" | "approved" | "rejected") =>
                      setFormState((current) => ({ ...current, kyc_status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select KYC status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Provider assignments</h3>
                  <p className="text-sm text-slate-600">
                    {dialogMode === "create"
                      ? "Only active providers are available for assignment when creating a user."
                      : "Each card below represents an active provider slot for this user."}
                  </p>
                </div>

                <div className="grid gap-4">
                  {formState.integration_links.map((linkState) => (
                    <div key={linkState.provider_code} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{linkState.provider_name}</div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{linkState.provider_code}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Label htmlFor={`provider-enabled-${linkState.provider_code}`} className="text-sm text-slate-600">
                            Assign link
                          </Label>
                          <Checkbox
                            id={`provider-enabled-${linkState.provider_code}`}
                            checked={linkState.enabled}
                            onCheckedChange={(checked) =>
                              updateIntegrationLink(linkState.provider_code, (current) => ({
                                ...current,
                                enabled: checked === true,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant={linkState.provider_status === "active" ? "default" : "secondary"}>
                          {linkState.provider_status}
                        </Badge>
                        {linkState.request_status && (
                          <Badge variant="outline">Request {linkState.request_status}</Badge>
                        )}
                      </div>

                      {linkState.request_note && (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          {linkState.request_note}
                        </div>
                      )}

                      {linkState.enabled && (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="grid gap-2 md:col-span-2">
                            <Label htmlFor={`provider-url-${linkState.provider_code}`}>Link URL</Label>
                            <Input
                              id={`provider-url-${linkState.provider_code}`}
                              value={linkState.link_url}
                              onChange={(event) =>
                                updateIntegrationLink(linkState.provider_code, (current) => ({
                                  ...current,
                                  link_url: event.target.value,
                                }))
                              }
                              placeholder="https://provider.example.com/connect/user-123"
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor={`provider-label-${linkState.provider_code}`}>Button label</Label>
                            <Input
                              id={`provider-label-${linkState.provider_code}`}
                              value={linkState.link_label}
                              onChange={(event) =>
                                updateIntegrationLink(linkState.provider_code, (current) => ({
                                  ...current,
                                  link_label: event.target.value,
                                }))
                              }
                              placeholder={`Connect ${linkState.provider_name}`}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label>Link status</Label>
                            <Select
                              value={linkState.is_active ? "active" : "inactive"}
                              onValueChange={(value: "active" | "inactive") =>
                                updateIntegrationLink(linkState.provider_code, (current) => ({
                                  ...current,
                                  is_active: value === "active",
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select link status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {formError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{formError}</div>}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting || isEditLoading} className="bg-slate-950 text-white hover:bg-slate-800">
              {isSubmitting ? "Saving..." : dialogMode === "create" ? "Create user" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;


