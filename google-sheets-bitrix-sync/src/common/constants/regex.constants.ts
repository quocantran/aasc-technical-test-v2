// Regular expressions for email format and Vietnamese mobile phone validation
export const REGEX_PATTERNS = {
  // Simplified RFC 5322 compliant email regex pattern
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // Raw Vietnamese mobile formats: prefixes 03, 05, 07, 08, 09 or +84 / 84
  VIETNAM_PHONE_RAW: /^(?:\+?84|0)(3|5|7|8|9)\d{8}$/,

  // Standardized international E.164 format for Vietnamese phone numbers (+84xxxxxxxxx)
  VIETNAM_PHONE_NORMALIZED: /^\+84(3|5|7|8|9)\d{8}$/,

  // Pattern stripping all characters except digits and leading plus sign
  CLEAN_PHONE_CHARS: /[^\d+]/g,
} as const;
