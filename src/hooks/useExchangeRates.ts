import { useState, useEffect, useCallback } from 'react';

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  lastUpdated: string;
}

const SERVICE_FEE_PERCENT = 0.004;
const CACHE_DURATION = 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;
const FREE_RATES_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'JPY', 'AUD', 'CAD', 'SGD'] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
type UsdRates = Record<SupportedCurrency, number>;

const DEFAULT_USD_RATES: UsdRates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  VND: 24500,
  JPY: 149.5,
  AUD: 1.53,
  CAD: 1.36,
  SGD: 1.34,
};

const getCachedRates = (): ExchangeRate[] | null => {
  try {
    const cached = localStorage.getItem('exchange_rates_cache');
    if (!cached) return null;
    const { rates, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) return rates;
    return null;
  } catch {
    return null;
  }
};

const saveRatesToCache = (rates: ExchangeRate[]) => {
  try {
    localStorage.setItem('exchange_rates_cache', JSON.stringify({ rates, timestamp: Date.now() }));
  } catch {
    // ignore
  }
};

const buildAllPairsFromUsdRates = (usdRates: UsdRates, updatedAt: string): ExchangeRate[] => {
  return SUPPORTED_CURRENCIES.flatMap((from) =>
    SUPPORTED_CURRENCIES.map((to) => ({
      from,
      to,
      rate: usdRates[to] / usdRates[from],
      lastUpdated: updatedAt,
    })),
  );
};

const normalizeUsdRates = (rawRates: Record<string, unknown>): UsdRates => {
  const next: UsdRates = { ...DEFAULT_USD_RATES, USD: 1 };
  for (const c of SUPPORTED_CURRENCIES) {
    if (c === 'USD') continue;
    const v = rawRates[c];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      next[c] = v;
      continue;
    }
    if (typeof v === 'string') {
      const parsed = Number(v);
      if (Number.isFinite(parsed) && parsed > 0) {
        next[c] = parsed;
      }
    }
  }
  return next;
};

const fetchRatesFromAPI = async (): Promise<{ rates: ExchangeRate[]; updatedAt: string }> => {
  try {
    const response = await fetch(FREE_RATES_URL);
    if (!response.ok) throw new Error(`free_api_http_${response.status}`);
    const data = await response.json();
    const usdRates = normalizeUsdRates((data?.data?.rates ?? {}) as Record<string, unknown>);
    const updatedAt = new Date().toISOString();
    return { rates: buildAllPairsFromUsdRates(usdRates, updatedAt), updatedAt };
  } catch {
    const updatedAt = new Date().toISOString();
    return { rates: buildAllPairsFromUsdRates(DEFAULT_USD_RATES, updatedAt), updatedAt };
  }
};

export const calculateTransfer = (
  amount: number,
  rate: number,
  feePercent: number = SERVICE_FEE_PERCENT,
): { fee: number; gets: number } => {
  const fee = amount * feePercent;
  const gets = (amount - fee) * rate;
  return { fee, gets };
};

export const formatCurrency = (value: number, currency: string): string => {
  if (currency === 'VND' || currency === 'JPY') {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  }
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

export const formatRate = (value: number): string => {
  if (value >= 1000) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  if (value >= 1) return new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 }).format(value);
};

export const useExchangeRates = () => {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshFromApi = useCallback(async (silent = true, skipCache = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    if (!skipCache) {
      const cached = getCachedRates();
      if (cached) {
        setRates(cached);
        setLastUpdated(cached[0]?.lastUpdated ?? null);
        if (!silent) setLoading(false);
        return;
      }
    }

    const { rates: freshRates, updatedAt } = await fetchRatesFromAPI();
    setRates(freshRates);
    setLastUpdated(updatedAt);
    saveRatesToCache(freshRates);
    if (!silent) setLoading(false);
  }, []);

  const refreshRates = useCallback(async () => {
    localStorage.removeItem('exchange_rates_cache');
    await refreshFromApi(false, true);
  }, [refreshFromApi]);

  useEffect(() => {
    refreshFromApi(false);
  }, [refreshFromApi]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshFromApi(true, true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshFromApi]);

  const getRate = useCallback((from: string, to: string): number | null => {
    const direct = rates.find((r) => r.from === from && r.to === to);
    return direct?.rate ?? null;
  }, [rates]);

  const getCorridorData = useCallback((from: string, to: string, amount: number): { fee: string; rate: string; gets: string } | null => {
    const rate = getRate(from, to);
    if (!rate) return null;
    const { fee, gets } = calculateTransfer(amount, rate);
    return {
      fee: formatCurrency(fee, from),
      rate: formatRate(rate),
      gets: formatCurrency(gets, to),
    };
  }, [getRate]);

  return {
    rates,
    loading,
    lastUpdated,
    error,
    realtimeEnabled: false,
    rateSource: 'rest' as const,
    refreshRates,
    getRate,
    getCorridorData,
  };
};

export default useExchangeRates;
