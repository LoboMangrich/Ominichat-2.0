/**
 * DashboardLayout — Sidebar modular com 3 módulos expansíveis
 * Inspirado em HubSpot, Zendesk, Kommo, Intercom
 *
 * Módulos: Atendimento | CRM | Estatísticas | Configurações
 */
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { useNewConversationNotification } from "@/hooks/useNewConversationNotification";
import {
  BarChart3,
  Bell,
  BellOff,
  Bot,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  FileText,
  Filter,
  FormInput,
  GitBranch,
  Globe,
  HeartPulse,
  History,
  Inbox,
  Instagram,
  Key,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  PanelLeft,
  Phone,
  Settings,
  Shield,
  Sparkles,
  Star,
  Tag,
  Target,
  TrendingUp,
  Users,
  UserCheck,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOGO_URL = "/cashmiles-icon.png";
const MODULES_OPEN_KEY = "cs-modules-open";
const SIDEBAR_OPEN_KEY = "cs-sidebar-open";

const SIDEBAR_BG = [
  "radial-gradient(ellipse 200% 35% at 50% 0%, rgba(0,255,160,0.28) 0%, transparent 50%)",
  "radial-gradient(ellipse 100% 60% at 100% 25%, rgba(0,255,160,0.15) 0%, transparent 55%)",
  "linear-gradient(160deg, #1a2e22 0%, #152519 30%, #0f1e14 60%, #0a1810 100%)",
].join(", ");

// ─── Types ────────────────────────────────────────────────────────────────────

type NavLeaf = {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: "live";
  soon?: boolean;
  sectionHeader?: string; // optional section divider label above this item
};

type NavModule = {
  icon: React.ElementType;
  label: string;
  key: string;
  color: string;        // accent color for the module
  items: NavLeaf[];
};

// ─── Navigation structure ─────────────────────────────────────────────────────

const NAV_MODULES: NavModule[] = [
  {
    icon: Inbox,
    label: "Atendimento",
    key: "atendimento",
    color: "#00e5a0",
    items: [
      // ── WhatsApp ──
      { icon: Inbox,          label: "Caixa de Entrada",     path: "/atendimentos", badge: "live", sectionHeader: "Atendimento via WhatsApp" },
      { icon: MessageCircle,  label: "Todas as Conversas",   path: "/atendimentos?canal=whatsapp" },
      { icon: Megaphone,      label: "Disparos em Massa",    path: "/broadcasts" },
      { icon: Users,          label: "Grupos",               path: "/groups" },
      // ── E-mail ──
      { icon: Mail,           label: "Caixa de Entrada",     path: "/atendimentos?canal=email", soon: true, sectionHeader: "Atendimento via E-mail" },
      { icon: Mail,           label: "Caixa de Saída",       path: "/atendimentos?canal=email&view=saida", soon: true },
      { icon: Mail,           label: "Respondidos",          path: "/atendimentos?canal=email&view=respondidos", soon: true },
      { icon: Mail,           label: "Não Respondidos",      path: "/atendimentos?canal=email&view=nao-respondidos", soon: true },
      // ── Em Breve ──
      { icon: Instagram,      label: "Instagram Direct",     path: "/atendimentos?canal=instagram", soon: true, sectionHeader: "Em Breve" },
      { icon: MessageCircle,  label: "Facebook Messenger",   path: "/atendimentos?canal=facebook", soon: true },
      { icon: Phone,          label: "Telegram",             path: "/atendimentos?canal=telegram", soon: true },
      { icon: Globe,          label: "Chat do Site",         path: "/atendimentos?canal=chat", soon: true },
      { icon: MessageSquare,  label: "SMS",                  path: "/atendimentos?canal=sms", soon: true },
      { icon: Phone,          label: "Voz (VoIP)",           path: "/atendimentos?canal=voz", soon: true },
      { icon: Globe,          label: "LinkedIn",             path: "/atendimentos?canal=linkedin", soon: true },
      { icon: Globe,          label: "TikTok",               path: "/atendimentos?canal=tiktok", soon: true },
      { icon: Globe,          label: "X (Twitter)",          path: "/atendimentos?canal=twitter", soon: true },
    ],
  },
  {
    icon: Briefcase,
    label: "CRM",
    key: "crm",
    color: "#c9a227",
    items: [
      { icon: Users,          label: "Clientes",             path: "/customers" },
      { icon: BookOpen,       label: "Carteiras",            path: "/customers?view=carteiras", soon: true },
      { icon: UserCheck,      label: "Novos Clientes",       path: "/new-clients" },
      { icon: Building2,      label: "Empresas",             path: "/customers?view=empresas", soon: true },
      { icon: Briefcase,      label: "Negócios",             path: "/customers?view=negocios", soon: true },
      { icon: TrendingUp,     label: "Pipeline",             path: "/customers?view=pipeline", soon: true },
      { icon: GitBranch,         label: "Funil Comercial",      path: "/customers?view=funil", soon: true },
      { icon: Target,         label: "Oportunidades",        path: "/customers?view=oportunidades", soon: true },
      { icon: Calendar,       label: "Agenda",               path: "/customers?view=agenda", soon: true },
      { icon: Bell,           label: "Alertas",              path: "/alerts" },
      { icon: CheckSquare,    label: "Tarefas Comerciais",   path: "/tasks" },
      { icon: FormInput,      label: "Formulários",          path: "/forms" },
      { icon: Sparkles,       label: "Campanhas",            path: "/campaigns" },
      { icon: History,        label: "Histórico do Cliente", path: "/customers?view=historico", soon: true },
      { icon: FileText,       label: "Documentos",           path: "/customers?view=docs", soon: true },
      { icon: MessageSquare,  label: "Anotações",            path: "/customers?view=notas", soon: true },
      { icon: Clock,          label: "Timeline",             path: "/customers?view=timeline", soon: true },
    ],
  },
  {
    icon: BarChart3,
    label: "Estatísticas",
    key: "stats",
    color: "#60a5fa",
    items: [
      { icon: LayoutDashboard, label: "Painel",           path: "/" },
      { icon: HeartPulse,      label: "Indicadores",         path: "/indicators/health" },
      { icon: BarChart3,       label: "Produtividade & Métricas", path: "/metrics" },
      { icon: Target,          label: "Metas",               path: "/indicators/health?view=metas", soon: true },
      { icon: Clock,           label: "Tempo Médio",         path: "/indicators/health?view=tma", soon: true },
      { icon: TrendingUp,      label: "Conversões",          path: "/indicators/health?view=conversoes", soon: true },
      { icon: CreditCard,      label: "Receita",             path: "/indicators/health?view=receita", soon: true },
      { icon: Shield,          label: "Auditoria",           path: "/indicators/health?view=auditoria", soon: true },
      { icon: FileText,        label: "Logs",                path: "/indicators/health?view=logs", soon: true },
      { icon: FileText,        label: "Exportações",         path: "/indicators/health?view=exports", soon: true },
    ],
  },
];

const SETTINGS_ITEMS: NavLeaf[] = [
  { icon: Users,        label: "Usuários",          path: "/users" },
  { icon: Shield,       label: "Permissões",        path: "/settings?tab=permissions", soon: true },
  { icon: Zap,          label: "Integrações",       path: "/integrations" },
  { icon: Key,          label: "API",               path: "/settings?tab=api", soon: true },
  { icon: Webhook,      label: "Webhooks",          path: "/settings?tab=webhooks", soon: true },
  { icon: Bot,          label: "IA",                path: "/ia-automation" },
  { icon: Workflow,     label: "Automações",        path: "/ia-automation?view=automacoes", soon: true },
  { icon: CreditCard,   label: "Financeiro",        path: "/settings?tab=financeiro", soon: true },
  { icon: Star,         label: "Assinatura",        path: "/settings?tab=assinatura", soon: true },
  { icon: Settings,     label: "Preferências",      path: "/settings" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchActive(path: string, location: string): boolean {
  const base = path.split("?")[0];
  if (base === "/") return location === "/";
  if (base === "/customers") {
    return ["/customers", "/program-dashboard", "/renewal-calendar"].some(
      (p) => location === p || location.startsWith(p + "/")
    );
  }
  if (base === "/indicators/health") return location.startsWith("/indicators");
  if (base === "/settings") return location === "/settings" || location.startsWith("/settings/");
  return location === base || location.startsWith(base + "/");
}

function moduleHasActive(mod: NavModule, location: string): boolean {
  return mod.items.some(item => matchActive(item.path, location));
}

// ─── Logo bubble ──────────────────────────────────────────────────────────────

function LogoBubble({ size = 36 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}>
      <div className="absolute pointer-events-none" style={{
        inset: -6, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(201,162,39,0.50) 0%, transparent 70%)",
        filter: "blur(8px)",
      }} />
      <div className="absolute inset-0 rounded-full" style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 60%, transparent 100%)",
        border: "1px solid rgba(255,255,255,0.40)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.20), 0 1px 0 rgba(255,255,255,0.30) inset",
        backdropFilter: "blur(8px)",
      }} />
      <img src={LOGO_URL} alt="Cashmiles" style={{
        width: size * 0.68, height: size * 0.68,
        objectFit: "contain", position: "relative", zIndex: 1,
        filter: "drop-shadow(0 2px 6px rgba(201,162,39,0.60))",
      }} />
    </div>
  );
}

