import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { PinSetup } from "./pages/kiosk/PinSetup";
import { KioskPage } from "./pages/kiosk";
import { LoginPage } from "./pages/admin/Login";
import { Dashboard } from "./pages/admin/Dashboard";
import { EmployeesPage } from "./pages/admin/Employees";
import { ReportsPage } from "./pages/admin/Reports";
import { LateReasonsPage } from "./pages/admin/LateReasons";

type AdminRoute = "dashboard" | "employees" | "reports" | "late-reasons";

function isAdminPath() {
  return window.location.pathname.startsWith("/admin");
}

export default function App() {
  const [kioskReady, setKioskReady]   = useState(!!localStorage.getItem("ds_location_id"));
  const [session, setSession]         = useState<Session | null>(null);
  const [adminRoute, setAdminRoute]   = useState<AdminRoute>("dashboard");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isAdminPath()) { setAuthChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Admin routes
  if (isAdminPath()) {
    if (!authChecked) return <Spinner />;
    if (!session) return <LoginPage onLogin={(s) => setSession(s)} />;

    const locationId = (session.user.user_metadata?.location_id ?? "") as string;

    return (
      <AdminShell route={adminRoute} onRoute={setAdminRoute} onLogout={() => supabase.auth.signOut()}>
        {adminRoute === "dashboard"    && <Dashboard locationId={locationId} />}
        {adminRoute === "employees"    && <EmployeesPage locationId={locationId} />}
        {adminRoute === "reports"      && <ReportsPage locationId={locationId} />}
        {adminRoute === "late-reasons" && <LateReasonsPage locationId={locationId} />}
      </AdminShell>
    );
  }

  // Kiosk
  if (!kioskReady) return <PinSetup onSetup={() => setKioskReady(true)} />;
  return <KioskPage />;
}

function Spinner() {
  return (
    <div className="min-h-screen bg-ds-dark flex items-center justify-center">
      <div className="w-16 h-16 rounded-full border-4 border-brand border-t-transparent animate-spin" />
    </div>
  );
}

function AdminShell({
  children, route, onRoute, onLogout,
}: {
  children: React.ReactNode;
  route: AdminRoute;
  onRoute: (r: AdminRoute) => void;
  onLogout: () => void;
}) {
  const navItems: { id: AdminRoute; label: string; emoji: string }[] = [
    { id: "dashboard",    label: "ផ្ទាំងគ្រប់គ្រង", emoji: "📊" },
    { id: "employees",    label: "បុគ្គលិក",          emoji: "👥" },
    { id: "reports",      label: "របាយការណ៍",         emoji: "📋" },
    { id: "late-reasons", label: "មូលហេតុយឺត",       emoji: "🎙" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ds-dark text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🦐</span>
          <span className="font-bold text-lg" style={{ fontFamily: "Georgia, serif" }}>Den Samot</span>
        </div>
        <nav className="flex gap-1">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => onRoute(n.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-khmer transition-colors ${
                route === n.id ? "bg-brand text-white" : "text-brand-light hover:bg-white/10"
              }`}
            >
              {n.emoji} {n.label}
            </button>
          ))}
        </nav>
        <button onClick={onLogout} className="text-brand-light/60 hover:text-white text-sm font-khmer">
          ចាកចេញ
        </button>
      </header>
      <main className="flex-1 bg-background p-6">{children}</main>
    </div>
  );
}
