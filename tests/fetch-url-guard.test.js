import { describe, expect, it } from "vitest";
import { ALLOWED_FETCH_HOSTNAMES, validateFetchUrl } from "../src/fetch-url-guard.js";

describe("validateFetchUrl", () => {
  it("allows known routing and toll API hostnames", () => {
    for (const hostname of ALLOWED_FETCH_HOSTNAMES) {
      expect(validateFetchUrl(`https://${hostname}/v1/test`).hostname).toBe(hostname);
    }
  });

  it("rejects unknown hostnames with the security error", () => {
    expect(() => validateFetchUrl("https://evil.example.com/steal")).toThrow(
      "Security Error: Unauthorized domain access attempt."
    );
  });
});
