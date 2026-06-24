type ProviderDisplayLike = {
  code?: string | null;
  name?: string | null;
};

export const INTERNAL_PROVIDER_CODE = "nium";
export const PUBLIC_PROVIDER_NAME = "Origin Wallet";

export const getProviderDisplayName = (provider?: ProviderDisplayLike | null) => {
  if (!provider?.name || provider.name.toLowerCase() === INTERNAL_PROVIDER_CODE || provider.code?.toLowerCase() === INTERNAL_PROVIDER_CODE) {
    return PUBLIC_PROVIDER_NAME;
  }

  return provider.name;
};

export const getProviderDisplayCode = (code?: string | null) =>
  code?.toLowerCase() === INTERNAL_PROVIDER_CODE ? "origin-wallet" : code || "-";
