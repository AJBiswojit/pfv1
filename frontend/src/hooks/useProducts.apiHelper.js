/**
 * Thin re-export so useCatalogueQuery can import apiListProducts without a
 * circular dependency through the main useProducts hook.
 */
export { apiListProducts } from "../services/api/productsApi";
export { apiSearch as apiSearchProducts } from "../services/api/searchApi";
