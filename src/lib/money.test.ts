import { describe, expect, it } from "vitest";
import { formatRs, paisaToRupeesText, rupeesToPaisa } from "./money";

describe("formatRs", () => {
  it("shows whole paisa as rupees", () => {
    expect(formatRs(115000)).toBe("Rs. 1,150.00");
    expect(formatRs(115050)).toBe("Rs. 1,150.50");
    expect(formatRs(-500)).toBe("-Rs. 5.00");
  });
});

describe("rupeesToPaisa", () => {
  it("converts exactly, with no floating point drift", () => {
    expect(rupeesToPaisa("1,150")).toBe(115000);
    expect(rupeesToPaisa("1150.5")).toBe(115050);
    expect(rupeesToPaisa("0.07")).toBe(7);
    expect(rupeesToPaisa("19.99")).toBe(1999);
    expect(rupeesToPaisa(" 450 ")).toBe(45000);
    expect(rupeesToPaisa("0")).toBe(0);
  });

  it("rejects anything that is not an amount", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1..2", "Rs 5", "1e3"]) expect(rupeesToPaisa(bad)).toBeNull();
  });

  it("round-trips with paisaToRupeesText", () => {
    for (const p of [0, 7, 100, 115000, 115050, 1999, 250000]) expect(rupeesToPaisa(paisaToRupeesText(p))).toBe(p);
  });
});
