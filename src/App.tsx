import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminNotFound from "@/pages/admin/AdminNotFound";
import AdminContactSubmissions from "@/pages/admin/AdminContactSubmissions";
import AdminProviders from "@/pages/admin/AdminProviders";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminTransactions from "@/pages/admin/AdminTransactions";
import AdminUsers from "@/pages/admin/AdminUsers";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes>
                <Route path="/" element={<Navigate to="/admin" replace />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="providers" element={<AdminProviders />} />
                  <Route path="transactions" element={<AdminTransactions />} />
                  <Route path="contact-submissions" element={<AdminContactSubmissions />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
                <Route path="*" element={<AdminNotFound />} />
              </Routes>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
