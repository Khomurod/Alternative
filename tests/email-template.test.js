import { describe, expect, it } from "vitest";
import { interpolateEmailTemplate } from "../src/email-template.js";

describe("interpolateEmailTemplate", () => {
  it("returns null for blank template", () => {
    expect(interpolateEmailTemplate("", { origin: "A" })).toBe(null);
    expect(interpolateEmailTemplate("   ", { origin: "A" })).toBe(null);
  });

  it("replaces all placeholders", () => {
    const out = interpolateEmailTemplate("Hi {{company}} — {{origin}} → {{destination}} ({{email}})", {
      companyName: "Acme",
      origin: "Dallas, TX",
      destination: "Denver, CO",
      contactEmail: "ops@acme.test"
    });
    expect(out).toBe("Hi Acme — Dallas, TX → Denver, CO (ops@acme.test)");
  });
});
