import { useState, useMemo } from "react";
import { useListStates, useGetCountyConcentration } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { PlanTypeBadge, formatNumber } from "@/components/ui/plan-badge";
import {
  escapeCsvValue,
  getComparisonExportBlockReason,
  getMissingBenchmarkCounties,
} from "@/lib/csv";
import { Search, SlidersHorizontal, AlertTriangle, ShieldCheck, Activity, Download, Landmark } from "lucide-react";

export default function ConcentrationPage() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [minBeneficiaries, setMinBeneficiaries] = useState<number>(1000);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'hhi', direction: 'desc' });

  const { data: states } = useListStates();
  
  const { data: concentrationData, isLoading } = useGetCountyConcentration({
    state_code: selectedState || undefined,
    year: selectedYear,
    min_beneficiaries: minBeneficiaries,
    limit: 200
  });

  const filteredAndSortedData = useMemo(() => {
    if (!concentrationData) return [];
    let filtered = concentrationData;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => c.county_name.toLowerCase().includes(q));
    }

    return [...filtered].sort((a, b) => {
      const aVal = sortConfig.key === "rate_benchmark"
        ? a.rate_benchmark?.rate_0_star ?? -1
        : a[sortConfig.key as keyof typeof a];
      const bVal = sortConfig.key === "rate_benchmark"
        ? b.rate_benchmark?.rate_0_star ?? -1
        : b[sortConfig.key as keyof typeof b];
      if (aVal === bVal) return 0;
      const aIsGreater = (aVal ?? "") > (bVal ?? "");
      return sortConfig.direction === 'asc' ? (aIsGreater ? 1 : -1) : (aIsGreater ? -1 : 1);
    });
  }, [concentrationData, searchQuery, sortConfig]);

  const missingBenchmarkCounties = useMemo(
    () => getMissingBenchmarkCounties(filteredAndSortedData),
    [filteredAndSortedData],
  );
  const exportBlockReason = useMemo(
    () => getComparisonExportBlockReason(filteredAndSortedData, selectedYear),
    [filteredAndSortedData, selectedYear],
  );

  const stats = useMemo(() => {
    if (!filteredAndSortedData.length) return { monopoly: 0, duopoly: 0, competitive: 0, dSnp: 0, fide: 0, hide: 0, coordinated: 0, avgRate: null as number | null };
    return {
      monopoly: filteredAndSortedData.filter(c => c.is_monopoly).length,
      duopoly: filteredAndSortedData.filter(c => c.is_duopoly).length,
      competitive: filteredAndSortedData.filter(c => c.hhi < 1500).length,
      dSnp: filteredAndSortedData.reduce((sum, c) => sum + (c.d_snp_plans ?? 0), 0),
      fide: filteredAndSortedData.reduce((sum, c) => sum + (c.fide_plans ?? 0), 0),
      hide: filteredAndSortedData.reduce((sum, c) => sum + (c.hide_plans ?? 0), 0),
      coordinated: filteredAndSortedData.reduce((sum, c) => sum + (c.coordinated_plans ?? 0), 0),
      avgRate: (() => {
        const rates = filteredAndSortedData.flatMap(c => c.rate_benchmark ? [c.rate_benchmark.rate_0_star] : []);
        return rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
      })(),
    };
  }, [filteredAndSortedData]);

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const getSortIndicator = (key: string) => {
    if (sortConfig.key !== key) return null;
    return <span className="ml-1 text-primary">{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>;
  };

  const exportComparison = () => {
    if (exportBlockReason) {
      window.alert(exportBlockReason);
      return;
    }

    const header = [
      "County", "State", "FIPS", "Enrollment", "Plans", "HHI",
      "CMS Rate Year", "CMS County Code", "0% Bonus Benchmark", "3.5% Bonus Benchmark",
      "5% Bonus Benchmark", "ESRD Benchmark", "Top Plan Sponsor", "Top Plan Share",
      "Top 2 Combined Share", "Market Status",
    ];
    const rows = filteredAndSortedData.map((record) => [
      record.county_name, record.state_code, record.fips, record.total_beneficiaries,
      record.plan_count, record.hhi, record.rate_benchmark?.year, record.rate_benchmark?.cms_county_code,
      record.rate_benchmark?.rate_0_star, record.rate_benchmark?.rate_3_5_star,
      record.rate_benchmark?.rate_5_star, record.rate_benchmark?.esrd_rate,
      record.top1_sponsor_name, record.top1_share_pct, record.top2_combined_pct,
      record.is_monopoly ? "Monopoly" : record.is_duopoly ? "Duopoly" : record.hhi >= 1500 ? "Concentrated" : "Competitive",
    ].map(escapeCsvValue).join(","));
    const csv = [header.map(escapeCsvValue).join(","), ...rows].join("\n");
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `cms-ma-county-comparison-${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="space-y-4 h-full flex flex-col animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Market Concentration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Identify counties with duopoly or monopoly conditions
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 shrink-0">
        <Card className="p-4 flex items-center gap-4 bg-red-50/50 border-red-100 dark:bg-red-950/10 dark:border-red-900/30">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center dark:bg-red-900/50 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-red-900 dark:text-red-400">{stats.monopoly}</div>
            <div className="text-xs font-medium text-red-700 uppercase tracking-wider dark:text-red-500">Monopoly Counties</div>
          </div>
        </Card>
        
        <Card className="p-4 flex items-center gap-4 bg-amber-50/50 border-amber-100 dark:bg-amber-950/10 dark:border-amber-900/30">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center dark:bg-amber-900/50 dark:text-amber-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-400">{stats.duopoly}</div>
            <div className="text-xs font-medium text-amber-700 uppercase tracking-wider dark:text-amber-500">Duopoly Counties</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/30">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center dark:bg-emerald-900/50 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-400">{stats.competitive}</div>
            <div className="text-xs font-medium text-emerald-700 uppercase tracking-wider dark:text-emerald-500">Competitive Counties</div>
          </div>
        </Card>
        <Card className="p-4 bg-violet-50/50 border-violet-100 dark:bg-violet-950/10 dark:border-violet-900/30">
          <div className="text-xs font-medium text-violet-700 uppercase tracking-wider dark:text-violet-400">D-SNP integration</div>
          <div className="text-2xl font-bold text-violet-900 dark:text-violet-300">{stats.dSnp}</div>
          <div className="text-[11px] text-violet-700/80 dark:text-violet-400 mt-1">
            FIDE {stats.fide} · HIDE {stats.hide} · Coord. {stats.coordinated}
          </div>
        </Card>
        <Card className="p-4 bg-primary/5 border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-bold text-foreground font-mono">{stats.avgRate == null ? "—" : `$${stats.avgRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. CMS 0% benchmark / mo.</div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 border-border overflow-hidden">
        <div className="p-4 border-b bg-muted/20 flex gap-4 items-center shrink-0 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-2">
            <SlidersHorizontal className="w-4 h-4" />
            Filters
          </div>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search county..."
              className="h-9 w-48 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select 
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="">All States</option>
            {states?.map(s => (
              <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
            ))}
          </select>

          <select 
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            <option value={2025}>CY 2025</option>
            <option value={2026}>CY 2026</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">Min Enrollees:</span>
            <input 
              type="number" 
              className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              value={minBeneficiaries}
              onChange={(e) => setMinBeneficiaries(Number(e.target.value) || 0)}
            />
          </div>
          {missingBenchmarkCounties.length > 0 && (
            <div
              role="alert"
              className="w-full text-xs text-destructive sm:w-auto sm:max-w-md"
              title={missingBenchmarkCounties.map((county) => county.label).join(", ")}
            >
              Export blocked: {missingBenchmarkCounties.length} county benchmark
              {missingBenchmarkCounties.length === 1 ? "" : "s"} missing —{" "}
              {missingBenchmarkCounties
                .slice(0, 2)
                .map((county) => county.label)
                .join(", ")}
              {missingBenchmarkCounties.length > 2 ? ", and more" : ""}
            </div>
          )}
          <button
            type="button"
            onClick={exportComparison}
            disabled={
              filteredAndSortedData.length === 0 ||
              exportBlockReason !== null
            }
            title={
              exportBlockReason
                ? exportBlockReason
                : undefined
            }
            className="h-9 inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export comparison
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-background relative">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)] z-10 whitespace-nowrap">
              <tr>
                <th className="pl-6 text-left cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('county_name')}>
                  County {getSortIndicator('county_name')}
                </th>
                <th className="w-16 text-left cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('state_code')}>
                  St {getSortIndicator('state_code')}
                </th>
                <th className="text-right w-28 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('total_beneficiaries')}>
                  Total Enr. {getSortIndicator('total_beneficiaries')}
                </th>
                 <th className="text-right w-32 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('rate_benchmark')}>
                   CMS 0% Rate {getSortIndicator('rate_benchmark')}
                 </th>
                <th className="text-right w-20 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('plan_count')}>
                  Plans {getSortIndicator('plan_count')}
                </th>
                <th className="text-right w-28 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('hhi')}>
                  HHI {getSortIndicator('hhi')}
                </th>
                <th className="pl-6 text-left">#1 Plan</th>
                <th className="text-right w-36">#1 Share</th>
                <th className="pl-6 text-left">#2 Plan</th>
                <th className="text-right w-36">#2 Share</th>
                <th className="text-right w-36 pr-6 cursor-pointer hover:text-primary transition-colors" onClick={() => handleSort('top2_combined_pct')}>
                  Top-2 Comb. {getSortIndicator('top2_combined_pct')}
                </th>
                <th className="text-center w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !concentrationData ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="pl-6"><div className="h-4 bg-muted rounded w-24"></div></td>
                    <td><div className="h-4 bg-muted rounded w-8"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-8 ml-auto"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-12 ml-auto"></div></td>
                    <td className="pl-6"><div className="h-4 bg-muted rounded w-32"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="pl-6"><div className="h-4 bg-muted rounded w-32"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="text-right pr-6"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="text-center"><div className="h-5 bg-muted rounded-full w-20 mx-auto"></div></td>
                  </tr>
                ))
              ) : filteredAndSortedData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No concentration records found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedData.map((record) => {
                  const hhiColor = record.hhi >= 2500 ? 'bg-red-500' : record.hhi >= 1500 ? 'bg-orange-500' : 'bg-emerald-500';
                  
                  let statusBadge = <span className="bg-emerald-100 text-emerald-800 border-emerald-200 border text-xs px-2 py-0.5 rounded-full font-semibold dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">Competitive</span>;
                  if (record.is_monopoly) {
                    statusBadge = <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-sm uppercase tracking-wider">Monopoly</span>;
                  } else if (record.is_duopoly) {
                    statusBadge = <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-sm uppercase tracking-wider">Duopoly</span>;
                  } else if (record.hhi >= 1500) {
                    statusBadge = <span className="bg-orange-100 text-orange-800 border-orange-200 border text-xs px-2 py-0.5 rounded-full font-semibold dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">Concentrated</span>;
                  }

                  return (
                    <tr key={record.fips} className="hover:bg-muted/30 transition-colors">
                      <td className="pl-6 font-medium">{record.county_name}</td>
                      <td className="font-mono text-muted-foreground">{record.state_code}</td>
                      <td className="text-right font-mono font-medium">{formatNumber(record.total_beneficiaries)}</td>
                      <td className="text-right font-mono font-medium text-primary">
                        {record.rate_benchmark ? (
                          <div title={`CMS ${record.rate_benchmark.year}: 0% $${record.rate_benchmark.rate_0_star.toFixed(2)} · 3.5% $${record.rate_benchmark.rate_3_5_star.toFixed(2)} · 5% $${record.rate_benchmark.rate_5_star.toFixed(2)}`}>
                            ${record.rate_benchmark.rate_0_star.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="text-right font-mono text-muted-foreground">{record.plan_count}</td>
                      <td className="text-right font-mono flex items-center justify-end gap-2 h-full py-3">
                        <div className={`w-2 h-2 rounded-full ${hhiColor}`}></div>
                        {record.hhi.toFixed(0)}
                      </td>
                      <td className="pl-6">
                        <div className="font-medium text-xs truncate max-w-[200px]" title={record.top1_sponsor_name}>{record.top1_sponsor_name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]" title={record.top1_plan_name}>{record.top1_plan_name}</span>
                          {record.top1_plan_type && <PlanTypeBadge type={record.top1_plan_type} className="scale-75 origin-left" />}
                        </div>
                      </td>
                      <td className="text-right align-middle pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-mono text-xs w-9">{record.top1_share_pct?.toFixed(1)}%</span>
                          <div className="w-16 h-1.5 bg-primary/20 rounded-full overflow-hidden shrink-0">
                            <div className="h-full bg-primary" style={{ width: `${record.top1_share_pct || 0}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="pl-6">
                        {record.top2_sponsor_name ? (
                          <>
                            <div className="font-medium text-xs truncate max-w-[200px]" title={record.top2_sponsor_name}>{record.top2_sponsor_name}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px] mt-0.5" title={record.top2_plan_name ?? undefined}>{record.top2_plan_name}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="text-right align-middle pr-2">
                        {record.top2_share_pct ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-mono text-xs w-9">{record.top2_share_pct.toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-primary/20 rounded-full overflow-hidden shrink-0">
                              <div className="h-full bg-primary" style={{ width: `${record.top2_share_pct}%` }}></div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs pr-6">-</span>
                        )}
                      </td>
                      <td className="text-right pr-6 font-mono font-medium">
                        {record.top2_combined_pct?.toFixed(1)}%
                      </td>
                      <td className="text-center">
                        {statusBadge}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
