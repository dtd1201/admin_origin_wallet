import { useState, useMemo } from "react";
import { ChevronDown, Info } from "lucide-react";
import useExchangeRates from "@/hooks/useExchangeRates";

const currencies = [
  { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "🇨🇦" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
];

interface Props {
  expanded?: boolean;
}

const CurrencyCalculator = ({ expanded = false }: Props) => {
  const { getRate, loading } = useExchangeRates();
  const [sendAmount, setSendAmount] = useState("1000");
  const [sendCurrency, setSendCurrency] = useState("USD");
  const [receiveCurrency, setReceiveCurrency] = useState("EUR");
  const [showSendDropdown, setShowSendDropdown] = useState(false);
  const [showReceiveDropdown, setShowReceiveDropdown] = useState(false);

  const rate = useMemo(() => {
    const liveRate = getRate(sendCurrency, receiveCurrency);
    return liveRate ?? 1;
  }, [getRate, sendCurrency, receiveCurrency]);

  const amount = parseFloat(sendAmount) || 0;
  const serviceFee = Math.max(amount * 0.004, 0.5);
  const netAmount = Math.max(amount - serviceFee, 0);
  const receiveAmount = netAmount * rate;

  const formatNum = (n: number) => {
    if (n > 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n < 0.01) return n.toFixed(6);
    return n.toFixed(2);
  };

  const formatRate = (n: number) => {
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return n.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  };

  const CurrencySelect = ({
    value,
    onChange,
    open,
    setOpen,
  }: {
    value: string;
    onChange: (v: string) => void;
    open: boolean;
    setOpen: (v: boolean) => void;
  }) => {
    const cur = currencies.find((c) => c.code === value)!;
    return (
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap"
        >
          <span className="text-base sm:text-lg">{cur.flag}</span>
          <span className="hidden sm:inline">{cur.code}</span>
          <span className="sm:hidden">{cur.code}</span>
          <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
        </button>
        {open && (
          <div className="absolute top-full right-0 mt-1 w-52 bg-card rounded-xl shadow-xl border border-border p-1 z-20 max-h-64 overflow-y-auto">
            {currencies.map((c) => (
              <button
                key={c.code}
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted rounded-lg transition-colors"
              >
                <span className="text-lg">{c.flag}</span>
                <span className="font-medium">{c.code}</span>
                <span className="text-muted-foreground text-xs">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-2xl shadow-xl border border-border p-4 sm:p-6 w-full max-w-md">
      {/* Send */}
      <div className="mb-1">
        <label className="text-xs font-medium text-muted-foreground mb-2 block">You send</label>
        <div className="flex items-center gap-2 sm:gap-3">
          <input
            type="text"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="flex-1 min-w-0 text-xl sm:text-2xl font-bold bg-transparent outline-none text-foreground"
          />
          <CurrencySelect
            value={sendCurrency}
            onChange={setSendCurrency}
            open={showSendDropdown}
            setOpen={setShowSendDropdown}
          />
        </div>
      </div>

      {/* Fee breakdown */}
      <div className={`border-t border-b border-border py-4 my-4 space-y-2.5 ${expanded ? "" : ""}`}>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            Service fee
            <span className="group relative">
              <Info className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-xs bg-foreground text-background rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                A small fee to cover our operational costs. Always shown upfront.
              </span>
            </span>
          </span>
          <span className="font-medium text-foreground">{formatNum(serviceFee)} {sendCurrency}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-1">
            Exchange rate
            <span className="group relative">
              <Info className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-xs bg-foreground text-background rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                We use the real mid-market rate with no hidden markup.
              </span>
            </span>
          </span>
          <span className="font-medium text-accent">
            {loading ? "Updating..." : `1 ${sendCurrency} = ${formatRate(rate)} ${receiveCurrency}`}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total cost</span>
          <span className="font-medium text-foreground">{formatNum(serviceFee)} {sendCurrency}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Estimated delivery</span>
          <span className="font-medium text-foreground">1–2 business days</span>
        </div>

        {expanded && (
          <div className="pt-2 border-t border-border mt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount we convert</span>
              <span className="font-medium">{formatNum(netAmount)} {sendCurrency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Rate markup</span>
              <span className="font-medium text-accent">None (mid-market rate)</span>
            </div>
          </div>
        )}
      </div>

      {/* Receive */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-2 block">Recipient gets</label>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0 text-xl sm:text-2xl font-bold text-foreground truncate">
            {formatNum(receiveAmount)}
          </div>
          <CurrencySelect
            value={receiveCurrency}
            onChange={setReceiveCurrency}
            open={showReceiveDropdown}
            setOpen={setShowReceiveDropdown}
          />
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-muted-foreground/60 mt-4 leading-relaxed">
        Rates and fees shown are illustrative and may differ at the time of your transfer. 
        Final amounts will be confirmed before you proceed.
      </p>
    </div>
  );
};

export default CurrencyCalculator;
