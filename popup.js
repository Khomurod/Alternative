(() => {
  // src/email-template.js
  var EMAIL_OFFER_TEMPLATE_KEY = "dat-ext-email-offer-template-v1";
  var EMAIL_BOOKING_TEMPLATE_KEY = "dat-ext-email-booking-template-v1";

  // src/feature-flags.js
  var DAT_EXT_NUMEO_COLUMN_KEY = "datExtNumeoColumn";

  // src/tollguru-api-key.js
  var DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";
  var DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY = "datExtGoogleTollFallback";

  // src/popup-entry.js
  var offerEl = document.getElementById("offer-tpl");
  var bookingEl = document.getElementById("booking-tpl");
  var numeoEl = document.getElementById("numeo-column");
  var tollguruEl = document.getElementById("tollguru-key");
  var googleFallbackEl = document.getElementById("google-toll-fallback");
  var testTollguruBtn = document.getElementById("test-tollguru");
  var save = document.getElementById("save");
  var msg = document.getElementById("msg");
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
    msg.className = "";
    msg.style.color = "";
    chrome.storage.local.set(
      {
        [EMAIL_OFFER_TEMPLATE_KEY]: offerEl.value,
        [EMAIL_BOOKING_TEMPLATE_KEY]: bookingEl.value,
        [DAT_EXT_NUMEO_COLUMN_KEY]: Boolean(numeoEl.checked),
        [DAT_EXT_TOLLGURU_API_KEY]: String(tollguruEl.value || "").trim(),
        [DAT_EXT_GOOGLE_TOLL_FALLBACK_KEY]: Boolean(googleFallbackEl.checked)
      },
      () => {
        msg.textContent = "Saved.";
        msg.style.color = "#15803d";
        setTimeout(() => {
          msg.textContent = "";
          msg.style.color = "";
        }, 2200);
      }
    );
  });
  testTollguruBtn.addEventListener("click", () => {
    msg.className = "";
    msg.style.color = "";
    const apiKey = String(tollguruEl.value || "").trim();
    if (!apiKey) {
      msg.textContent = "Enter your TollGuru API key, then run the test.";
      msg.className = "msg--error";
      msg.style.color = "#b42318";
      return;
    }
    msg.textContent = "Testing TollGuru\u2026";
    chrome.runtime.sendMessage({ type: "dat-ext:test-tollguru", apiKey }, (response) => {
      if (chrome.runtime.lastError) {
        msg.textContent = String(chrome.runtime.lastError.message || "Message to background failed");
        msg.className = "msg--error";
        msg.style.color = "#b42318";
        return;
      }
      if (!response?.ok) {
        msg.textContent = String(response?.error || "TollGuru test failed");
        msg.className = "msg--error";
        msg.style.color = "#b42318";
        return;
      }
      msg.textContent = String(response.okMessage || "TollGuru OK");
      msg.style.color = "#15803d";
    });
  });
})();
