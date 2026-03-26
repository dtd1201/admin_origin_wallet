import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/providers", label: "Providers", icon: Building2 },
  { to: "/admin/transactions", label: "Transactions", icon: ArrowRightLeft },
  { to: "/admin/contact-submissions", label: "Contacts", icon: Inbox },
  { to: "/admin/settings", label: "Session", icon: Settings },
];

const AdminLayout = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const displayName = user?.full_name || user?.email?.split("@")[0] || "Administrator";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/admin/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [loading, location.pathname, navigate, user]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08131e]">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#08131e] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-b border-white/10 bg-[#071018] lg:block lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15">
              <img src="/logo/knt-logo.svg" alt="Origin Wallet Admin" className="h-7 w-auto brightness-0 invert" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-emerald-300/70">Control Center</div>
              <div className="text-lg font-semibold">Origin Wallet Admin</div>
            </div>
          </div>

          <div className="space-y-8 p-4">
            <nav className="space-y-1.5">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin"}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                      isActive
                        ? "bg-emerald-400 text-slate-950 shadow-[0_12px_30px_rgba(52,211,153,0.28)]"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="rounded-[28px] border border-emerald-300/15 bg-gradient-to-br from-emerald-400/12 via-transparent to-cyan-400/10 p-5">
              <div className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                Admin access
              </div>
              <h2 className="mt-4 text-xl font-semibold">Dedicated admin frontend</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                A separate workspace for operations, with protected access and tools focused on users, providers, and transaction review.
              </p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_22%),linear-gradient(180deg,#08131e_0%,#0b1724_34%,#eef4f2_34%,#eef4f2_100%)]">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#08131e]/90 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/75">Operations</p>
                <h1 className="mt-1 text-2xl font-semibold text-white">Admin Workspace</h1>
              </div>

              <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white lg:hidden"
                  onClick={() => setMobileNavOpen((current) => !current)}
                >
                  {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                  Menu
                </Button>

                <Button
                  asChild
                  className="hidden rounded-full bg-emerald-400 px-5 font-semibold text-slate-950 hover:bg-emerald-300 sm:inline-flex"
                >
                  <Link to="/admin/users">Review users</Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-left text-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 font-semibold text-slate-950">
                        {initials || "AD"}
                      </div>
                      <div className="hidden sm:block">
                        <div className="font-semibold text-white">{displayName}</div>
                        <div className="text-xs text-slate-400">{user.email}</div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-300" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-72 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900"
                  >
                    <div className="px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Signed in</div>
                      <div className="mt-2 font-semibold">{displayName}</div>
                      <div className="text-sm text-slate-500">{user.email}</div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="cursor-pointer px-4 py-3">
                      <Link to="/admin/settings">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Session details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer px-4 py-3"
                      onClick={async () => {
                        await logout();
                        navigate("/admin/login", { replace: true });
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {mobileNavOpen && (
              <div className="border-t border-white/10 bg-[#071018] px-4 py-4 sm:px-6 lg:hidden">
                <nav className="space-y-2">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/admin"}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                          isActive
                            ? "bg-emerald-400 text-slate-950 shadow-[0_12px_30px_rgba(52,211,153,0.28)]"
                            : "text-slate-300 hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </NavLink>
                  ))}
                </nav>

                <div className="mt-4 rounded-[24px] border border-emerald-300/15 bg-gradient-to-br from-emerald-400/12 via-transparent to-cyan-400/10 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-emerald-200">Admin access</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Manage users, providers, transactions, and contact submissions from the mobile admin workspace.
                  </p>
                </div>
              </div>
            )}
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
