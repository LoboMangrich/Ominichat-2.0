import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Eye, BookOpen, Zap } from "lucide-react";
import { SubTabBar } from "@/components/SubTabBar";
import { useLocation } from "wouter";

// As funções essenciais da IA
const AISupervision = lazy(() => import("./AISupervision"));
const AIAgents = lazy(() => import("./AIAgents"));
const KnowledgeBase = lazy(() => import("./KnowledgeBase"));
const CadenceAutomation = lazy(() => import("./CadenceAutomation"));

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

const IA_TABS = [
  { label: "Agentes",              path: "/ia-automation",            icon: Bot },
  { label: "Supervisão",           path: "/ia-automation/supervision", icon: Eye },
  { label: "Base de Conhecimento", path: "/ia-automation/knowledge",   icon: BookOpen },
  { label: "Automações",           path: "/ia-automation/cadence",     icon: Zap },
];

export default function IAAutomation() {
  const [location] = useLocation();
  const isSupervision = location.includes("/supervision");
  const isKnowledge = location.includes("/knowledge");
  const isCadence = location.includes("/cadence");

  return (
    <div className="flex flex-col h-full page-bg min-h-screen">
      <SubTabBar tabs={IA_TABS} />
      <div className="flex-1">
        {!isSupervision && !isKnowledge && !isCadence && (
          <Suspense fallback={<TabSkeleton />}>
            <AIAgents />
          </Suspense>
        )}
        {isSupervision && (
          <Suspense fallback={<TabSkeleton />}>
            <AISupervision />
          </Suspense>
        )}
        {isKnowledge && (
          <Suspense fallback={<TabSkeleton />}>
            <KnowledgeBase />
          </Suspense>
        )}
        {isCadence && (
          <Suspense fallback={<TabSkeleton />}>
            <div className="p-6">
              <CadenceAutomation />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  );
}
