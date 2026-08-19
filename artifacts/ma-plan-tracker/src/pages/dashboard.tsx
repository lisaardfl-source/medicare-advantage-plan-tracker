import { useGetSummary, useListStates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatCurrency, PlanTypeBadge } from "@/components/ui/plan-badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Users, FileSpreadsheet, Map, Building2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const PLAN_COLORS: Record<string, string> = {
  d_snp: "#1e40af", // blue-800
  i_snp: "#92400e", // amber-800
  c_snp: "#115e59", // teal-800
  regular: "#475569", // slate-600
};

export default function Dashboard() {
  const [selectedState, setSelectedState] = useState<string>("");
  
  const { data: summary, isLoading: isSummaryLoading } = useGetSummary(
    selectedState ? { state_code: selectedState } : undefined
  );
  const { data: states } = useListStates();

  const chartData = summary?.by_plan_type.map(pt => ({
    name: pt.plan_type.toUpperCase().replace('_', '-'),
    rawType: pt.plan_type,
    plans: pt.plan_count,
    beneficiaries: pt.beneficiary_count,
  })) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of Medicare Advantage plan landscape {selectedState ? `in ${selectedState}` : 'nationwide'}
          </p>
        </div>
        
        <select 
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
        >
          <option value="">National Overview</option>
          {states?.map(s => (
            <option key={s.state_code} value={s.state_code}>{s.state_name}</option>
          ))}
        </select>
      </div>

      {isSummaryLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="h-4 w-24 bg-muted rounded"></div>
                <div className="h-4 w-4 bg-muted rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted rounded mb-1"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Plans</CardTitle>
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-primary">{formatNumber(summary.total_plans)}</div>
              <p className="text-xs text-muted-foreground mt-1 tracking-tight">Active H-Numbers</p>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Beneficiaries</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-primary">{formatNumber(summary.total_beneficiaries)}</div>
              <p className="text-xs text-muted-foreground mt-1 tracking-tight">Total enrollment</p>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Counties Covered</CardTitle>
              <Map className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-primary">{formatNumber(summary.total_counties)}</div>
              <p className="text-xs text-muted-foreground mt-1 tracking-tight">With at least 1 plan</p>
            </CardContent>
          </Card>
          <Card className="hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Avg Premium</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(summary.avg_premium)}</div>
              <p className="text-xs text-muted-foreground mt-1 tracking-tight">Across all plans</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Plan Type Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatNumber(val)} />
                  <Tooltip 
                    cursor={{fill: 'var(--muted)', opacity: 0.4}}
                    contentStyle={{ borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                  />
                  <Bar dataKey="plans" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PLAN_COLORS[entry.rawType] || PLAN_COLORS.regular} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan Composition</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary?.by_plan_type.map(pt => (
                <div key={pt.plan_type} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <PlanTypeBadge type={pt.plan_type} />
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-medium">{formatNumber(pt.plan_count)} plans</div>
                    <div className="text-xs text-muted-foreground font-mono">{formatNumber(pt.beneficiary_count)} enrolled</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t flex flex-col gap-2">
              <Link href="/plans" className="text-sm font-medium text-primary hover:underline flex items-center justify-between">
                View all plans detailed list <span>→</span>
              </Link>
              <Link href="/counties" className="text-sm font-medium text-primary hover:underline flex items-center justify-between">
                Explore county-level coverage <span>→</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
