import { useState } from "react";
import { 
  useGetPlan, 
  useGetPlanEnrollments, 
  useGetPlanBenefits,
  useUpdatePlan,
  useDeletePlan,
  useAddPlanBenefit,
  getGetPlanQueryKey,
  getGetPlanBenefitsQueryKey,
  PlanUpdatePlanType
} from "@workspace/api-client-react";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanTypeBadge, formatCurrency, formatCurrencyRange, formatNumber } from "@/components/ui/plan-badge";
import { Building, MapPin, Users, Activity, Stethoscope, ChevronLeft, Eye, Heart, Bus, Apple, Plus, Settings, Trash, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

export default function PlanDetail() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: plan, isLoading: isPlanLoading } = useGetPlan(id);
  const { data: enrollments, isLoading: isEnrollmentsLoading } = useGetPlanEnrollments(id);
  // Optional if we want to refresh benefits separately, but they are included in PlanDetail. 
  // However we need it to invalidate cache correctly, so we'll fetch them separately to be sure, or just rely on getPlan.
  const { data: separatedBenefits } = useGetPlanBenefits(id);
  
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const addBenefit = useAddPlanBenefit();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBenefitOpen, setIsBenefitOpen] = useState(false);

  if (isPlanLoading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded"></div>
        <div className="h-32 bg-muted rounded-xl"></div>
        <div className="grid grid-cols-3 gap-6">
          <div className="h-64 bg-muted rounded-xl col-span-2"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return <div className="p-12 text-center text-muted-foreground">Plan not found</div>;
  }

  const getBenefitIcon = (category: string) => {
    switch (category) {
      case 'dental': return <Heart className="w-4 h-4" />;
      case 'vision': return <Eye className="w-4 h-4" />;
      case 'hearing': return <Activity className="w-4 h-4" />;
      case 'fitness': return <Activity className="w-4 h-4" />;
      case 'transportation': return <Bus className="w-4 h-4" />;
      case 'meals': return <Apple className="w-4 h-4" />;
      case 'otc': return <Stethoscope className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: {
      plan_name: string;
      sponsor_name: string;
      plan_type: PlanUpdatePlanType;
      monthly_premium?: number | null;
      moop?: number | null;
    } = {
      plan_name: formData.get("plan_name") as string,
      sponsor_name: formData.get("sponsor_name") as string,
      plan_type: formData.get("plan_type") as PlanUpdatePlanType,
    };
    if (!plan.cost_source) {
      data.monthly_premium = formData.get("monthly_premium")
        ? Number(formData.get("monthly_premium"))
        : null;
      data.moop = formData.get("moop") ? Number(formData.get("moop")) : null;
    }
    
    updatePlan.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(id) });
        setIsEditOpen(false);
      }
    });
  };

  const handleBenefitSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      benefit_name: formData.get("benefit_name") as string,
      benefit_category: formData.get("benefit_category") as string,
      benefit_value: formData.get("benefit_value") as string,
      is_attributed: true,
    };
    
    addBenefit.mutate({ id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetPlanBenefitsQueryKey(id) });
        setIsBenefitOpen(false);
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this plan? This action cannot be undone.")) {
      deletePlan.mutate({ id }, {
        onSuccess: () => {
          setLocation("/plans");
        }
      });
    }
  };

  const benefitsToDisplay = separatedBenefits || plan.benefits;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/plans" className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{plan.contract_id}-{plan.plan_id}</h1>
              <PlanTypeBadge type={plan.plan_type} />
              {plan.is_look_alike && <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">Look-alike D-SNP</span>}
              {plan.star_rating && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-sm font-semibold dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                  {plan.star_rating.toFixed(1)} ★ Rating
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {plan.plan_name} • Sponsored by {plan.sponsor_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogTrigger asChild>
              <button className="p-2 rounded-md border bg-background hover:bg-muted text-muted-foreground transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Plan</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plan Name</label>
                  <input name="plan_name" defaultValue={plan.plan_name} required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Sponsor Name</label>
                  <input name="sponsor_name" defaultValue={plan.sponsor_name} required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Plan Type</label>
                  <select name="plan_type" defaultValue={plan.plan_type} required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="d_snp">D-SNP</option>
                    <option value="i_snp">I-SNP</option>
                    <option value="c_snp">C-SNP</option>
                    <option value="regular">Regular MA-PD</option>
                  </select>
                </div>
                {plan.cost_source ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Premium and MOOP are managed by {plan.cost_source}. Re-run the CMS import to update these values.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Monthly A/B Premium ($)</label>
                      <input name="monthly_premium" type="number" step="0.01" defaultValue={plan.monthly_premium ?? ""} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">In-Network MOOP ($)</label>
                      <input name="moop" type="number" step="0.01" defaultValue={plan.moop ?? ""} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    </div>
                  </div>
                )}
                <DialogFooter className="mt-6">
                  <button type="button" onClick={() => setIsEditOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">Cancel</button>
                  <button type="submit" disabled={updatePlan.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {updatePlan.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <button onClick={handleDelete} disabled={deletePlan.isPending} className="p-2 rounded-md border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors">
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium mb-1">Monthly A/B Premium</div>
            <div className="text-3xl font-bold font-mono text-primary">
              {formatCurrencyRange(
                plan.monthly_premium,
                plan.monthly_premium_min,
                plan.monthly_premium_max,
                { hasUnpublished: plan.premium_has_unpublished_counties },
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
              {plan.premium_has_unpublished_counties
                ? "CMS leaves this unpublished in some county segments"
                : plan.premium_varies_by_county
                  ? "Range varies by county segment"
                  : "CMS plan premium for A/B benefits"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium mb-1">In-Network MOOP</div>
            <div className="text-3xl font-bold font-mono text-primary">
              {formatCurrencyRange(plan.moop, plan.moop_min, plan.moop_max, {
                hasUnpublished: plan.moop_has_unpublished_counties,
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
              {plan.moop_has_unpublished_counties
                ? "CMS leaves this unpublished in some county segments"
                : plan.moop_varies_by_county
                  ? "Range varies by county segment"
                  : "Maximum out-of-pocket"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium mb-1">Total Enrollment</div>
            <div className="text-3xl font-bold font-mono text-primary">{formatNumber(plan.total_beneficiaries)}</div>
            <div className="text-xs text-muted-foreground mt-2 border-t pt-2 flex items-center gap-1">
              <Users className="w-3 h-3" /> Beneficiaries
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground font-medium mb-1">Service Area</div>
            <div className="text-3xl font-bold font-mono text-primary">{plan.county_count}</div>
            <div className="text-xs text-muted-foreground mt-2 border-t pt-2 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Counties
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-rose-200/70 bg-rose-50/30 dark:border-rose-900/60 dark:bg-rose-950/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div>
            <p className="font-semibold">CMS dual-eligible enrollment assessment</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.dual_eligible_data_status === "available"
                ? `${plan.dual_eligible_pct?.toFixed(6) ?? "—"}% dual eligible (${plan.dual_eligible_enrollment == null ? "count not published" : `${formatNumber(plan.dual_eligible_enrollment)} of ${formatNumber(plan.look_alike_total_enrollment ?? 0)} beneficiaries`}). Look-alike threshold: 70.000000%.`
                : plan.dual_eligible_data_status === "suppressed"
                  ? "CMS suppressed the dual-eligible value. This plan is not classified from a suppressed value."
                  : "CMS has no usable dual-eligible value for this plan. It is not classified as a look-alike from missing data."}
            </p>
          </div>
          {plan.dual_eligible_source_url && (
            <a href={plan.dual_eligible_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              CMS source <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardContent>
      </Card>

      {plan.cost_source && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm">
          <div>
            <span className="font-medium">Cost source:</span>{" "}
            <span className="text-muted-foreground">{plan.cost_source}</span>
          </div>
          {plan.cost_source_url && (
            <a
              href={plan.cost_source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              CMS source <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg">Attributed Supplemental Benefits</CardTitle>
            <Dialog open={isBenefitOpen} onOpenChange={setIsBenefitOpen}>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 bg-muted text-foreground px-3 py-1.5 rounded-md text-xs font-medium hover:bg-muted/80 transition-colors">
                  <Plus className="w-3 h-3" /> Add Benefit
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Supplemental Benefit</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleBenefitSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <select name="benefit_category" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="dental">Dental</option>
                      <option value="vision">Vision</option>
                      <option value="hearing">Hearing</option>
                      <option value="fitness">Fitness</option>
                      <option value="transportation">Transportation</option>
                      <option value="meals">Meals</option>
                      <option value="otc">Over The Counter (OTC)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description Name</label>
                    <input name="benefit_name" placeholder="e.g., Preventive Dental" required className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Value/Allowance</label>
                    <input name="benefit_value" placeholder="e.g., $1,500/year" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <DialogFooter className="mt-6">
                    <button type="button" onClick={() => setIsBenefitOpen(false)} className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted">Cancel</button>
                    <button type="submit" disabled={addBenefit.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                      {addBenefit.isPending ? "Adding..." : "Add Benefit"}
                    </button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="flex-1">
            {benefitsToDisplay && benefitsToDisplay.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {benefitsToDisplay.map((benefit) => (
                  <div key={benefit.id} className="p-4 rounded-lg border bg-muted/10 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {getBenefitIcon(benefit.benefit_category)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm capitalize">{benefit.benefit_category}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{benefit.benefit_name}</div>
                      {benefit.benefit_value && (
                        <div className="mt-2 text-sm font-mono bg-background border px-2 py-1 rounded inline-block">
                          {benefit.benefit_value}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground border rounded-lg border-dashed">
                <Building className="w-8 h-8 mx-auto mb-2 opacity-20" />
                No structured benefit data available for this plan.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">County Enrollment</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 z-10">
                  <tr>
                    <th className="pl-6">County</th>
                    <th className="text-right">2026 Cost</th>
                    <th className="text-right pr-6">Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {isEnrollmentsLoading ? (
                    <tr><td colSpan={3} className="p-4 text-center">Loading...</td></tr>
                  ) : enrollments && enrollments.length > 0 ? (
                    enrollments.map((enr) => (
                      <tr key={enr.id}>
                        <td className="pl-6">
                          <div className="font-medium">{enr.county_name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{enr.state_code}</div>
                        </td>
                        <td className="text-right font-mono text-xs">
                          <div>A/B {enr.monthly_premium == null ? "Not published" : formatCurrency(enr.monthly_premium)}</div>
                          <div className="text-muted-foreground">MOOP {enr.moop == null ? "Not published" : formatCurrency(enr.moop)}</div>
                        </td>
                        <td className="text-right pr-6 font-mono">{formatNumber(enr.beneficiary_count)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-muted-foreground">
                        No enrollment records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
