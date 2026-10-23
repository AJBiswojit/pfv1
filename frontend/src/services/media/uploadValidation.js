/**
 * PRATIKSHYA FASHION — Demo upload validation.
 *
 * Format rules live in `config/mediaTypes` (`UPLOAD_RULES`). This module
 * applies them to a chosen File so the dropzone and the marketing panel
 * cannot drift apart.
 */

import { MEDIA_TYPES, UPLOAD_RULES, formatFileSize, isAllowedUploadFormat } from "../../config/mediaTypes";

export const extensionOf = (name = "") => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/** IMAGE or VIDEO from MIME type or file extension. */
export const typeOfFile = (file) => {
  if (file.type?.startsWith("video/")) return MEDIA_TYPES.VIDEO;
  if (file.type?.startsWith("image/")) return MEDIA_TYPES.IMAGE;
  return UPLOAD_RULES[MEDIA_TYPES.VIDEO].extensions.includes(extensionOf(file.name))
    ? MEDIA_TYPES.VIDEO
    : MEDIA_TYPES.IMAGE;
};

/**
 * A stable identity for "the same file" inside one selection session.
 *
 * `name + size + lastModified` is what the OS reports for one file on disk;
 * two different photographs can never share all three, and re-selecting the
 * same file always does. Used to reject duplicate queue entries (a duplicate
 * would be one asset row but two upload requests, and it would inflate the
 * "media registered" count).
 */
export const fileSignature = (file) =>
  `${String(file?.name ?? "")}::${Number(file?.size) || 0}::${Number(file?.lastModified) || 0}`;

/** Validate file against house size and format rules. */
export const validateFile = (file) => {
  const type = typeOfFile(file);
  const rules = UPLOAD_RULES[type];
  const extension = extensionOf(file.name);

  if (!isAllowedUploadFormat(file, type)) {
    return {
      ok: false,
      error: `"${file.name}" has unsupported format ${extension || file.type || "unknown"}. Allowed: ${rules.extensions.join(", ")}.`,
    };
  }
  if (file.size > rules.maxBytes) {
    return {
      ok: false,
      error: `"${file.name}" is ${formatFileSize(file.size)} — maximum allowed size is ${rules.maxLabel}.`,
    };
  }
  return { ok: true, type };
};

export default { extensionOf, typeOfFile, validateFile, fileSignature };
