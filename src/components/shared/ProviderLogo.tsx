import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";

export type ProviderLogoSource = {
  code?: string | null;
  name?: string | null;
  logo_url?: string | null;
};

type ProviderLogoProps = {
  provider?: ProviderLogoSource | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

// Reuse the sidebar/header asset for the existing public Origin Wallet identity.
const originWalletLogo = "/logo/logo.jpg";
const neutralFallback = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

export const ProviderLogo = ({
  provider,
  className = "h-12 w-12 rounded-2xl",
  imageClassName = "p-1.5",
  fallbackClassName = neutralFallback,
}: ProviderLogoProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const code = provider?.code?.trim().toLowerCase();
  const name = provider?.name?.trim();
  const isOriginWallet = ["nium", "origin-wallet", "origin_wallet", "originwallet"].includes(code || "")
    || ["nium", "origin wallet"].includes(name?.toLowerCase() || "");
  const providerLabel = isOriginWallet ? "Origin Wallet" : name || provider?.code?.trim() || "Unknown provider";
  const logoUrl = isOriginWallet ? originWalletLogo : provider?.logo_url?.trim() || "";

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl, code]);

  const baseClassName = `flex shrink-0 items-center justify-center overflow-hidden ${className}`;

  if (logoUrl && !imageFailed) {
    return (
      <div className={`${baseClassName} border border-[#e7e7df] bg-white dark:border-white/10 dark:bg-white`}>
        <img
          src={logoUrl}
          alt={`${providerLabel} logo`}
          className={`h-full w-full object-contain ${isOriginWallet ? "" : imageClassName}`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div role="img" aria-label={`${providerLabel} logo`} className={`${baseClassName} ${name || code ? fallbackClassName : neutralFallback}`}>
      <Building2 aria-hidden="true" className="h-1/2 w-1/2" />
    </div>
  );
};
