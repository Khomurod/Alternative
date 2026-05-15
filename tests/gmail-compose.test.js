/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  buildGmailComposeUrl,
  buildMailtoUrl,
  GMAIL_COMPOSE_URL_MAX_LENGTH,
  pickGmailComposeOrMailto
} from "../src/gmail-compose.js";

describe("gmail-compose", () => {
  it("builds Gmail compose URL with view=cm, fs=1, to, su, body", () => {
    const url = new URL(
      buildGmailComposeUrl("broker@example.com", "Hello there", "Line one\nLine two")
    );
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("fs")).toBe("1");
    expect(url.searchParams.get("to")).toBe("broker@example.com");
    expect(url.searchParams.get("su")).toBe("Hello there");
    expect(url.searchParams.get("body")).toBe("Line one\nLine two");
  });

  it("pickGmailComposeOrMailto uses Gmail when under max length", () => {
    const picked = pickGmailComposeOrMailto("a@b.co", "S", "short body");
    expect(picked.usedGmail).toBe(true);
    expect(picked.href.startsWith("https://mail.google.com/mail/")).toBe(true);
  });

  it("falls back to mailto when Gmail URL exceeds max length", () => {
    const hugeBody = "x".repeat(GMAIL_COMPOSE_URL_MAX_LENGTH + 50);
    const picked = pickGmailComposeOrMailto("x@y.com", "Subject", hugeBody, {
      maxLength: GMAIL_COMPOSE_URL_MAX_LENGTH
    });
    expect(picked.usedGmail).toBe(false);
    expect(picked.href.startsWith("mailto:")).toBe(true);
    expect(picked.href).toContain("subject=Subject");
  });

  it("buildMailtoUrl matches URLSearchParams subject and body encoding", () => {
    const href = buildMailtoUrl("a@b.co", "S & B", "hello=world");
    expect(href.startsWith("mailto:a@b.co?")).toBe(true);
    const q = href.split("?")[1];
    const params = new URLSearchParams(q);
    expect(params.get("subject")).toBe("S & B");
    expect(params.get("body")).toBe("hello=world");
  });
});
