import { REGEX_PATTERNS } from '../../common/constants/regex.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

// Result returned after email validation and normalization
export interface EmailNormalizationResult {
  isValid: boolean;
  normalized: string;
  raw: string;
  error?: string;
}

// Trims, lowercases, and validates email strings against RFC standard pattern
export function normalizeEmail(rawInput: any): EmailNormalizationResult {
  if (rawInput === undefined || rawInput === null) {
    return { isValid: false, normalized: '', raw: '', error: ERROR_MESSAGES_VI.INVALID_EMAIL_FORMAT };
  }

  const rawStr = String(rawInput).trim();
  if (rawStr === '') {
    return { isValid: false, normalized: '', raw: '', error: ERROR_MESSAGES_VI.INVALID_EMAIL_FORMAT };
  }

  const normalized = rawStr.toLowerCase();
  const isValid = REGEX_PATTERNS.EMAIL.test(normalized);

  if (!isValid) {
    return {
      isValid: false,
      normalized: '',
      raw: rawStr,
      error: ERROR_MESSAGES_VI.INVALID_EMAIL_FORMAT,
    };
  }

  return {
    isValid: true,
    normalized,
    raw: rawStr,
  };
}
