import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Link2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { ProviderSummary } from "@/types/admin";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ProviderFormState = {
  code: string;
  name: string;
  status: "active" | "inactive";
};

const emptyForm: ProviderFormState = {
  code: "",
  name: "",
  status: "active",
};

const AdminProviders = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [formState, setFormState] = useState<ProviderFormState>(emptyForm);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSummary | null>(null);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const providersQuery = useQuery({
    queryKey: ["admin", "providers", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<ProviderSummary>>(adminEndpointConfig.providers, { method: "GET", token }),
  });

  const rows = providersQuery.data?.data ?? [];

  const stats = [
    {
      icon: Building2,
      title: "Total providers",
      value: String(providersQuery.data?.total ?? 0),
    },
    {
      icon: ShieldCheck,
      title: "Active providers",
      value: String(rows.filter((row) => row.status === "active").length),
    },
    {
      icon: Link2,
      title: "Onboarding ready",
      value: String(rows.filter((row) => row.is_available_for_onboarding).length),
    },
  ];

  const invalidateProviders = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: ProviderFormState) =>
      requestApi<ProviderSummary>(adminEndpointConfig.providers, {
        method: "POST",
        token,
        body: payload,
      }),
    onSuccess: async () => {
      await invalidateProviders();
      setDialogMode(null);
      setFormState(emptyForm);
      setFormError("");
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to create provider.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ providerCode, payload }: { providerCode: string; payload: Omit<ProviderFormState, "code"> }) =>
      requestApi<ProviderSummary>(`${adminEndpointConfig.providers}/${encodeURIComponent(providerCode)}`, {
        method: "PUT",
        token,
        body: payload,
      }),
    onSuccess: async () => {
      await invalidateProviders();
      setDialogMode(null);
      setSelectedProvider(null);
      setFormState(emptyForm);
      setFormError("");
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to update provider.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (providerCode: string) =>
      requestApi<null>(`${adminEndpointConfig.providers}/${encodeURIComponent(providerCode)}`, {
        method: "DELETE",
        token,
      }),
    onSuccess: async () => {
      await invalidateProviders();
      setSelectedProvider(null);
      setDeleteError("");
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete provider.");
    },
  });

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelectedProvider(null);
    setFormState(emptyForm);
    setFormError("");
  };

  const openEditDialog = (provider: ProviderSummary) => {
    setDialogMode("edit");
    setSelectedProvider(provider);
    setFormState({
      code: provider.code,
      name: provider.name,
      status: provider.status === "inactive" ? "inactive" : "active",
    });
    setFormError("");
  };

  const handleSubmit = async () => {
    setFormError("");

    if (!formState.code.trim() || !formState.name.trim()) {
      setFormError("Code and name are required.");
      return;
    }

    if (dialogMode === "create") {
      await createMutation.mutateAsync({
        code: formState.code.trim().toUpperCase(),
        name: formState.name.trim(),
        status: formState.status,
      });
      return;
    }

    if (dialogMode === "edit" && selectedProvider) {
      await updateMutation.mutateAsync({
        providerCode: selectedProvider.code,
        payload: {
          name: formState.name.trim(),
          status: formState.status,
        },
      });
    }
  };

  const handleDelete = async (provider: ProviderSummary) => {
    setDeleteError("");
    const confirmed = window.confirm(`Delete provider ${provider.name} (${provider.code})?`);
    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(provider.code);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-2xl">Integration providers</CardTitle>
              <CardDescription>Review the providers currently available across the platform.</CardDescription>
            </div>
            <Button onClick={openCreateDialog} className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              Add provider
            </Button>
          </CardHeader>
          <CardContent>
            {deleteError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => {
                    const capabilities = [
                      row.supports_beneficiaries && "beneficiaries",
                      row.supports_data_sync && "sync",
                      row.supports_quotes && "quotes",
                      row.supports_transfers && "transfers",
                      row.supports_webhooks && "webhooks",
                    ].filter(Boolean);

                    return (
                      <TableRow key={row.code}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.name}</div>
                          <div className="text-xs text-slate-500">#{row.id}</div>
                        </TableCell>
                        <TableCell>{row.code}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {capabilities.length ? (
                              capabilities.map((item) => (
                                <Badge key={item} variant="outline">
                                  {item}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-slate-500">No capability flags</span>
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
                      {providersQuery.isLoading ? "Loading providers..." : "No providers are available right now."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Provider summary</CardTitle>
              <CardDescription>Quick status overview for the current provider lineup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">{item.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="rounded-[28px] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add provider" : "Edit provider"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Create a new integration provider for the admin workspace."
                : "Update the provider name or current availability."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="provider-code">Code</Label>
              <Input
                id="provider-code"
                value={formState.code}
                disabled={dialogMode === "edit"}
                onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))}
                placeholder="AIRWALLEX"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                placeholder="Airwallex"
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formState.status}
                onValueChange={(value: "active" | "inactive") =>
                  setFormState((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{formError}</div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting} className="bg-slate-950 text-white hover:bg-slate-800">
              {isSubmitting ? "Saving..." : dialogMode === "create" ? "Create provider" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProviders;
