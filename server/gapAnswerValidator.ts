import type { GapAnswer } from "@shared/schema";
import { ALLOWED_GAP_FILE_TYPES, MAX_GAP_FILE_SIZE_BYTES } from "@shared/schema";

const ALLOWED_SCHEMES = ["http:", "https:"];

export interface GapAnswerValidationError {
  questionId: string;
  field: "supportingLink" | "supportingDocument";
  message: string;
}

export function validateAndSanitizeGapAnswers(answers: GapAnswer[]): {
  valid: GapAnswer[];
  errors: GapAnswerValidationError[];
} {
  const errors: GapAnswerValidationError[] = [];
  const valid: GapAnswer[] = [];

  for (const answer of answers) {
    let sanitized = { ...answer };

    if (sanitized.supportingLink) {
      const linkResult = validateAndNormalizeUrl(sanitized.supportingLink);
      if (linkResult.error) {
        errors.push({ questionId: answer.questionId, field: "supportingLink", message: linkResult.error });
        sanitized = { ...sanitized, supportingLink: null };
      } else {
        sanitized = { ...sanitized, supportingLink: linkResult.url! };
      }
    }

    if (sanitized.supportingDocumentData) {
      const fileResult = validateFileAttachment({
        mimeType: sanitized.supportingDocumentMimeType,
        sizeBytes: sanitized.supportingDocumentSizeBytes,
        name: sanitized.supportingDocumentName,
      });
      if (fileResult.error) {
        errors.push({ questionId: answer.questionId, field: "supportingDocument", message: fileResult.error });
        sanitized = {
          ...sanitized,
          supportingDocumentData: null,
          supportingDocumentName: null,
          supportingDocumentMimeType: null,
          supportingDocumentSizeBytes: null,
          supportingDocumentUploadedAt: null,
        };
      }
    }

    valid.push(sanitized);
  }

  return { valid, errors };
}

export function validateAndNormalizeUrl(rawUrl: string): { url?: string; error?: string } {
  let url = rawUrl.trim();
  if (!url) return { url: undefined };

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Invalid URL format — must be a valid web address." };
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { error: `URL scheme "${parsed.protocol}" is not allowed. Only http:// and https:// are permitted.` };
  }

  if (!parsed.hostname || parsed.hostname.length < 2) {
    return { error: "URL must include a valid hostname." };
  }

  return { url: parsed.toString() };
}

export function validateFileAttachment(file: {
  mimeType?: string | null;
  sizeBytes?: number | null;
  name?: string | null;
}): { error?: string } {
  if (file.mimeType && !(ALLOWED_GAP_FILE_TYPES as readonly string[]).includes(file.mimeType)) {
    return { error: `File type "${file.mimeType}" is not allowed. Accepted: PDF, TXT, CSV, DOC, DOCX, PNG, JPG.` };
  }

  if (file.sizeBytes && file.sizeBytes > MAX_GAP_FILE_SIZE_BYTES) {
    const mb = (file.sizeBytes / (1024 * 1024)).toFixed(1);
    return { error: `File is ${mb}MB — maximum allowed is 5MB.` };
  }

  return {};
}
