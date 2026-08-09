import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminDataProvider } from "@/hooks/useAdminData";
import { RefreshButton } from "@/components/ui/refresh-button";
import { toast } from "sonner";
import { useAdminData } from "@/hooks/useAdminData";

export const Route = createFileRoute("/_admin/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminDataProvider>
      <AdminPageInner />
    </AdminDataProvider>
  );
}

function AdminPageInner() {
  const { load, loadPool } = useAdminData();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Admin Console</h1>
        <RefreshButton onRefresh={async () => { await load(); await loadPool(); toast.success("Admin data updated"); }} />
      </div>
      <Outlet />
    </div>
  );
}
