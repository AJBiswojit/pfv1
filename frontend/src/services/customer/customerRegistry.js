/**
 * PRATIKSHYA FASHON — Customer registry (deprecated shim).
 *
 * Customers are backend-owned (GET /admin/customers, /customers/me). This
 * module is kept only so legacy consumers do not crash mid-migration; it
 * contains no demo customers and no localStorage register. Consumers should
 * use `services/api/customersApi.js` directly.
 */

export const CUSTOMERS_REGISTRY_KEY = "pratikshya_customers_registry"; // legacy — unused
export const LEGACY_CUSTOMERS_KEY = "pratikshya_customers"; // legacy — unused

export const loadCustomerRegistry = () => [];
export const saveCustomerRegistry = () => [];
export const findCustomer = () => null;

export default { loadCustomerRegistry, saveCustomerRegistry, findCustomer };
