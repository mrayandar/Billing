// Money is stored as integer paisa (Rs. 1 = 100). Never use floating point for money.
export function formatRs(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  const rupees = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}Rs. ${rupees}.${rest}`;
}
