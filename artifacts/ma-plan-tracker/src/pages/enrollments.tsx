import { useState } from "react";
import { Link } from "wouter";
import { useListEnrollments, useListStates, useListPlans, useCreateEnrollment, getListEnrollmentsQueryKey, listEnrollments } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { PlanTypeBadge, formatNumber } from "@/components/ui/plan-badge";
import { SlidersHorizontal, ChevronRight, ChevronLeft, Users, Plus, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

export default function Enrollments() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const limit = 50;
  
  const [filters, setFilters] = useState({
    state_code: "",
    plan_type: "",
    min_beneficiaries: 10,
  });

  const { data: enrollments, isLoading } = useListEnrollments({
    ...filters,
    plan_type: filters.plan_type ? filters.plan_type as any : undefined,
    limit,
    offset: page * limit,
  }, { query: { keepPreviousData: true } as any });

  const { data: states } = useListStates();
  const { data: plansData } = useListPlans({ limit: 100 }); // fetch some plans for the dropdown

  const createEnrollment = useCreateEnrollment();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const hasNextPage = enrollments ? enrollments.length === limit : false;

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      plan_id: Number(formData.get("plan_id")),
      county_fips: formData.get("county_fips") as string,
      beneficiary_count: Number(formData.get("beneficiary_count")),
      year: new Date().getFullYear(),
    };
    
    createEnrollment.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEnrollmentsQueryKey() });
        setIsCreateOpen(false);
      }
    });
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const data = await listEnrollments({
        ...filters,
        plan_type: filters.plan_type ? filters.plan_type as any : undefined,
        limit: 9999,
        offset: 0,
      });
      
      const headers = [
        "Contract ID",
        "Plan Name",
        "Sponsor",
        "Type",
        "State",
        "County",
        "FIPS",
        "A/B Monthly Premium",
        "In-Network MOOP",
        "Cost Source",
        "Enrollment",
        "Year",
      ];
      
      const rows = data.map(enr => [
        enr.contract_id,
        enr.plan_name,
        enr.sponsor_name,
        enr.plan_type,
        enr.state_code,
        enr.county_name,
        enr.county_fips,
        enr.monthly_premium ?? "",
        enr.moop ?? "",
        enr.cost_source ?? "",
        enr.beneficiary_count,
        enr.year
      ]);

      const csvContent = [
        headers.map(csvCell).join(","),
        ...rows.map(row => row.map(csvCell).join(",")),
      ].join("\n");
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `ma_enrollments_export_${new Date().toISOString().split('T')[0]}.csv`);
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Enrollment Explorer</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Raw enrollment records aggregated by plan and county
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
                <Plus className="w-4 h-4" /> Add Record
              </button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Enrollment Record</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan</label>
                <select name="plan_id" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  {plansData?.plans.map(p => (
                    <option key={p.id} value={p.id}>{p.contract_id} - {p.plan_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">County FIPS</label>
                  <input name="county_fips" required placeholder="e.g. 12085" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Beneficiary Count</label>
                  <input name="beneficiary_count" type="number" required min="1" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">Cancel</button>
                <button type="submit" disabled={createEnrollment.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {createEnrollment.isPending ? "Saving..." : "Save Record"}
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

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">Min Enrollees:</span>
            <input 
              type="number" 
              className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              value={filters.min_beneficiaries}
              onChange={(e) => {
                setFilters(f => ({ ...f, min_beneficiaries: Number(e.target.value) || 0 }));
                setPage(0);
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-background">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)] z-10">
              <tr>
                <th className="pl-6 w-32">Contract</th>
                <th>Sponsor / Plan Name</th>
                <th className="w-24">Type</th>
                <th className="w-16">St</th>
                <th>County</th>
                <th className="w-24">FIPS</th>
                <th className="text-right pr-6 w-32">Enrollment</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !enrollments ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="pl-6"><div className="h-4 bg-muted rounded w-20"></div></td>
                    <td>
                      <div className="h-4 bg-muted rounded w-48 mb-1"></div>
                    </td>
                    <td><div className="h-5 bg-muted rounded w-16"></div></td>
                    <td><div className="h-4 bg-muted rounded w-8"></div></td>
                    <td><div className="h-4 bg-muted rounded w-32"></div></td>
                    <td><div className="h-4 bg-muted rounded w-16"></div></td>
                    <td className="text-right pr-6"><div className="h-4 bg-muted rounded w-12 ml-auto"></div></td>
                  </tr>
                ))
              ) : enrollments?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No enrollment records found.
                  </td>
                </tr>
              ) : (
                enrollments?.map((enr) => (
                  <tr key={enr.id} className="hover:bg-muted/30 transition-colors">
                    <td className="pl-6 font-mono text-primary font-medium">
                      <Link href={`/plans/${enr.plan_id}`} className="hover:underline">
                        {enr.contract_id}
                      </Link>
                    </td>
                    <td>
                      <div className="font-medium">{enr.sponsor_name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[300px]" title={enr.plan_name}>{enr.plan_name}</div>
                    </td>
                    <td><PlanTypeBadge type={enr.plan_type} /></td>
                    <td className="font-mono font-medium text-muted-foreground">{enr.state_code}</td>
                    <td>{enr.county_name}</td>
                    <td className="font-mono text-muted-foreground">{enr.county_fips}</td>
                    <td className="text-right pr-6 font-mono font-bold text-primary">
                      {formatNumber(enr.beneficiary_count)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t bg-muted/10 flex items-center justify-between shrink-0">
          <div className="text-sm text-muted-foreground font-mono">
            {enrollments ? `Showing ${enrollments.length} records` : 'Loading...'}
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
              Page {page + 1}
            </div>
            <button
              disabled={!hasNextPage}
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
