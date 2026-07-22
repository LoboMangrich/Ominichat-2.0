import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";

export type SubTab = {
  label: string;
  path: string;
  icon?: LucideIcon;
};

export function SubTabBar({ tabs }: { tabs: SubTab[] }) {
  const [location, setLocation] = useLocation();

  function isActive(path: string) {
    if (path === "/customers") return location === "/customers";
    if (path === "/ia-automation") return location === "/ia-automation" || location === "/ia-automation/";
    return location === path || location.startsWith(path + "/");
  }

  return (
    <div
      style={{
        background: "hsl(var(--background))",
        borderBottom: "1px solid hsl(var(--border))",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        position: "sticky",
        top: 0,
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "8px 24px 0 24px",
          overflowX: "auto",
        }}
      >
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              onClick={() => setLocation(tab.path)}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.95 0.02 155)";
                  (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.25 0.08 155)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.50 0.04 155)";
                }
              }}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "9px 18px 11px 18px",
                borderRadius: "8px 8px 0 0",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "all 0.15s ease",
                fontFamily: "inherit",
                fontSize: "13.5px",
                fontWeight: active ? 700 : 500,
                letterSpacing: active ? "0.01em" : "0",
                background: active ? "oklch(0.22 0.08 155)" : "transparent",
                color: active ? "#ffffff" : "oklch(0.50 0.04 155)",
                boxShadow: active ? "0 2px 8px rgba(0,80,40,0.18)" : "none",
              }}
            >
              {Icon && (
                <Icon
                  style={{
                    width: 15,
                    height: 15,
                    flexShrink: 0,
                    color: active ? "#C9A227" : "currentColor",
                    filter: active ? "drop-shadow(0 0 3px rgba(201,162,39,0.5))" : "none",
                  }}
                />
              )}
              <span>{tab.label}</span>

              {/* Golden underline for active tab */}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "12px",
                    right: "12px",
                    height: "3px",
                    background: "linear-gradient(90deg, #C9A227, #E8C547)",
                    borderRadius: "3px 3px 0 0",
                    boxShadow: "0 0 6px rgba(201,162,39,0.6)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
