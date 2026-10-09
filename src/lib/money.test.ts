import { describe, expect, it } from "vitest";
import { formatRs } from "./money";

describe("formatRs", () => {
  it("shows whole paisa as rupees", () => {
    expect(formatRs(115000)).toBe("Rs. 1,150.00");
  });
});
