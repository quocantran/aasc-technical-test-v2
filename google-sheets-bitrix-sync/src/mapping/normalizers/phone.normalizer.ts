import { REGEX_PATTERNS } from '../../common/constants/regex.constants.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

// Result returned after phone number validation and normalization
export interface PhoneNormalizationResult {
  isValid: boolean;
  normalized: string;
  raw: string;
  error?: string;
}

// Normalizes Vietnamese mobile phone numbers to international standard +84 format
export function normalizeVietnamesePhone(rawInput: any): PhoneNormalizationResult {
  if (rawInput === undefined || rawInput === null) {
    return { isValid: false, normalized: '', raw: '', error: ERROR_MESSAGES_VI.INVALID_PHONE_FORMAT };
  }

  const rawStr = String(rawInput).trim();
  if (rawStr === '') {
    return { isValid: false, normalized: '', raw: '', error: ERROR_MESSAGES_VI.INVALID_PHONE_FORMAT };
  }

  // Strips formatting characters (spaces, dashes, parentheses) except plus
  const cleaned = rawStr.replace(REGEX_PATTERNS.CLEAN_PHONE_CHARS, '');

  let nationalDigits = '';
  if (cleaned.startsWith('+84')) {
    nationalDigits = cleaned.substring(3);
  } else if (cleaned.startsWith('84')) {
    nationalDigits = cleaned.substring(2);
  } else if (cleaned.startsWith('0')) {
    nationalDigits = cleaned.substring(1);
  } else {
    nationalDigits = cleaned;
  }

  // Validates 9-digit national subscriber numbers starting with 3, 5, 7, 8, 9
  const isValid = /^(3|5|7|8|9)\d{8}$/.test(nationalDigits);

  if (!isValid) {
    return {
      isValid: false,
      normalized: '',
      raw: rawStr,
      error: ERROR_MESSAGES_VI.INVALID_PHONE_FORMAT,
    };
  }

  return {
    isValid: true,
    normalized: `+84${nationalDigits}`,
    raw: rawStr,
  };
}
