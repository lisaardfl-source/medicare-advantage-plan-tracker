import { useGetSummary, useGetTopPlans } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanTypeBadge, formatCurrency, formatNumber } from "@/components/ui/plan-badge";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Link } from "wouter";

const PLAN_COLORS: Record<string, string> = {
  d_snp: "#1e40af", // blue-800
  i_snp: "#92400e", // amber-800
  c_snp: "#115e59", // teal-800
  regular: "#475569", // slate-600
};

export default function SummaryAnalytics() {
  const { data: summary, isLoading: isSummaryLoading } = useGetSummary();
  const { data: topPlans, isLoading: isTopPlansLoading } = useGetTopPlans({ limit: 10 });

  const pieData = summary?.by_plan_type.map(pt => ({
    name: pt.plan_type.toUpperCase().replace('_', '-'),
    rawType: pt.plan_type,
    value: pt.beneficiary_count,
  })) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics & Trends</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Macro-level insights into the Medicare Advantage ecosystem
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>Enrollment by Plan Type</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center min-h-[350px]">
            {isSummaryLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground animate-pulse">Loading chart...</div>
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PLAN_COLORS[entry.rawType] || PLAN_COLORS.regular} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatNumber(value)}
                    contentStyle={{ borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </CardContent>
        </Card>

        <Card className="col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>Top 10 Plans by Enrollment Volume</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="pl-6 w-12 text-center text-muted-foreground">#</th>
                    <th>Contract</th>
                    <th>Sponsor</th>
                    <th>Type</th>
                    <th className="text-center">Counties</th>
                    <th className="text-right pr-6">Beneficiaries</th>
                  </tr>
                </thead>
                <tbody>
                  {isTopPlansLoading ? (
                    <tr><td colSpan={6} className="text-center py-12">Loading...</td></tr>
                  ) : topPlans?.map((plan, i) => (
                    <tr key={plan.id} className="hover:bg-muted/10">
                      <td className="pl-6 text-center font-mono text-muted-foreground">{i + 1}</td>
                      <td className="font-mono text-primary font-medium">
                        <Link href={`/plans/${plan.id}`} className="hover:underline">
                          {plan.contract_id}
                        </Link>
                      </td>
                      <td className="font-medium">{plan.sponsor_name}</td>
                      <td><PlanTypeBadge type={plan.plan_type} /></td>
                      <td className="text-center font-mono">{plan.county_count}</td>
                      <td className="text-right pr-6 font-mono font-bold text-primary">
                        {formatNumber(plan.total_beneficiaries)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-6 md:grid-cols-4">
        {summary?.by_plan_type.map(pt => (
          <Card key={pt.plan_type} className="border-t-4" style={{ borderTopColor: PLAN_COLORS[pt.plan_type] || PLAN_COLORS.regular }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                {pt.plan_type.toUpperCase().replace('_', '-')}
                <span className="text-foreground font-mono font-bold bg-muted px-2 py-0.5 rounded text-xs">
                  {Math.round(pt.pct_of_total)}%
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mt-2">
                <div>
                  <div className="text-2xl font-bold font-mono text-foreground">{formatNumber(pt.beneficiary_count)}</div>
                  <div className="text-xs text-muted-foreground">Total Enrollees</div>
                </div>
                <div className="pt-3 border-t">
                  <div className="text-lg font-mono text-foreground">{formatNumber(pt.plan_count)}</div>
                  <div className="text-xs text-muted-foreground">Active Plans</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
