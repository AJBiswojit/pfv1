/**
 * PRATIKSHYA FASHON — Employee password policies (client-side validation).
 *
 * Credentials are backend-owned (POST /auth/employee/sign-in,
 * POST /auth/employee/change-password, admin reset endpoints). This module
 * contains only client-side shape validation for the change-password form —
 * no credential storage, no mock fingerprints, no demo tokens.
 */

export const TEMP_PASSWORD_PATTERN = /^PF@[A-Za-z0-9]{5}$/;

/** Format check for temporary passwords issued by the backend. */
export const isTemporaryPasswordFormat = (value) =>
  typeof value === "string" && TEMP_PASSWORD_PATTERN.test(value);

export const validateEmployeePassword = (password) => {
  if (!password || typeof password !== "string") {
    return { ok: false, message: "Password is required." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  return { ok: true, message: "" };
};

export const validateEmployeePasswordChange = ({
  currentPassword,
  newPassword,
  confirmPassword,
}) => {
  if (!currentPassword) {
    return { ok: false, message: "Current password is required." };
  }
  const next = validateEmployeePassword(newPassword);
  if (!next.ok) return next;
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "New password and confirmation do not match." };
  }
  if (newPassword === currentPassword) {
    return { ok: false, message: "New password must be different from the current password." };
  }
  return { ok: true, message: "" };
};

export default {
  TEMP_PASSWORD_PATTERN,
  isTemporaryPasswordFormat,
  validateEmployeePassword,
  validateEmployeePasswordChange,
};
