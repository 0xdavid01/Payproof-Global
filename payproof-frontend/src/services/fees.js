export const PLATFORM_FEE_RATE = 0.035;

export function calculatePlatformFee(amount) {
  const numericAmount = Number(amount);
  return Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * PLATFORM_FEE_RATE
    : 0;
}
