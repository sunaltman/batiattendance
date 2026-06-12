import { Component, useEffect, useState, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Link, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QrCode, LayoutDashboard, Calendar, DollarSign, Users, WifiOff, type LucideIcon } from "lucide-react";
import { Toaster } from "sonner";
import ScanPage from "@/pages/scan";
import DashboardPage from "@/pages/dashboard";
import EmployeesPage from "@/pages/employees";
import LeavePage from "@/pages/leave";
import ImportPage from "@/pages/import";
import FinancePage from "@/pages/finance";

const queryClient = new QueryClient();

// Keep to 5 items max for mobile nav — Import moved off nav (still accessible via URL)
const NAV_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/scan",      label: "ស្កែន",              Icon: QrCode },
  { href: "/dashboard", label: "ផ្ទាំងគ្រប់គ្រង",   Icon: LayoutDashboard },
  { href: "/leave",     label: "ច្បាប់ឈប់",          Icon: Calendar },
  { href: "/finance",   label: "ប្រាក់បៀវត្សរ៍",    Icon: DollarSign },
  { href: "/employees", label: "បុគ្គលិក",           Icon: Users },
];

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
          <div className="text-lg font-bold text-gray-800 mb-2">មានបញ្ហាអ្វីមួយខុសប្រក្រតី</div>
          <div className="text-sm text-gray-500 mb-6 font-mono break-all max-w-sm">
            {(this.state.error as Error).message}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#5E8B73] text-white px-6 py-3 rounded-xl font-semibold"
          >
            ផ្ទុកឡើងវិញ
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// The app requires internet (attendance only records after the Telegram
// audit photo posts) — surface connectivity loss before scans start failing.
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  if (online) return null;
  return (
    <div role="alert"
      className="fixed top-0 left-0 right-0 z-[60] bg-red-600 text-white text-sm font-khmer font-semibold flex items-center justify-center gap-2 py-2 px-4 print:hidden"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}>
      <WifiOff size={16} /> គ្មានអ៊ីនធឺណិត — ការស្កែនមិនអាចកត់ត្រាបានទេ
    </div>
  );
}

function NavBar() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 4px)" }}
    >
      <div className="flex max-w-2xl mx-auto">
        {NAV_LINKS.map(({ href, label, Icon }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors text-xs gap-0.5 ${
                active ? "text-[#3D6B55] bg-[#EBF5EF]" : "text-gray-500"
              }`}
            >
              <Icon size={18} />
              <span className="leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-6xl mb-4">404</div>
        <div className="text-gray-600">រកមិនឃើញទំព័រទេ</div>
        <Link href="/scan" className="mt-4 inline-block text-blue-600 underline">ត្រឡប់ក្រោយ</Link>
      </div>
    </div>
  );
}

function Router() {
  return (
    <>
      {/* Bottom padding = nav height + iOS home indicator */}
      <div style={{ paddingBottom: "calc(52px + env(safe-area-inset-bottom, 4px))" }}>
        <Switch>
          <Route path="/">
            <Redirect to="/scan" />
          </Route>
          <Route path="/scan"      component={ScanPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/employees" component={EmployeesPage} />
          <Route path="/leave"     component={LeavePage} />
          <Route path="/finance"   component={FinancePage} />
          <Route path="/import"    component={ImportPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <NavBar />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WouterRouter>
          <OfflineBanner />
          <Router />
        </WouterRouter>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ duration: 3500 }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
