import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";

// Core pages (eagerly loaded — used on every session)
import Home from "./pages/Home";
import Customers from "./pages/Customers";
import Conversations from "./pages/Conversations";
import ConversationDetail from "./pages/ConversationDetail";
import Tasks from "./pages/Tasks";
import Forms from "./pages/Forms";
import PublicForm from "./pages/PublicForm";
import Campaigns from "./pages/Campaigns";
import RenewalCalendar from "./pages/RenewalCalendar";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";

// Unified hub pages
import IAAutomation from "./pages/IAAutomation";
import Metrics from "./pages/Metrics";
import Indicators from "./pages/Indicators";

// Sprint 17 pages
import Groups from "./pages/Groups";
import Atendimentos from "./pages/Atendimentos";

// Legacy pages (still accessible via direct URL / old bookmarks)
import AIAnalysis from "./pages/AIAnalysis";
import Surveys from "./pages/Surveys";
import Referrals from "./pages/Referrals";
import Productivity from "./pages/Productivity";
import TeamPerformance from "./pages/TeamPerformance";
import UserManagement from "./pages/UserManagement";
import AIAgents from "./pages/AIAgents";
import NewClients from "./pages/NewClients";
import Broadcasts from "./pages/Broadcasts";
import Alerts from "./pages/Alerts";
import SLAMonitor from "./pages/SLAMonitor";
import WeeklyReports from "./pages/WeeklyReports";
import Tutorial from "./pages/Tutorial";
import GroupMonitor from "./pages/GroupMonitor";
import ProgramDashboard from "./pages/ProgramDashboard";
import AISupervision from "./pages/AISupervision";
import Playbooks from "./pages/Playbooks";
import TriggerRules from "./pages/TriggerRules";
import TriggerSimulation from "./pages/TriggerSimulation";
import ImportCSV from "./pages/ImportCSV";
import CommunicationIntelligence from "./pages/CommunicationIntelligence";

function Router() {
  return (
    <Switch>
      {/* ── Public routes (no sidebar) ─────────────────────── */}
      <Route path="/forms/:slug" component={PublicForm} />
      {/* ── Authenticated routes (with sidebar) ─────────────── */}
      <Route>
    <DashboardLayout>
      <Switch>
        {/* ── Primary routes ─────────────────────────────────── */}
        <Route path="/" component={Home} />
        <Route path="/customers" component={Customers} />
        <Route path="/conversations" component={Conversations} />
        <Route path="/conversations/:id">{() => <ConversationDetail />}</Route>
        <Route path="/tasks" component={Tasks} />
        <Route path="/forms" component={Forms} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/renewal-calendar" component={RenewalCalendar} />        {/* ── Unified hub pages ────────────────────────────────────── */}
        <Route path="/ia-automation" component={IAAutomation} />
        <Route path="/ia-automation/supervision" component={IAAutomation} />
        <Route path="/ia-automation/knowledge" component={IAAutomation} />
        <Route path="/ia-automation/cadence" component={IAAutomation} />
        <Route path="/metrics" component={Metrics} />
        <Route path="/indicators" component={Indicators} />
        <Route path="/indicators/health" component={Indicators} />
        <Route path="/indicators/team" component={Indicators} />
        <Route path="/indicators/nps" component={Indicators} />      {/* ── Config ─────────────────────────────────────────── */}
        <Route path="/integrations" component={Integrations} />
        <Route path="/settings" component={Settings} />
        <Route path="/users" component={UserManagement} />

        {/* ── Legacy routes (redirect to unified hubs) ───────── */}
        <Route path="/ai-supervision"><Redirect to="/ia-automation" /></Route>
        <Route path="/ai-agents"><Redirect to="/ia-automation" /></Route>
        <Route path="/ai-analysis"><Redirect to="/ia-automation" /></Route>
        <Route path="/communication-intelligence"><Redirect to="/ia-automation" /></Route>
        <Route path="/playbooks"><Redirect to="/ia-automation" /></Route>
        <Route path="/triggers"><Redirect to="/ia-automation" /></Route>
        <Route path="/trigger-simulation"><Redirect to="/ia-automation" /></Route>
        <Route path="/surveys"><Redirect to="/indicators/nps" /></Route>
        <Route path="/referrals"><Redirect to="/ia-automation" /></Route>
        <Route path="/groups" component={Groups} />
        <Route path="/atendimentos" component={Atendimentos} />
        <Route path="/program-dashboard" component={ProgramDashboard} />
        <Route path="/productivity"><Redirect to="/metrics" /></Route>
        <Route path="/team"><Redirect to="/indicators/team" /></Route>
        <Route path="/sla-monitor"><Redirect to="/metrics" /></Route>
        <Route path="/relatorios"><Redirect to="/metrics" /></Route>
        <Route path="/import-csv"><Redirect to="/settings" /></Route>
        <Route path="/tutorial"><Redirect to="/settings" /></Route>

        {/* ── Legacy pages still accessible directly ─────────── */}
        <Route path="/new-clients" component={NewClients} />
        <Route path="/broadcasts" component={Broadcasts} />
        <Route path="/alerts" component={Alerts} />

        {/* ── 404 ────────────────────────────────────────────── */}
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