// ─── Context ──────────────────────────────────────────────────────────────────

type SidebarCtx = {
  location: string;
  isOpen: boolean;
  openModules: Record<string, boolean>;
  openConvCount: number;
  userRole: string;
  navigate: (path: string) => void;
  closeMobile: () => void;
  toggleModule: (key: string) => void;
  expandAndOpen: (key: string) => void;
  setIsOpen: (v: boolean) => void;
};

// ─── NavLeafBtn ───────────────────────────────────────────────────────────────

function NavLeafBtn({ item, ctx }: { item: NavLeaf; ctx: SidebarCtx }) {
  const active = matchActive(item.path, ctx.location);
  const badgeCount =
    item.badge === "live" && ctx.openConvCount > 0
      ? ctx.openConvCount > 99 ? "99+" : String(ctx.openConvCount)
      : null;

  return (
    <>
      {/* Section header divider */}
      {item.sectionHeader && ctx.isOpen && (
        <div className="nav-section-header">
          <span>{item.sectionHeader}</span>
        </div>
      )}
      <button
        onClick={() => {
          if (item.soon) {
            import("sonner").then(({ toast }) => toast.info("Em breve disponível!"));
            return;
          }
          ctx.navigate(item.path);
          ctx.closeMobile();
        }}
        className={`nav-leaf${active ? " nav-leaf--active" : ""}${item.soon ? " nav-leaf--soon" : ""}`}
        title={!ctx.isOpen ? item.label : undefined}
      >
        {active && <div className="nav-leaf__shine" />}
        <item.icon className="nav-leaf__icon" />
        {ctx.isOpen && (
          <>
            <span className="nav-leaf__label">{item.label}</span>
            {item.soon && <span className="nav-soon-badge">em breve</span>}
            {badgeCount && <span className="nav-badge">{badgeCount}</span>}
          </>
        )}
        {!ctx.isOpen && badgeCount && <span className="nav-dot-badge" />}
      </button>
    </>
  );
}

