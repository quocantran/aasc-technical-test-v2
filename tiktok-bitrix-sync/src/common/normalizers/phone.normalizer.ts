import parsePhoneNumberFromString, { CountryCode } from 'libphonenumber-js';

export interface PhoneNormalizationResult {
  isValid: boolean;
  normalized: string;
  raw: string;
  error?: string;
  country?: string;
}

// Normalizes international and Vietnamese phone numbers to E.164 standard (+<country_code><digits>)
export function normalizePhone(rawInput: any, defaultCountry: CountryCode = 'VN'): PhoneNormalizationResult {
  if (rawInput === undefined || rawInput === null) {
    return { isValid: false, normalized: '', raw: '', error: 'Empty phone number' };
  }

  const rawStr = String(rawInput).trim();
  if (rawStr === '') {
    return { isValid: false, normalized: '', raw: '', error: 'Empty phone number' };
  }

  // Strip spaces, dashes, dots, brackets except leading plus
  const cleaned = rawStr.replace(/[\s\-\.\(\)]/g, '');

  try {
    const phoneNumber = parsePhoneNumberFromString(cleaned, defaultCountry);
    if (phoneNumber && phoneNumber.isValid()) {
      // For Vietnam, ensure it matches current 10-digit mobile numbering (prefixes: 3, 5, 7, 8, 9)
      if (phoneNumber.country === 'VN') {
        const national = phoneNumber.nationalNumber;
        if (!/^(3|5|7|8|9)\d{8}$/.test(national)) {
          return {
            isValid: false,
            normalized: '',
            raw: rawStr,
            error: 'Invalid Vietnamese mobile phone number format',
          };
        }
      }

      return {
        isValid: true,
        normalized: phoneNumber.format('E.164'),
        raw: rawStr,
        country: phoneNumber.country,
      };
    }
  } catch {
    // Ignore and proceed to fallback check
  }

  // Fallback for standard Vietnamese 9-digit mobile format (prefixes: 3, 5, 7, 8, 9)
  let nationalDigits = '';
  if (cleaned.startsWith('+84')) nationalDigits = cleaned.substring(3);
  else if (cleaned.startsWith('84')) nationalDigits = cleaned.substring(2);
  else if (cleaned.startsWith('0')) nationalDigits = cleaned.substring(1);

  if (/^(3|5|7|8|9)\d{8}$/.test(nationalDigits)) {
    return {
      isValid: true,
      normalized: `+84${nationalDigits}`,
      raw: rawStr,
      country: 'VN',
    };
  }

  return {
    isValid: false,
    normalized: '',
    raw: rawStr,
    error: 'Invalid phone number format for E.164 standardization',
  };
}

// Alias for backward compatibility across modules
export const normalizeVietnamesePhone = normalizePhone;
