/**
 * /employee/products/new · /employee/products/:productId/edit
 *
 * Employees holding `products.manage` use the same create/edit workspace
 * as Super Admin and Admin. Publishing stays with managers and admins.
 */

import { Navigate, useParams } from "react-router-dom";
import EmployeePage from "../../components/employee/EmployeePage";
import ProductCreateWorkspace, {
  productCreateDescription,
  productCreateTitle,
  useProductCreateFlow,
} from "../../components/products/ProductCreateWorkspace";
import { PERMISSIONS } from "../../config/employeePermissions";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";

export default function EmployeeProductForm() {
  const { productId } = useParams();
  const { employee, hasPermission } = useEmployeeAuth();
  const useQuick = useProductCreateFlow(productId);

  if (!hasPermission(PERMISSIONS.PRODUCTS_MANAGE)) {
    return <Navigate to="/employee/access-denied" replace />;
  }

  const actor = employee
    ? {
        employeeId: employee.employeeId,
        label: `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
      }
    : null;

  return (
    <EmployeePage
      eyebrow="Business / Products"
      title={productCreateTitle(productId, useQuick)}
      description={productCreateDescription(useQuick)}
    >
      <ProductCreateWorkspace
        productId={productId}
        portal="employee"
        actor={actor}
        canPublish={false}
        exitTo="/employee/products"
      />
    </EmployeePage>
  );
}
