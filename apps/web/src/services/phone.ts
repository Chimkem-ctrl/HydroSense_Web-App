import { formatSignupPhone, PHONE_COUNTRIES } from '@hydrosense/shared';

export function isValidForSms(phone: string | undefined) {
  const value = phone?.trim() ?? '';
  if (!value) return false;
  if (!value.startsWith('+')) return Boolean(formatSignupPhone('PH', value));
  return PHONE_COUNTRIES.some(({ code, callingCode }) =>
    value.startsWith(callingCode) && formatSignupPhone(code, value.slice(callingCode.length)) === value,
  );
}
