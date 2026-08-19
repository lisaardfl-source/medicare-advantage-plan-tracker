import { useState } from "react";
import { useListStates, useListCounties, useGetCountyMarketShare } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanTypeBadge, IntegrationBadge, formatCurrency, formatNumber, getAepStabilityScore } from "@/components/ui/plan-badge";
import { Link } from "wouter";
import { Map as MapIcon, MapPin, Building, Activity, List, Globe2, Landmark } from "lucide-react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

export default function CountiesBrowser() {
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedCounty, setSelectedCounty] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

  const { data: states } = useListStates();
  const { data: counties, isLoading: isCountiesLoading } = useListCounties(
    selectedState ? { state_code: selectedState } : undefined,
    { query: { enabled: !!selectedState } as any }
  );

  const { data: marketData, isLoading: isPlansLoading } = useGetCountyMarketShare(
    selectedCounty,
    { year: selectedYear },
    { query: { enabled: !!selectedCounty } as any }
  );

  const plans = marketData?.plans;
  const rateBenchmark = marketData?.rate_benchmark;
  const benchmarkUnavailableReason = marketData?.benchmark_unavailable_reason;

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">County Explorer</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drill down into available MA plans and metrics by specific counties
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 flex-1 min-h-0">
        <Card className="col-span-1 flex flex-col min-h-[400px]">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-primary" /> Region
              </CardTitle>
              <div className="flex bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1 rounded-sm ${viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`p-1 rounded-sm ${viewMode === "map" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  title="Map View"
                >
                  <Globe2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
            {viewMode === "list" ? (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">State</label>
                <select 
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    setSelectedCounty("");
                  }}
                >
                  <option value="" disabled>Select a state...</option>
                  {states?.map(s => (
                    <option key={s.state_code} value={s.state_code}>
                      {s.state_name} ({s.state_code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex-1 min-h-[200px] border rounded-md bg-muted/5 flex items-center justify-center overflow-hidden">
                <ComposableMap projection="geoAlbersUsa" className="w-full h-full">
                  <Geographies geography="https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json">
                    {({ geographies }) =>
                      geographies.map((geo) => {
                        const stateName = geo.properties.name;
                        const stateObj = states?.find(s => s.state_name === stateName);
                        const hasData = !!stateObj;
                        
                        return (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill={hasData ? "hsl(var(--primary) / 0.2)" : "hsl(var(--muted))"}
                            stroke="hsl(var(--background))"
                            strokeWidth={0.5}
                            onClick={() => {
                              if (stateObj) {
                                setSelectedState(stateObj.state_code);
                                setViewMode("list");
                                setSelectedCounty("");
                              }
                            }}
                            className={hasData ? "cursor-pointer hover:fill-primary/40 transition-colors outline-none" : "outline-none"}
                            style={{
                              default: { outline: "none" },
                              hover: { outline: "none" },
                              pressed: { outline: "none" },
                            }}
                          />
                        );
                      })
                    }
                  </Geographies>
                </ComposableMap>
              </div>
            )}

            {selectedState && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">County</label>
                <div className="flex-1 border rounded-md overflow-y-auto bg-muted/10">
                  {isCountiesLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Loading counties...</div>
                  ) : (
                    <ul className="divide-y text-sm">
                      {counties?.map(county => (
                        <li key={county.fips}>
                          <button
                            onClick={() => setSelectedCounty(county.fips)}
                            className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-center justify-between ${
                              selectedCounty === county.fips ? "bg-primary/10 text-primary font-medium" : ""
                            }`}
                          >
                            <span>{county.county_name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{county.fips}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 md:col-span-3 flex flex-col min-h-0">
          {!selectedCounty ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12">
              <MapPin className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground mb-1">No County Selected</h3>
              <p className="text-sm">Select a state and county from the sidebar to view available plans.</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b shrink-0 flex items-center justify-between bg-muted/5">
                <div>
                  <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
                    Plans in {counties?.find(c => c.fips === selectedCounty)?.county_name} County
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <p className="text-sm text-muted-foreground font-mono">FIPS: {selectedCounty}</p>
                    {marketData && (
                      <>
                        <div className="w-px h-4 bg-border"></div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">HHI: <span className="font-mono">{marketData.hhi.toFixed(0)}</span></span>
                          {marketData.hhi < 1500 ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs px-1.5 py-0.5 rounded font-medium dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">Competitive</span>
                          ) : marketData.hhi <= 2500 ? (
                            <span className="bg-orange-100 text-orange-800 border border-orange-200 text-xs px-1.5 py-0.5 rounded font-medium dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">Moderate</span>
                          ) : (
                            <span className="bg-red-100 text-red-800 border border-red-200 text-xs px-1.5 py-0.5 rounded font-medium dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">Highly Concentrated</span>
                          )}
                        </div>
                        {(marketData.is_monopoly || marketData.is_duopoly) && (
                          <>
                            <div className="w-px h-4 bg-border"></div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              marketData.is_monopoly 
                                ? "bg-red-500 text-white" 
                                : "bg-amber-500 text-white"
                            }`}>
                              {marketData.is_monopoly ? "Monopoly" : "Duopoly"}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <select 
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    <option value={2025}>CY 2025</option>
                    <option value={2026}>CY 2026</option>
                  </select>
                  {plans && (
                    <div className="text-sm border rounded-md px-3 py-1.5 bg-background shadow-sm font-medium whitespace-nowrap">
                      <span className="text-primary font-bold font-mono">{plans.length}</span> active plans
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-background relative">
                {isPlansLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Activity className="w-6 h-6 text-muted-foreground animate-pulse" />
                  </div>
                 ) : (
                   <>
                     {(rateBenchmark || benchmarkUnavailableReason) && (
                       <div className="m-5 mb-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                         <div className="flex items-start gap-3">
                           <div className="rounded-md bg-primary/10 p-2 text-primary">
                             <Landmark className="h-4 w-4" />
                           </div>
                           <div className="min-w-0 flex-1">
                             {rateBenchmark ? (
                               <>
                                 <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                               <div>
                                  <p className="text-sm font-semibold">CMS {rateBenchmark.year} monthly county benchmarks</p>
                                 <p className="text-xs text-muted-foreground">Medicare Advantage Parts A &amp; B capitation rates from the CMS MA Rate Book</p>
                               </div>
                                <span className="font-mono text-xs text-muted-foreground">CMS code {rateBenchmark.cms_county_code}</span>
                             </div>
                             <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                <div><p className="text-xs text-muted-foreground">0% bonus</p><p className="font-mono font-semibold">{formatCurrency(rateBenchmark.rate_0_star)}</p></div>
                                <div><p className="text-xs text-muted-foreground">3.5% bonus</p><p className="font-mono font-semibold">{formatCurrency(rateBenchmark.rate_3_5_star)}</p></div>
                                <div><p className="text-xs text-muted-foreground">5% bonus</p><p className="font-mono font-semibold">{formatCurrency(rateBenchmark.rate_5_star)}</p></div>
                                <div><p className="text-xs text-muted-foreground">ESRD dialysis</p><p className="font-mono font-semibold">{formatCurrency(rateBenchmark.esrd_rate)}</p></div>
                             </div>
                               </>
                             ) : (
                               <>
                                 <p className="text-sm font-semibold">CMS 2026 county benchmark unavailable</p>
                                 <p className="mt-1 text-xs text-muted-foreground">
                                   CMS does not publish a 2026 Medicare Advantage rate-book benchmark for this county-equivalent.
                                 </p>
                                 <p className="mt-3 text-sm">{benchmarkUnavailableReason}</p>
                               </>
                             )}
                           </div>
                         </div>
                       </div>
                     )}
                     {plans && plans.length > 0 ? (
                   <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background shadow-[0_1px_0_var(--border)] z-10">
                      <tr>
                        <th className="pl-6 w-24">Contract</th>
                        <th className="w-16">Plan</th>
                        <th>Sponsor</th>
                        <th className="w-24">Type</th>
                         <th className="text-right w-28" title="CMS monthly premium for Medicare Parts A and B benefits">A/B Premium</th>
                         <th className="text-right w-28" title="CMS in-network maximum out-of-pocket">In-Network MOOP</th>
                        <th className="text-right w-24">Enrolled</th>
                        <th className="text-center w-28">AEP Stability</th>
                        <th className="text-right w-48 pr-6">Market Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...plans].sort((a, b) => b.market_share_pct - a.market_share_pct).map(plan => (
                        <tr key={plan.plan_id} className="hover:bg-muted/30 transition-colors">
                          <td className="pl-6 font-mono text-primary font-medium">
                            <Link href={`/plans/${plan.plan_id}`} className="hover:underline">
                              {plan.contract_id}
                            </Link>
                          </td>
                          <td className="font-mono text-muted-foreground">{plan.plan_id}</td>
                          <td>
                            <div className="font-medium">{plan.sponsor_name}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={plan.plan_name}>{plan.plan_name}</div>
                             <div className="flex items-center gap-1 mt-1">
                               <IntegrationBadge integration={plan.d_snp_integration} />
                               {plan.frailty_eligible && <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">Frailty</span>}
                                {plan.is_look_alike && <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300" title={`CMS dual-eligible enrollment: ${plan.dual_eligible_pct?.toFixed(6) ?? "unavailable"}%`}>Look-alike D-SNP</span>}
                             </div>
                          </td>
                          <td><PlanTypeBadge type={plan.plan_type} /></td>
                           <td className="text-right font-mono" title={plan.cost_source ?? "No CMS value published"}>
                             {plan.monthly_premium == null ? "Not published" : formatCurrency(plan.monthly_premium)}
                           </td>
                           <td className="text-right font-mono" title={plan.cost_source ?? "No CMS value published"}>
                             {plan.moop == null ? "Not published" : formatCurrency(plan.moop)}
                           </td>
                          <td className="text-right font-mono font-medium">{formatNumber(plan.beneficiary_count)}</td>
                           <td className="text-center">
                             {(() => {
                               const stability = getAepStabilityScore(plan);
                               return (
                                 <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${stability.className}`} title="Composite of CMS stars, enrollment scale, and contract tenure">
                                   {stability.score} · {stability.label}
                                 </span>
                               );
                             })()}
                           </td>
                          <td className="pr-6 align-middle">
                            <div className="flex items-center justify-end gap-2">
                              <div className="text-right font-mono text-xs w-10">
                                {plan.market_share_pct.toFixed(1)}%
                              </div>
                              <div className="w-24 h-1.5 bg-primary/20 rounded-full overflow-hidden flex-shrink-0">
                                <div 
                                  className="h-full bg-primary rounded-full" 
                                  style={{ width: `${plan.market_share_pct}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                     ) : (
                   <div className="min-h-[240px] flex flex-col items-center justify-center text-muted-foreground">
                    <Building className="w-8 h-8 mb-3 opacity-20" />
                    <p>No plans found for this county.</p>
                  </div>
                     )}
                   </>
                 )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
