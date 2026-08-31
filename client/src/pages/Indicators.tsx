import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HeartPulse, SmilePlus } from "lucide-react";
import { SubTabBar } from "@/components/SubTabBar";
import { useLocation } from "wouter";

const HealthIndicators = lazy(() => import("./HealthIndicators"));
const Surveys = lazy(() => import("./Surveys"));

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

const INDICATOR_TABS = [
  { label: "Saúde dos Clientes",  path: "/indicators/health", icon: HeartPulse },
  { label: "NPS & Pesquisas",     path: "/indicators/nps",    icon: SmilePlus },
];

export default function Indicators() {
  const [location] = useLocation();

  const isNps = location.includes("/nps");

  return (
    <div className="flex flex-col h-full page-bg min-h-screen">
      <SubTabBar tabs={INDICATOR_TABS} />
      <div className="flex-1">
        {!isNps && (
          <Suspense fallback={<TabSkeleton />}>
            <HealthIndicators />
          </Suspense>
        )}
        {isNps && (
          <Suspense fallback={<TabSkeleton />}>
            <Surveys />
          </Suspense>
        )}
      </div>
    </div>
  );
}
