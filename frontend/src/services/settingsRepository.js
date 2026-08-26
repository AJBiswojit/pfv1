/**
 * PRATIKSHYA FASHON — Settings repository (backend-driven).
 *
 * Settings are server-owned (GET/PATCH /admin/settings/{section}). The
 * defaults below are UI configuration used only to shape forms when the
 * server has not published a value; the backend result is authoritative.
 */

import { apiClient } from "./api/apiClient";
import { COMMERCE_DEFAULTS } from "../config/commerceDefaults";

export const SETTINGS_KEY = "pratikshya_settings"; // legacy — unused

export const SETTINGS_DEFAULTS = {
  business: { name: "PRATIKSHYA FASHON", legalName: "", tagline: "", description: "", email: "", phone: "", website: "", address: "", city: "", state: "", country: "India", postalCode: "", logoMediaId: "", faviconMediaId: "" },
  store: { name: "PRATIKSHYA FASHON", code: "PF-01", address: "", phone: "", email: "", status: "ACTIVE", openingTime: "09:30", closingTime: "18:30" },
  locations: { warehouseName: "", warehouseCode: "", warehouseAddress: "", warehouseStatus: "ACTIVE", warehouseOpeningTime: "09:30", warehouseClosingTime: "18:30", contactPerson: "", contactPhone: "" },
  hours: { days: [{ day: "Monday", open: "09:30", close: "18:30", active: true }, { day: "Tuesday", open: "09:30", close: "18:30", active: true }, { day: "Wednesday", open: "09:30", close: "18:30", active: true }, { day: "Thursday", open: "09:30", close: "18:30", active: true }, { day: "Friday", open: "09:30", close: "18:30", active: true }, { day: "Saturday", open: "09:30", close: "18:30", active: true }, { day: "Sunday", open: "09:30", close: "18:30", active: false }] },
  attendance: { workingStartTime: "09:30", workingEndTime: "18:30", lateThresholdMinutes: 10, minimumHalfDayMinutes: 240, fullDayMinutes: 540 },
  holidays: { items: [] },
  tax: { enabled: false, gstin: "", defaultRate: 0, cgst: 0, sgst: 0, igst: 0, mode: "EXCLUSIVE" },
  shipping: { enabled: true, defaultShippingFee: COMMERCE_DEFAULTS.defaultShippingFee, freeShippingThreshold: COMMERCE_DEFAULTS.freeShippingThreshold, expressDeliveryFee: COMMERCE_DEFAULTS.expressDeliveryFee, carriers: ["Delhivery", "Blue Dart", "DTDC", "India Post", "Store Delivery"], defaultCarrier: "Delhivery", estimatedDeliveryDays: 5 },
  payments: { refundMethod: "Original payment method", refundSla: "5–7 business days", partialRefundEnabled: true, codFee: COMMERCE_DEFAULTS.codFee },
  orders: { allowCancellation: true, cancellationWindowHours: 24, allowOrderEditing: false, autoExpiryHours: 24, paymentTimeoutMinutes: 15 },
  returns: { enabled: true, returnWindowDays: 7, exchangeEnabled: true, refundEnabled: true, pickupEnabled: true, inspectionRequired: true, restockingRule: "Inspect before restocking" },
  inventory: { defaultLowStockThreshold: 5, defaultReorderThreshold: 10, negativeStockAllowed: false, lowStockAlerts: true, outOfStockAlerts: true, overstockAlerts: false },
  employees: { idPrefix: "PF", defaultLocation: "", defaultDepartment: "", defaultRole: "", minimumPasswordLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialCharacter: false, passwordExpiryDays: 30, inactiveBehavior: "Block sign in" },
  notifications: { order: ["IN_APP"], returns: ["IN_APP"], employee: ["IN_APP"], lowStock: ["IN_APP"], offers: ["IN_APP"], marketing: [] },
  customer: { supportPhone: "", supportEmail: "", returnPolicyReference: "", shippingInformation: "", businessHoursReference: "" },
  offers: { defaultDurationDays: 7, maximumCouponDiscount: 10000, defaultCustomerUsageLimit: 1, allowStacking: false },
  media: { maximumImageSizeMb: 10, maximumVideoSizeMb: 100, allowedImageFormats: "jpg,jpeg,png,webp,avif", allowedVideoFormats: "mp4,webm" },
};

const merge = (base, incoming) => Object.fromEntries(
  Object.entries(base).map(([key, value]) => [
    key,
    value && typeof value === "object" && !Array.isArray(value)
      ? merge(value, incoming?.[key])
      : incoming?.[key] ?? value,
  ])
);

const clone = (value) => JSON.parse(JSON.stringify(value));

let memorySettings = null;

const applyDefaults = (server) => merge(clone(SETTINGS_DEFAULTS), server ?? {});

/** GET /admin/settings (all sections, deep-merged with UI defaults). */
export async function getSettings() {
  try {
    const data = await apiClient.get("/admin/settings");
    const values = applyDefaults(data.settings ?? data);
    memorySettings = values;
    return values;
  } catch {
    return clone(memorySettings ?? SETTINGS_DEFAULTS);
  }
}

/** GET /admin/settings/{section} */
export async function getSection(section) {
  if (!SETTINGS_DEFAULTS[section]) return null;
  try {
    const data = await apiClient.get(`/admin/settings/${section}`);
    return merge(clone(SETTINGS_DEFAULTS[section]), data.settings ?? data[section] ?? data);
  } catch {
    return clone(SETTINGS_DEFAULTS[section]);
  }
}

/** PATCH /admin/settings/{section} */
export async function updateSection(section, values) {
  if (!SETTINGS_DEFAULTS[section]) throw new Error("Unknown settings section");
  const data = await apiClient.patch(`/admin/settings/${section}`, values);
  return merge(clone(SETTINGS_DEFAULTS[section]), data.settings ?? data[section] ?? values);
}

export async function updateSetting(section, key, value) {
  return updateSection(section, { [key]: value });
}

/** POST /admin/settings/{section}/reset */
export async function resetSection(section) {
  try {
    await apiClient.post(`/admin/settings/${section}/reset`, {});
  } catch { /* best-effort */ }
  return clone(SETTINGS_DEFAULTS[section]);
}

/** POST /admin/settings/reset */
export async function resetToDefaults() {
  try {
    await apiClient.post("/admin/settings/reset", {});
  } catch { /* best-effort */ }
  return clone(SETTINGS_DEFAULTS);
}

export default { getSettings, getSection, updateSection, updateSetting, resetSection, resetToDefaults };
