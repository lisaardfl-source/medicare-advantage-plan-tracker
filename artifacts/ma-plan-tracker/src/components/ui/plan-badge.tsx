import { cn } from "@/lib/utils";

export type PlanType = "d_snp" | "i_snp" | "c_snp" | "regular";

export function PlanTypeBadge({ type, className }: { type: string | undefined; className?: string }) {
  if (!type) return null;
  
  const mapping: Record<string, { label: string; color: string }> = {
    d_snp: { label: "D-SNP", color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" },
    i_snp: { label: "I-SNP", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" },
    c_snp: { label: "C-SNP", color: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800" },
    regular: { label: "MA-PD", color: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  };

  const config = mapping[type] || { label: type, color: "bg-gray-100 text-gray-800 border-gray-200" };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border whitespace-nowrap",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

export function formatCurrencyRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
  options?: { hasUnpublished?: boolean },
): string {
  if (value != null) return formatCurrency(value);
  if (min == null && max == null) return "Not published";
  const range =
    min == null
      ? formatCurrency(max)
      : max == null || min === max
        ? formatCurrency(min)
        : `${formatCurrency(min)}–${formatCurrency(max)}`;
  if (options?.hasUnpublished) return `${range} + N/A`;
  return range;
}

export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return new Intl.NumberFormat("en-US").format(val);
}

export function IntegrationBadge({ integration }: { integration?: string | null }) {
  if (!integration) return null;
  const config: Record<string, { label: string; className: string }> = {
    fide: { label: "FIDE", className: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800" },
    hide: { label: "HIDE", className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800" },
    coordinated: { label: "Coordinated", className: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800" },
  };
  const item = config[integration] ?? { label: integration, className: "bg-muted text-muted-foreground border-border" };
  return <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap", item.className)}>{item.label}</span>;
}

export function getAepStabilityScore(input: {
  star_rating?: number | null;
  beneficiary_count?: number | null;
  contract_effective_year?: number | null;
}): { score: number; label: string; className: string } {
  // Transparent 2026 proxy: 40% quality, 35% scale, 25% tenure.
  const quality = Math.min(100, Math.max(0, ((input.star_rating ?? 2.5) / 5) * 100));
  const scale = Math.min(100, Math.max(0, Math.log10(Math.max(1, input.beneficiary_count ?? 0) + 1) / 6 * 100));
  const tenureYears = input.contract_effective_year ? Math.max(0, 2026 - input.contract_effective_year) : 0;
  const tenure = Math.min(100, tenureYears / 15 * 100);
  const score = Math.round(quality * 0.4 + scale * 0.35 + tenure * 0.25);
  return score >= 70
    ? { score, label: "Stable", className: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800" }
    : score >= 45
      ? { score, label: "Watch", className: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800" }
      : { score, label: "At risk", className: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800" };
}
