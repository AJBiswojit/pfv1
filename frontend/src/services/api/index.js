/**
 * PRATIKSHYA FASHON — API services barrel export
 *
 * Import any API function from this single entry point:
 *   import { apiListProducts, apiGetCart, apiPlaceOrder } from "../services/api"
 */

// Base client + token utilities
export * from "./apiClient";

// Domain API modules
export * from "./authApi";
export * from "./customersApi";
export * from "./productsApi";
export * from "./categoriesApi";
export * from "./collectionsApi";
export * from "./cartApi";
export * from "./ordersApi";
export * from "./searchApi";
export * from "./employeesApi";
export * from "./wishlistApi";
export * from "./paymentsApi";
export * from "./offersApi";
export * from "./mediaApi";
export * from "./inventoryApi";
export * from "./adminApi";
