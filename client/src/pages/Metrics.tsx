import { lazy, Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Clock, TrendingUp, FileText } from "lucide-react";

const Productivity = lazy(() => import("./Productivity"));
const TeamPerformance = lazy(() => import("./TeamPerformance"));
const SLAMonitor = lazy(() => import("./SLAMonitor"));
const WeeklyReports = lazy(() => import("./WeeklyReports"));

function TabSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-3 gap-4 mt-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export default function Metrics() {
  const [tab, setTab] = useState("productivity");

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Equipe & Métricas
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Produtividade, desempenho da equipe, SLA e relatórios semanais em um só lugar.
        </p>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="productivity" className="gap-1.5 text-xs">
              <TrendingUp className="w-3.5 h-3.5" /> Produtividade
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" /> Desempenho da Equipe
            </TabsTrigger>
            <TabsTrigger value="sla" className="gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5" /> Monitor de SLA
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5" /> Relatórios Semanais
            </TabsTrigger>
          </TabsList>

          <TabsContent value="productivity" className="mt-0 -mx-6">
            <Suspense fallback={<TabSkeleton />}>
              <Productivity />
            </Suspense>
          </TabsContent>

          <TabsContent value="team" className="mt-0 -mx-6">
            <Suspense fallback={<TabSkeleton />}>
              <TeamPerformance />
            </Suspense>
          </TabsContent>

          <TabsContent value="sla" className="mt-0 -mx-6">
            <Suspense fallback={<TabSkeleton />}>
              <SLAMonitor />
            </Suspense>
          </TabsContent>

          <TabsContent value="reports" className="mt-0 -mx-6">
            <Suspense fallback={<TabSkeleton />}>
              <WeeklyReports />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
