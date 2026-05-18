import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import PendingReview from "./pages/PendingReview";
import ControlledMedicines from "./pages/ControlledMedicines";
import DeadStock from "./pages/DeadStock";
import Expenses from "./pages/Expenses";
import Returns from "./pages/Returns";
import Suppliers from "./pages/Suppliers";
import SupplierBalances from "./pages/SupplierBalances";
import Reconciliation from "./pages/Reconciliation";
import Reports from "./pages/Reports";
import OperationsLog from "./pages/OperationsLog";
import UsersPermissions from "./pages/UsersPermissions";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/pending-review" element={<PendingReview />} />
          <Route path="/controlled-medicines" element={<ControlledMedicines />} />
          <Route path="/dead-stock" element={<DeadStock />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/supplier-balances" element={<SupplierBalances />} />
          <Route path="/reconciliation" element={<Reconciliation />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/operations-log" element={<OperationsLog />} />
          <Route path="/users" element={<UsersPermissions />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
