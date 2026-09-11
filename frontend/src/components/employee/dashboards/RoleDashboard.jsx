import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import { ACCOUNT_LEVELS } from "../../../config/rbacModel";
import { ROLES } from "../../../config/employeeRoles";
import ManagerDashboard from "./ManagerDashboard";
import SalesDashboard from "./SalesDashboard";
import InventoryDashboard from "./InventoryDashboard";
import WarehouseDashboard from "./WarehouseDashboard";
import SupportDashboard from "./SupportDashboard";
import StylistDashboard from "./StylistDashboard";
import DashboardFrame from "./DashboardFrame";

export default function RoleDashboard() {
  const { employee } = useEmployeeAuth();
  const role = employee?.role;

  /* Account level wins over business role: Super Employee is not a sales
     desk, even when no STORE_MANAGER role was attached at create time. */
  if (employee?.accountLevel === ACCOUNT_LEVELS.SUPER_EMPLOYEE || role === ROLES.STORE_MANAGER) {
    return <ManagerDashboard />;
  }
  if (role === ROLES.SALES_EXECUTIVE) return <SalesDashboard />;
  if (role === ROLES.INVENTORY_MANAGER || role === ROLES.INVENTORY_STAFF) {
    return <InventoryDashboard />;
  }
  if (role === ROLES.WAREHOUSE_STAFF) return <WarehouseDashboard />;
  if (role === ROLES.CUSTOMER_SUPPORT) return <SupportDashboard />;
  if (role === ROLES.FASHION_STYLIST) return <StylistDashboard />;
  return (
    <DashboardFrame
      description={`${employee?.firstName || "Welcome"}, this is your operations desk.`}
    />
  );
}