// ─── NavModuleSection ─────────────────────────────────────────────────────────

function NavModuleSection({ mod, ctx }: { mod: NavModule; ctx: SidebarCtx }) {
  const isExpanded = ctx.openModules[mod.key];
  const hasActive = moduleHasActive(mod, ctx.location);

  // Collapsed sidebar: show only module icon
  if (!ctx.isOpen) {
    return (
      <button
        title={mod.label}
        onClick={() => ctx.expandAndOpen(mod.key)}
        className={`nav-module-icon${hasActive ? " nav-module-icon--active" : ""}`}
        style={{ "--mod-color": mod.color } as React.CSSProperties}
      >
        {hasActive && <div className="nav-leaf__shine" />}
        <mod.icon style={{ width: 18, height: 18 }} />
      </button>
    );
  }

  return (
    <div className="nav-module-wrap">
      {/* Module header */}
      <button
        onClick={() => ctx.toggleModule(mod.key)}
        className={`nav-module-header${hasActive ? " nav-module-header--active" : ""}`}
        style={{ "--mod-color": mod.color } as React.CSSProperties}
      >
        <div className="nav-module-icon-wrap">
          <mod.icon style={{ width: 15, height: 15 }} />
        </div>
        <span className="nav-module-label">{mod.label}</span>
        <ChevronRight className={`nav-module-chevron${isExpanded ? " nav-module-chevron--open" : ""}`} />
      </button>

      {/* Module children with smooth animation */}
      <div className={`nav-module-children${isExpanded ? " nav-module-children--open" : ""}`}>
        <div className="nav-module-children-inner">
          {mod.items.map(item => (
            <NavLeafBtn key={item.path + item.label} item={item} ctx={ctx} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SettingsSection ──────────────────────────────────────────────────────────

function SettingsSection({ ctx }: { ctx: SidebarCtx }) {
  const isExpanded = ctx.openModules["settings"];
  const hasActive = SETTINGS_ITEMS.some(item => matchActive(item.path, ctx.location));

  if (!ctx.isOpen) {
    return (
      <button
        title="Configurações"
        onClick={() => ctx.expandAndOpen("settings")}
        className={`nav-module-icon${hasActive ? " nav-module-icon--active" : ""}`}
        style={{ "--mod-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
      >
        {hasActive && <div className="nav-leaf__shine" />}
        <Settings style={{ width: 18, height: 18 }} />
      </button>
    );
  }

  return (
    <div className="nav-module-wrap">
      <button
        onClick={() => ctx.toggleModule("settings")}
        className={`nav-module-header nav-module-header--settings${hasActive ? " nav-module-header--active" : ""}`}
        style={{ "--mod-color": "rgba(255,255,255,0.45)" } as React.CSSProperties}
      >
        <div className="nav-module-icon-wrap nav-module-icon-wrap--settings">
          <Settings style={{ width: 15, height: 15 }} />
        </div>
        <span className="nav-module-label">Configurações</span>
        <ChevronRight className={`nav-module-chevron${isExpanded ? " nav-module-chevron--open" : ""}`} />
      </button>
      <div className={`nav-module-children${isExpanded ? " nav-module-children--open" : ""}`}>
        <div className="nav-module-children-inner">
          {SETTINGS_ITEMS.map(item => (
            <NavLeafBtn key={item.path + item.label} item={item} ctx={ctx} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SidebarInner ─────────────────────────────────────────────────────────────

function SidebarInner({
  ctx,
  forMobile = false,
  notifEnabled,
  toggleNotif,
  requestPermission,
  user,
  logout,
  setLocation,
}: {
  ctx: SidebarCtx;
  forMobile?: boolean;
  notifEnabled: boolean;
  toggleNotif: () => void;
  requestPermission: () => void;
  user: { name?: string; email?: string } | null;
  logout: () => void;
  setLocation: (path: string) => void;
}) {
  const roleLabels: Record<string, string> = { Admin: "Admin", Manager: "Gerente", Agent: "Atendente" };

  return (
    <div className="flex flex-col h-full relative overflow-hidden"
      style={{ background: SIDEBAR_BG, width: forMobile ? 264 : undefined }}>

      {/* Right edge separator */}
      <div className="absolute top-0 right-0 w-px h-full pointer-events-none z-20" style={{
        background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 80%, transparent)",
      }} />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center" style={{
        minHeight: 60,
        padding: ctx.isOpen ? "12px 14px 12px" : "12px 0 12px",
        justifyContent: ctx.isOpen ? "flex-start" : "center",
        gap: ctx.isOpen ? 10 : 0,
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}>
        <LogoBubble size={34} />
        {ctx.isOpen && (
          <div className="flex-1 min-w-0">
            <span className="font-black block leading-none" style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: "17px",
              letterSpacing: "-0.04em", color: "#fff",
            }}>Cashmiles</span>
            <span className="block mt-0.5" style={{
              fontSize: "8.5px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.18em", color: "rgba(232,197,71,0.85)",
            }}>Sucesso do Cliente</span>
          </div>
        )}
        {!forMobile && (
          <button
            onClick={() => ctx.setIsOpen(!ctx.isOpen)}
            className="nav-toggle-btn"
            title={ctx.isOpen ? "Fechar menu" : "Abrir menu"}
          >
            <PanelLeft style={{
              width: 13, height: 13,
              transform: ctx.isOpen ? "none" : "rotate(180deg)",
              transition: "transform 0.3s",
            }} />
          </button>
        )}
      </div>

      {/* ── Nav modules ── */}
      <div className="flex-1 overflow-y-auto relative z-10 nav-scroll"
        style={{ padding: ctx.isOpen ? "10px 10px" : "10px 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: ctx.isOpen ? "2px" : "4px" }}>
          {NAV_MODULES.map(mod => (
            <NavModuleSection key={mod.key} mod={mod} ctx={ctx} />
          ))}
        </div>

        {/* Divider before settings */}
        <div style={{
          margin: ctx.isOpen ? "10px 4px" : "10px 8px",
          height: "1px",
          background: "rgba(255,255,255,0.07)",
        }} />

        {/* Settings */}
        <SettingsSection ctx={ctx} />
      </div>

      {/* ── Footer ── */}
      <div className="relative z-10 px-2 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        {ctx.isOpen && (
          <button
            onClick={() => { toggleNotif(); if (!notifEnabled) requestPermission(); }}
            className="nav-notif-btn"
            style={{ color: notifEnabled ? "rgba(201,162,39,0.85)" : "rgba(255,255,255,0.28)" }}
          >
            {notifEnabled
              ? <Bell style={{ width: 13, height: 13 }} />
              : <BellOff style={{ width: 13, height: 13 }} />}
            <span>{notifEnabled ? "Notificações ativas" : "Notificações desativadas"}</span>
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="nav-user-btn"
              style={{
                padding: ctx.isOpen ? "8px 10px" : "8px 0",
                justifyContent: ctx.isOpen ? "flex-start" : "center",
              }}
              title={ctx.isOpen ? undefined : (user?.name ?? "Usuário")}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs font-black" style={{
                  background: "linear-gradient(135deg,#8B6914,#C9A227,#E8C547)",
                  color: "#0D2010",
                }}>
                  {user?.name?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              {ctx.isOpen && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11.5px] font-semibold truncate leading-none"
                        style={{ color: "rgba(255,255,255,0.95)" }}>
                        {user?.name || "Usuário"}
                      </p>
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0"
                        style={{ background: "rgba(201,162,39,0.18)", color: "rgba(201,162,39,0.90)", border: "1px solid rgba(201,162,39,0.30)" }}>
                        {roleLabels[ctx.userRole] ?? ctx.userRole}
                      </span>
                    </div>
                    <p className="text-[10px] truncate mt-0.5"
                      style={{ color: "rgba(255,255,255,0.35)" }}>
                      {user?.email ?? ""}
                    </p>
                  </div>
                  <ChevronDown style={{ width: 13, height: 13, flexShrink: 0, color: "rgba(255,255,255,0.35)" }} />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="font-medium text-sm">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLocation("/settings")}>
              <Settings className="mr-2 h-4 w-4" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4 relative">
      <div className="login-card flex flex-col items-center gap-7 p-10 max-w-sm w-full relative z-10">
        <div className="flex flex-col items-center gap-4">
          <LogoBubble size={80} />
          <div className="text-center">
            <h1 className="font-black block leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "32px", letterSpacing: "-0.04em", color: "#0D2010" }}>
              Cashmiles
            </h1>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] mt-1.5"
              style={{ color: "rgba(139,105,20,0.70)" }}>
              Sucesso do Cliente
            </p>
          </div>
        </div>
        <div className="divider-premium w-full" />
        <Button
          onClick={() => { window.location.href = getLoginUrl(); }}
          size="lg"
          className="w-full font-bold text-sm tracking-wide btn-gold"
          style={{ height: "46px", fontSize: "14px", borderRadius: "12px" }}
        >
          Entrar na plataforma
        </Button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <LoginScreen />;
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

// ─── Content (stateful shell) ─────────────────────────────────────────────────

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const userRole = (user as any)?.role ?? "Agent";

  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(SIDEBAR_OPEN_KEY) ?? "true") as boolean; }
    catch { return true; }
  });
  useEffect(() => { localStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(isOpen)); }, [isOpen]);

  const [mobileOpen, setMobileOpen] = useState(false);

  // Determine which module is active based on current route
  const getDefaultOpenModules = (loc: string) => {
    const result: Record<string, boolean> = { atendimento: false, crm: false, stats: false, settings: false };
    for (const mod of NAV_MODULES) {
      if (moduleHasActive(mod, loc)) { result[mod.key] = true; break; }
    }
    if (SETTINGS_ITEMS.some(item => matchActive(item.path, loc))) result["settings"] = true;
    return result;
  };

  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(MODULES_OPEN_KEY);
      if (saved) return JSON.parse(saved) as Record<string, boolean>;
    } catch {}
    return getDefaultOpenModules(location);
  });

  // Auto-expand module on navigation
  const prevLocation = useRef(location);
  useEffect(() => {
    if (prevLocation.current === location) return;
    prevLocation.current = location;
    setOpenModules(prev => {
      const next = { ...prev };
      let changed = false;
      for (const mod of NAV_MODULES) {
        if (moduleHasActive(mod, location) && !next[mod.key]) { next[mod.key] = true; changed = true; }
      }
      if (SETTINGS_ITEMS.some(item => matchActive(item.path, location)) && !next["settings"]) {
        next["settings"] = true; changed = true;
      }
      return changed ? next : prev;
    });
  }, [location]);

  useEffect(() => { localStorage.setItem(MODULES_OPEN_KEY, JSON.stringify(openModules)); }, [openModules]);

  const { data: convData } = trpc.conversations.list.useQuery(
    { status: "Aberto", page: 1, limit: 1 },
    { refetchInterval: 30_000 }
  );
  const openConvCount = convData?.total ?? 0;

  const { enabled: notifEnabled, toggle: toggleNotif, requestPermission } = useNewConversationNotification();

  const ctx: SidebarCtx = {
    location,
    isOpen,
    openModules,
    openConvCount,
    userRole,
    navigate: setLocation,
    closeMobile: () => { if (isMobile) setMobileOpen(false); },
    toggleModule: (key) => setOpenModules(prev => ({ ...prev, [key]: !prev[key] })),
    expandAndOpen: (key) => { setIsOpen(true); setOpenModules(prev => ({ ...prev, [key]: true })); },
    setIsOpen,
  };

  const sidebarProps = {
    ctx,
    notifEnabled,
    toggleNotif,
    requestPermission,
    user: user ? { name: user.name ?? undefined, email: user.email ?? undefined } : null,
    logout,
    setLocation,
  };

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="flex h-14 items-center gap-3 px-4 sticky top-0 z-40" style={{
          background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}>
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg" style={{ color: "#0a3d1f" }}>
            <Menu style={{ width: 20, height: 20 }} />
          </button>
          <LogoBubble size={30} />
          <span className="font-bold text-sm" style={{ color: "#0D4020", fontFamily: "'Space Grotesk',sans-serif" }}>
            Cashmiles Sucesso do Cliente
          </span>
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="relative h-full overflow-hidden shadow-2xl">
              <SidebarInner {...sidebarProps} forMobile />
            </div>
          </div>
        )}
        <main className="flex-1 page-bg">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <div
        className="flex flex-col shrink-0 relative transition-all duration-300 ease-in-out"
        style={{ width: isOpen ? 248 : 64 }}
      >
        <div className="absolute inset-0">
          <SidebarInner {...sidebarProps} />
        </div>
      </div>
      <main className="flex-1 min-h-screen page-bg overflow-auto">{children}</main>
    </div>
  );
}
