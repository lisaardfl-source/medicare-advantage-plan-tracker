import { useState } from "react";
import { Link } from "wouter";
import { useListPlans, useListStates, useCreatePlan, getListPlansQueryKey, PlanInputPlanType, listPlans } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { PlanTypeBadge, IntegrationBadge, formatCurrencyRange } from "@/components/ui/plan-badge";
import { Search, SlidersHorizontal, ChevronRight, ChevronLeft, Building, Plus, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export default function PlansList() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const limit = 20;
  
  const [filters, setFilters] = useState({
    state_code: "",
    plan_type: "",
    sponsor: "",
  });

  const { data: plansData, isLoading } = useListPlans({
    ...filters,
    plan_type: filters.plan_type ? filters.plan_type as any : undefined,
    limit,
    offset: page * limit,
  }, { query: { keepPreviousData: true } as any });

  const { data: states } = useListStates();
  const createPlan = useCreatePlan();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const total = plansData?.total || 0;
  const maxPage = Math.max(0, Math.ceil(total / limit) - 1);

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      contract_id: formData.get("contract_id") as string,
      plan_id: formData.get("plan_id") as string,
      plan_name: formData.get("plan_name") as string,
      sponsor_name: formData.get("sponsor_name") as string,
      plan_type: formData.get("plan_type") as PlanInputPlanType,
      monthly_premium: formData.get("monthly_premium") ? Number(formData.get("monthly_premium")) : null,
      moop: formData.get("moop") ? Number(formData.get("moop")) : null,
      year: new Date().getFullYear(),
    };
    
    createPlan.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
        setIsCreateOpen(false);
      }
    });
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const data = await listPlans({
        ...filters,
        plan_type: filters.plan_type ? filters.plan_type as any : undefined,
        limit: 9999,
        offset: 0,
      });
      
      const headers = [
        "Contract ID",
        "Plan ID",
        "Plan Name",
        "Sponsor",
        "Type",
        "A/B Monthly Premium",
        "A/B Monthly Premium Min",
        "A/B Monthly Premium Max",
        "Part D Premium",
        "In-Network MOOP",
        "In-Network MOOP Min",
        "In-Network MOOP Max",
        "Costs Vary by County",
        "Premium Varies by County",
        "Premium Has Unpublished Counties",
        "MOOP Varies by County",
        "MOOP Has Unpublished Counties",
        "Cost Source",
        "Star Rating",
        "Look-Alike D-SNP",
        "Dual-Eligible Enrollment",
        "Look-Alike Total Enrollment",
        "Dual-Eligible Enrollment %",
        "Dual-Eligible Data Status",
        "Dual-Eligible CMS Source",
        "Year",
      ];
      
      const rows = data.plans.map(plan => [
        plan.contract_id,
        plan.plan_id,
        plan.plan_name,
        plan.sponsor_name,
        plan.plan_type,
        plan.monthly_premium ?? "",
        plan.monthly_premium_min ?? "",
        plan.monthly_premium_max ?? "",
        plan.drug_premium ?? "",
        plan.moop ?? "",
        plan.moop_min ?? "",
        plan.moop_max ?? "",
        plan.costs_vary_by_county ? "Yes" : "No",
        plan.premium_varies_by_county ? "Yes" : "No",
        plan.premium_has_unpublished_counties ? "Yes" : "No",
        plan.moop_varies_by_county ? "Yes" : "No",
        plan.moop_has_unpublished_counties ? "Yes" : "No",
        plan.cost_source ?? "",
        plan.star_rating ?? "",
        plan.dual_eligible_data_status === "available"
          ? plan.is_look_alike ? "Yes" : "No"
          : plan.dual_eligible_data_status === "suppressed"
            ? "Unknown (CMS suppressed)"
            : "Unknown",
        plan.dual_eligible_enrollment ?? "",
        plan.look_alike_total_enrollment ?? "",
        plan.dual_eligible_pct ?? "",
        plan.dual_eligible_data_status,
        plan.dual_eligible_source_url ?? "",
        plan.year ?? ""
      ]);

      const csvContent = [
        headers.map(csvCell).join(","),
        ...rows.map(row => row.map(csvCell).join(",")),
      ].join("\n");
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `ma_plans_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col animate-in fade-in duration-300">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">MA Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comprehensive directory of Medicare Advantage plans
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportCSV}
            disabled={isExporting}
            className="inline-flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" /> Add Plan
              </button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New MA Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contract ID</label>
                  <input name="contract_id" required placeholder="H1234" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plan ID</label>
                  <input name="plan_id" required placeholder="001" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan Name</label>
                <input name="plan_name" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sponsor Name</label>
                <input name="sponsor_name" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan Type</label>
                <select name="plan_type" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="d_snp">D-SNP</option>
                  <option value="i_snp">I-SNP</option>
                  <option value="c_snp">C-SNP</option>
                  <option value="regular">Regular MA-PD</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Monthly Premium ($)</label>
                  <input name="monthly_premium" type="number" step="0.01" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">MOOP ($)</label>
                  <input name="moop" type="number" step="0.01" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">Cancel</button>
                <button type="submit" disabled={createPlan.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {createPlan.isPending ? "Saving..." : "Save Plan"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
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
              placeholder="Search sponsor..."
              className="h-9 w-64 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              value={filters.sponsor}
              onChange={(e) => {
                setFilters(f => ({ ...f, sponsor: e.target.value }));
                setPage(0);
              }}
            />
          </div>

          <select 
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.state_code}
            onChange={(e) => {
              setFilters(f => ({ ...f, state_code: e.target.value }));
              setPage(0);
            }}
          >
            <option value="">All States</option>
            {states?.map(s => (
              <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
            ))}
          </select>

          <select 
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={filters.plan_type}
            onChange={(e) => {
              setFilters(f => ({ ...f, plan_type: e.target.value }));
              setPage(0);
            }}
          >
            <option value="">All Plan Types</option>
            <option value="d_snp">D-SNP</option>
            <option value="i_snp">I-SNP</option>
            <option value="c_snp">C-SNP</option>
            <option value="regular">Regular MA-PD</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto bg-background">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)] z-10">
              <tr>
                <th className="pl-6 w-24">Contract</th>
                <th className="w-16">Plan</th>
                <th>Sponsor & Name</th>
                <th className="w-24">Type</th>
                <th className="text-right w-32" title="CMS monthly premium for Medicare Parts A and B benefits">A/B Premium</th>
                <th className="text-right w-28" title="CMS does not publish a separate Part D premium in the 2026 PBP file">Part D Prem.</th>
                <th className="text-right w-32" title="CMS in-network maximum out-of-pocket">In-Network MOOP</th>
                <th className="text-center w-24">Rating</th>
                <th className="pr-6 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !plansData ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="pl-6"><div className="h-4 bg-muted rounded w-16"></div></td>
                    <td><div className="h-4 bg-muted rounded w-8"></div></td>
                    <td>
                      <div className="h-4 bg-muted rounded w-48 mb-1"></div>
                      <div className="h-3 bg-muted/50 rounded w-32"></div>
                    </td>
                    <td><div className="h-5 bg-muted rounded w-16"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-12 ml-auto"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-12 ml-auto"></div></td>
                    <td className="text-right"><div className="h-4 bg-muted rounded w-16 ml-auto"></div></td>
                    <td className="text-center"><div className="h-4 bg-muted rounded w-8 mx-auto"></div></td>
                    <td></td>
                  </tr>
                ))
              ) : plansData?.plans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Building className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No plans found matching your criteria.
                  </td>
                </tr>
              ) : (
                plansData?.plans.map((plan) => (
                  <tr key={plan.id} className="group cursor-pointer hover:bg-muted/30 transition-colors">
                    <td className="pl-6 font-mono text-primary font-medium">
                      <Link href={`/plans/${plan.id}`} className="hover:underline">
                        {plan.contract_id}
                      </Link>
                    </td>
                    <td className="font-mono text-muted-foreground">{plan.plan_id}</td>
                    <td>
                      <div className="font-medium">{plan.sponsor_name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[300px]" title={plan.plan_name}>{plan.plan_name}</div>
                       <div className="flex items-center gap-1 mt-1">
                         <IntegrationBadge integration={plan.d_snp_integration} />
                         {plan.frailty_eligible && <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">Frailty eligible</span>}
                          {plan.is_look_alike && <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300" title={`CMS dual-eligible enrollment: ${plan.dual_eligible_pct?.toFixed(6) ?? "unavailable"}%`}>Look-alike D-SNP</span>}
                       </div>
                    </td>
                    <td><PlanTypeBadge type={plan.plan_type} /></td>
                    <td className="text-right font-mono text-xs" title={plan.cost_source ?? "No CMS value published"}>
                      {formatCurrencyRange(
                        plan.monthly_premium,
                        plan.monthly_premium_min,
                        plan.monthly_premium_max,
                        { hasUnpublished: plan.premium_has_unpublished_counties },
                      )}
                    </td>
                    <td className="text-right font-mono text-xs text-muted-foreground">
                      {plan.drug_premium == null ? "Not published" : formatCurrencyRange(plan.drug_premium, null, null)}
                    </td>
                    <td className="text-right font-mono text-xs" title={plan.cost_source ?? "No CMS value published"}>
                      {formatCurrencyRange(plan.moop, plan.moop_min, plan.moop_max, {
                        hasUnpublished: plan.moop_has_unpublished_counties,
                      })}
                    </td>
                    <td className="text-center font-mono">
                      {plan.star_rating ? (
                         <div className="flex flex-col items-center gap-0.5">
                           <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded text-xs font-semibold dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                             {plan.star_rating.toFixed(1)} ★
                           </span>
                           <span className="text-[10px] text-muted-foreground">
                             C {plan.star_rating_part_c?.toFixed(1) ?? "-"} · D {plan.star_rating_part_d?.toFixed(1) ?? "-"}
                           </span>
                         </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="pr-6 text-right">
                      <Link href={`/plans/${plan.id}`} className="inline-flex p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded transition-colors opacity-0 group-hover:opacity-100">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t bg-muted/10 flex items-center justify-between shrink-0">
          <div className="text-sm text-muted-foreground font-mono">
            Showing <span className="text-foreground font-medium">{plansData?.plans.length || 0}</span> of <span className="text-foreground font-medium">{total}</span> plans
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-mono px-2 text-muted-foreground">
              Page {page + 1} of {maxPage + 1 || 1}
            </div>
            <button
              disabled={page >= maxPage}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
