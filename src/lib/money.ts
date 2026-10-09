// Money is stored as integer paisa (Rs. 1 = 100). Never use floating point for money.
// These two functions are the only place rupees and paisa are converted.

export function formatRs(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}Rs. ${rupees}.${rest}`;
}

// "1,150" -> 115000, "1150.5" -> 115050. Works on the text, so there is no rounding error.
// Returns null when the text is not a valid amount (letters, more than 2 decimals, negative).
export function rupeesToPaisa(text: string): number | null {
  const clean = text.trim().replace(/,/g, "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

// 115000 -> "1,150", 115050 -> "1,150.50" (for input boxes and tables, no "Rs.")
export function paisaToRupeesText(paisa: number): string {
  const rupees = Math.floor(Math.abs(paisa) / 100).toLocaleString("en-US");
  const rest = Math.abs(paisa) % 100;
  return `${paisa < 0 ? "-" : ""}${rupees}${rest ? "." + String(rest).padStart(2, "0") : ""}`;
}
