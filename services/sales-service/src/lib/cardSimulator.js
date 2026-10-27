export function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(digits) {
  if (/^4/.test(digits)) return 'VISA';
  if (/^5[1-5]/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'TARJETA';
}

export function simulateCard(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return { valid: false };
  const brand = cardBrand(digits);
  const last4 = digits.slice(-4);
  if (digits === '4000000000000002') return { valid: true, brand, last4, status: 'RECHAZADO', message: 'Fondos insuficientes (simulado)' };
  if (digits === '4000000000009995') return { valid: true, brand, last4, status: 'PENDIENTE', message: 'Pago pendiente de confirmación del procesador (simulado)' };
  return { valid: true, brand, last4, status: 'APROBADO', message: 'Aprobado (simulado)' };
}
