import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ScanPage from "@/pages/scan";
import DashboardPage from "@/pages/dashboard";
import EmployeesPage from "@/pages/employees";
import LeavePage from "@/pages/leave";

const queryClient = new QueryClient();

function NavBar() {
  const [location] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const links = [
    { href: "/scan", label: "ស្កែន", icon: "📷" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/leave", label: "ច្បាប់", icon: "📋" },
    { href: "/employees", label: "បុគ្គលិក", icon: "👥" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 print:hidden">
      <div className="flex">
        {links.map(({ href, label, icon }) => {
          const active = location === href || location === href + "/";
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] transition-colors font-khmer text-xs gap-1 ${
                active ? "text-blue-600 bg-blue-50" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span>{label}</span>
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
      <div className="pb-14">
        <Switch>
          <Route path="/" component={() => { window.location.replace(import.meta.env.BASE_URL + "scan"); return null; }} />
          <Route path="/scan" component={ScanPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/leave" component={LeavePage} />
          <Route path="/employees" component={EmployeesPage} />
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
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
