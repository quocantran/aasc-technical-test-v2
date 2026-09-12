export interface EmailNormalizationResult {
  isValid: boolean;
  normalized: string;
  raw: string;
  error?: string;
}

// Trims whitespace, converts to lowercase, and validates RFC 5322 email format.
export function normalizeEmail(rawInput: any): EmailNormalizationResult {
  if (rawInput === undefined || rawInput === null) {
    return { isValid: false, normalized: '', raw: '', error: 'Empty email address' };
  }

  const rawStr = String(rawInput).trim();
  if (rawStr === '') {
    return { isValid: false, normalized: '', raw: '', error: 'Empty email address' };
  }

  const normalized = rawStr.toLowerCase();
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  const isValid = emailRegex.test(normalized);

  if (!isValid) {
    return {
      isValid: false,
      normalized: '',
      raw: rawStr,
      error: 'Invalid email address format',
    };
  }

  return {
    isValid: true,
    normalized,
    raw: rawStr,
  };
}
