(() => {
  // src/email-template.js
  var EMAIL_OFFER_TEMPLATE_KEY = "dat-ext-email-offer-template-v1";
  var EMAIL_BOOKING_TEMPLATE_KEY = "dat-ext-email-booking-template-v1";

  // src/feature-flags.js
  var DAT_EXT_NUMEO_COLUMN_KEY = "datExtNumeoColumn";

  // src/google-account.js
  var DAT_EXT_USER_ACCOUNT_EMAIL_KEY = "datExtUserAccountEmail";

  // src/tollguru-api-key.js
  var DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";
  var DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY = "datExtGoogleTollFallback";

  // src/sidepanel-entry.js
  var offerEl = document.getElementById("offer-tpl");
  var bookingEl = document.getElementById("booking-tpl");
  var numeoEl = document.getElementById("numeo-column");
  var tollguruEl = document.getElementById("tollguru-key");
  var googleFallbackEl = document.getElementById("google-toll-fallback");
  var testTollguruBtn = document.getElementById("test-tollguru");
  var save = document.getElementById("save");
  var msg = document.getElementById("msg");
  var identityPrimaryEl = document.getElementById("identity-primary");
  var tollguruStatusEl = document.getElementById("tollguru-status");
  var connectGoogleBtn = document.getElementById("connect-google");
  var disconnectGoogleBtn = document.getElementById("disconnect-google");
  function clearMsg() {
    msg.textContent = "";
    msg.className = "";
  }
  function showMsg(text, isError) {
    msg.textContent = text;
    msg.className = isError ? "msg msg--error" : "msg msg--ok";
  }
  function refreshIdentityAndTollLine() {
    chrome.storage.local.get([DAT_EXT_USER_ACCOUNT_EMAIL_KEY, DAT_EXT_TOLLGURU_API_KEY], (r) => {
      const em = String(r[DAT_EXT_USER_ACCOUNT_EMAIL_KEY] || "").trim();
      const key = String(r[DAT_EXT_TOLLGURU_API_KEY] || "").trim();
      if (em) {
        identityPrimaryEl.textContent = `Connected: ${em}`;
        identityPrimaryEl.classList.remove("muted");
        connectGoogleBtn.hidden = true;
        disconnectGoogleBtn.hidden = false;
      } else {
        identityPrimaryEl.textContent = "Not connected \u2014 sign in below to use Gmail from DAT.";
        identityPrimaryEl.classList.add("muted");
        connectGoogleBtn.hidden = false;
        disconnectGoogleBtn.hidden = true;
      }
      tollguruStatusEl.textContent = key ? `TollGuru: key saved (${key.length} characters)` : "TollGuru: no API key \u2014 truck toll estimates unavailable until you add one.";
    });
  }
  refreshIdentityAndTollLine();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (changes[DAT_EXT_USER_ACCOUNT_EMAIL_KEY] || changes[DAT_EXT_TOLLGURU_API_KEY]) {
      refreshIdentityAndTollLine();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshIdentityAndTollLine();
    }
  });
  connectGoogleBtn?.addEventListener("click", () => {
    clearMsg();
    connectGoogleBtn.disabled = true;
    chrome.runtime.sendMessage({ type: "dat-ext:google-login" }, (response) => {
      connectGoogleBtn.disabled = false;
      if (chrome.runtime.lastError) {
        showMsg(String(chrome.runtime.lastError.message || "Sign-in failed"), true);
        return;
      }
      if (response?.ok && response.email) {
        showMsg(`Signed in as ${response.email}.`, false);
        refreshIdentityAndTollLine();
        return;
      }
      if (response?.cancelled) {
        showMsg("Sign-in cancelled.", false);
        return;
      }
      showMsg(String(response?.error || "Sign-in failed"), true);
    });
  });
  disconnectGoogleBtn?.addEventListener("click", () => {
    if (!window.confirm(
      "Sign out of Google for this extension? Cached tokens will be cleared and access revoked where possible."
    )) {
      return;
    }
    clearMsg();
    chrome.runtime.sendMessage({ type: "dat-ext:google-logout" }, (response) => {
      if (chrome.runtime.lastError) {
        showMsg(String(chrome.runtime.lastError.message || "Sign-out failed"), true);
        return;
      }
      if (!response?.ok) {
        showMsg(String(response?.error || "Sign-out failed"), true);
        return;
      }
      showMsg("Signed out.", false);
      refreshIdentityAndTollLine();
    });
  });
  chrome.storage.local.get(
    [
      EMAIL_OFFER_TEMPLATE_KEY,
      EMAIL_BOOKING_TEMPLATE_KEY,
      DAT_EXT_NUMEO_COLUMN_KEY,
      DAT_EXT_TOLLGURU_API_KEY,
      DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY
    ],
    (r) => {
      offerEl.value = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
      bookingEl.value = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
      numeoEl.checked = r[DAT_EXT_NUMEO_COLUMN_KEY] !== false;
      tollguruEl.value = r[DAT_EXT_TOLLGURU_API_KEY] ?? "";
      googleFallbackEl.checked = r[DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY] !== false;
    }
  );
  save.addEventListener("click", () => {
    clearMsg();
    chrome.storage.local.set(
      {
        [EMAIL_OFFER_TEMPLATE_KEY]: offerEl.value,
        [EMAIL_BOOKING_TEMPLATE_KEY]: bookingEl.value,
        [DAT_EXT_NUMEO_COLUMN_KEY]: Boolean(numeoEl.checked),
        [DAT_EXT_TOLLGURU_API_KEY]: String(tollguruEl.value || "").trim(),
        [DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY]: Boolean(googleFallbackEl.checked)
      },
      () => {
        showMsg("Saved. Reload DAT tabs if you changed templates or column visibility.", false);
        refreshIdentityAndTollLine();
        window.setTimeout(clearMsg, 3200);
      }
    );
  });
  testTollguruBtn.addEventListener("click", () => {
    clearMsg();
    const apiKey = String(tollguruEl.value || "").trim();
    if (!apiKey) {
      showMsg("Enter your TollGuru API key, then run the test.", true);
      return;
    }
    showMsg("Testing TollGuru\u2026", false);
    chrome.runtime.sendMessage({ type: "dat-ext:test-tollguru", apiKey }, (response) => {
      if (chrome.runtime.lastError) {
        showMsg(String(chrome.runtime.lastError.message || "Message to background failed"), true);
        return;
      }
      if (!response?.ok) {
        showMsg(String(response?.error || "TollGuru test failed"), true);
        return;
      }
      showMsg(String(response.okMessage || "TollGuru OK"), false);
    });
  });
})();
