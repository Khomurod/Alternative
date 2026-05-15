/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAT_EXT_USER_ACCOUNT_EMAIL_KEY } from "../src/google-account.js";

const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

describe("background Google login handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      runtime: {
        lastError: null,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() }
      },
      identity: {
        getAuthToken: vi.fn()
      },
      storage: {
        local: {
          set: vi.fn((_payload, cb) => cb?.())
        }
      }
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function invokeGoogleLogin() {
    let listener = null;
    chrome.runtime.onMessage.addListener.mockImplementation((fn) => {
      listener = fn;
    });

    await import("../background.js");

    return new Promise((resolve) => {
      listener({ type: "dat-ext:google-login" }, {}, resolve);
    });
  }

  it("stores email from userinfo after successful auth", async () => {
    chrome.identity.getAuthToken.mockImplementation((_opts, cb) => cb("test-token"));
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: "dispatcher@gmail.com" })
    });

    const response = await invokeGoogleLogin();

    expect(response).toEqual({ ok: true, email: "dispatcher@gmail.com" });
    expect(fetch).toHaveBeenCalledWith(
      GOOGLE_USERINFO_URL,
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" }
      })
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [DAT_EXT_USER_ACCOUNT_EMAIL_KEY]: "dispatcher@gmail.com"
    });
  });

  it("returns cancelled when the user closes the OAuth popup", async () => {
    chrome.identity.getAuthToken.mockImplementation((_opts, cb) => {
      chrome.runtime.lastError = { message: "The user did not approve access." };
      cb(undefined);
    });

    const response = await invokeGoogleLogin();

    expect(response).toEqual({ ok: false, cancelled: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
