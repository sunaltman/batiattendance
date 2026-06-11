import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ScanPage from "@/pages/scan";
import DashboardPage from "@/pages/dashboard";
import EmployeesPage from "@/pages/employees";
import LeavePage from "@/pages/leave";
import ImportPage from "@/pages/import";
import FinancePage from "@/pages/finance";

const queryClient = new QueryClient();

// Keep to 5 items max for mobile nav — Import moved off nav (still accessible via URL)
const NAV_LINKS = [
  { href: "/scan",      label: "ស្កែន",    icon: "📷" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/leave",     label: "ច្បាប់",   icon: "📋" },
  { href: "/finance",   label: "ប្រាក់",   icon: "💰" },
  { href: "/employees", label: "បុគ្គលិក", icon: "👥" },
];

function NavBar() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 4px)" }}
    >
      <div className="flex">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[52px] transition-colors font-khmer text-xs gap-0.5 ${
                active ? "text-blue-600 bg-blue-50" : "text-gray-500"
              }`}
            >
              <span className="text-lg leading-none">{icon}</span>
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
        <div className="font-khmer text-gray-600">ទំព័រមិនមាន</div>
        <Link href="/scan" className="mt-4 inline-block text-blue-600 underline font-khmer">ត្រឡប់ទៅ</Link>
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
          <Route path="/" component={() => { window.location.replace("/scan"); return null; }} />
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
    <QueryClientProvider client={queryClient}>
      {/* No base prop — use root-relative paths so iOS standalone routing works correctly */}
      <WouterRouter>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
