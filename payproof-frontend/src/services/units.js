// Converts a base-unit integer string (like yoctoNEAR) to a readable decimal string.
// Uses BigInt, never floating point.
export function formatUnits(value, decimals, maxFraction = 6) {
  try {
    const raw = BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = (raw % base)
      .toString()
      .padStart(Number(decimals), "0")
      .slice(0, maxFraction)
      .replace(/0+$/, "");

    const wholeText = whole.toLocaleString("en-US");
    return fraction ? `${wholeText}.${fraction}` : wholeText;
  } catch {
    return String(value);
  }
}