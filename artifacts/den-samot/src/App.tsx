import { useEffect, useState, Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Toaster } from "sonner";
import { WifiOff, LayoutDashboard, Users, BarChart2, Mic, LogOut } from "lucide-react";
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

// When deployed as the admin-only PWA (separate Vercel project), always show admin.
const ADMIN_ONLY = import.meta.env.VITE_ADMIN_ONLY === "true";

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);
  if (online) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm font-khmer font-semibold flex items-center justify-center gap-2 py-2 px-4">
      <WifiOff size={16} /> គ្មានអ៊ីនធឺណិត — ការស្គែនមិនអាចកត់ត្រាបានទេ
    </div>
  );
}

function isAdminPath() {
  if (ADMIN_ONLY) return true;
  if (window.location.pathname.startsWith("/admin")) {
    localStorage.setItem("ds_pwa_mode", "admin");
    return true;
  }
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return standalone && localStorage.getItem("ds_pwa_mode") === "admin";
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

    const locationId   = (session.user.user_metadata?.location_id ?? "") as string;
    const locationName = (session.user.user_metadata?.location_name ?? locationId) as string;

    return (
      <>
        <OfflineBanner />
        <Toaster position="top-center" richColors toastOptions={{ duration: 3500 }} />
        <AdminShell route={adminRoute} onRoute={setAdminRoute} onLogout={() => supabase.auth.signOut()} locationName={locationName}>
          {adminRoute === "dashboard"    && <Dashboard locationId={locationId} />}
          {adminRoute === "employees"    && <EmployeesPage locationId={locationId} />}
          {adminRoute === "reports"      && <ReportsPage locationId={locationId} />}
          {adminRoute === "late-reasons" && <LateReasonsPage locationId={locationId} />}
        </AdminShell>
      </>
    );
  }

  // Kiosk
  if (!kioskReady) return <PinSetup onSetup={() => setKioskReady(true)} />;
  return <KioskPage />;
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(145deg, #0C1B2E 0%, #152840 50%, #0E1F35 100%)" }}>
      <div className="w-16 h-16 rounded-full border-4 border-brand border-t-transparent animate-spin" />
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error("App crash:", e, info); }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-white">
          <p className="text-red-600 font-bold text-lg">កំហុស / Error</p>
          <pre className="text-xs bg-red-50 border border-red-200 rounded p-4 max-w-xl w-full whitespace-pre-wrap break-all">{msg}</pre>
          <button onClick={() => this.setState({ error: null })} className="text-sm text-brand underline">ព្យាយាមម្ដងទៀត / Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS: { id: AdminRoute; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: "dashboard",    label: "ផ្ទាំង",    Icon: LayoutDashboard },
  { id: "employees",    label: "បុគ្គលិក",  Icon: Users },
  { id: "reports",      label: "របាយការណ៍", Icon: BarChart2 },
  { id: "late-reasons", label: "យឺត/បន្លំ", Icon: Mic },
];

function AdminShell({
  children, route, onRoute, onLogout, locationName,
}: {
  children: React.ReactNode;
  route: AdminRoute;
  onRoute: (r: AdminRoute) => void;
  onLogout: () => void;
  locationName?: string;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Thin white top bar — logo + location + logout (same feel as Bati) */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Den Samot" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
          <div>
            <p className="font-bold text-sm text-gray-900 leading-none" style={{ fontFamily: "Georgia, serif" }}>Den Samot</p>
            {locationName && <p className="font-khmer text-xs text-gray-400 leading-tight mt-0.5">{locationName}</p>}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-xs transition-colors min-h-[44px] px-2"
        >
          <LogOut size={14} />
          <span className="font-khmer">ចាកចេញ</span>
        </button>
      </header>

      {/* Page content — padded for bottom nav + iOS home indicator */}
      <main
        className="p-4 md:p-6"
        style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 4px))" }}
      >
        {children}
      </main>

      {/* Fixed bottom nav — same structure as Bati */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 4px)" }}
      >
        <div className="flex max-w-2xl mx-auto">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = route === id;
            return (
              <button
                key={id}
                onClick={() => onRoute(id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] gap-0.5 text-xs transition-colors font-khmer ${
                  active ? "text-brand-dark bg-brand-xlight" : "text-gray-500"
                }`}
              >
                <Icon size={18} />
                <span className="leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
