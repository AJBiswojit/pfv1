/**
 * Test-only principals for the employee-management audit.
 *
 * These are NOT production seeds. Employee/admin truth is backend-owned.
 * The audit needs stable IDs to prove Admin vs Employee boundaries without
 * reintroducing dummy people into `src/data`.
 *
 * No passwords are stored here.
 */

import { PERMISSIONS } from "../../src/config/employeePermissions.js";

export const INITIAL_ADMINS = [
  {
    adminId: "PF-ADM-00001",
    id: "PF-ADM-00001",
    firstName: "House",
    lastName: "Admin",
    email: "admin@pratikshyafashon.in",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  },
];

export const INITIAL_EMPLOYEES = [
  {
    id: "emp-mgr-00008",
    employeeId: "PF-MGR-00008",
    firstName: "Floor",
    lastName: "Manager",
    email: "manager@pratikshyafashon.in",
    phone: "+91 90000 00008",
    role: "STORE_MANAGER",
    department: "MANAGEMENT",
    store: "MAIN_FLOOR",
    joiningDate: "2024-01-01",
    status: "ACTIVE",
    permissionMode: "role",
    permissions: [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_MANAGE,
      PERMISSIONS.DASHBOARD_VIEW,
    ],
  },
  {
    id: "emp-sls-00124",
    employeeId: "PF-SLS-00124",
    firstName: "Sales",
    lastName: "Executive",
    email: "sales@pratikshyafashon.in",
    phone: "+91 90000 00124",
    role: "SALES_EXECUTIVE",
    department: "WOMENS_SAREES",
    store: "MAIN_FLOOR",
    joiningDate: "2024-01-01",
    status: "ACTIVE",
    permissionMode: "role",
    permissions: [PERMISSIONS.PRODUCTS_VIEW, PERMISSIONS.PRODUCTS_MANAGE],
  },
  {
    id: "emp-sls-00118",
    employeeId: "PF-SLS-00118",
    firstName: "Inactive",
    lastName: "Associate",
    email: "inactive@pratikshyafashon.in",
    phone: "+91 90000 00118",
    role: "SALES_EXECUTIVE",
    department: "WOMENS_SAREES",
    store: "MAIN_FLOOR",
    joiningDate: "2024-01-01",
    status: "INACTIVE",
    permissionMode: "role",
    permissions: [PERMISSIONS.PRODUCTS_VIEW],
  },
];
