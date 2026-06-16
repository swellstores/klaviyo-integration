import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js';

// Formats phone number to E.164 format
export function formatPhone(
  phone: string | null | undefined,
  countryCode?: string,
): string | undefined {
  if (!phone) {
    return undefined;
  }

  try {
    const phoneNumber = parsePhoneNumberWithError(phone, countryCode as CountryCode);
    if (!phoneNumber) {
      return undefined;
    }

    // this field stores phone number in E.164 format
    return phoneNumber.number;
  } catch (err) {
    return undefined;
  }
}
