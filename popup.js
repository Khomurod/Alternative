(() => {
  // src/email-template.js
  var EMAIL_OFFER_TEMPLATE_KEY = "dat-ext-email-offer-template-v1";
  var EMAIL_BOOKING_TEMPLATE_KEY = "dat-ext-email-booking-template-v1";

  // src/feature-flags.js
  var DAT_EXT_NUMEO_COLUMN_KEY = "datExtNumeoColumn";

  // src/tollguru-api-key.js
  var DAT_EXT_TOLLGURU_API_KEY = "datExtTollguruApiKey";

  // src/popup-entry.js
  var offerEl = document.getElementById("offer-tpl");
  var bookingEl = document.getElementById("booking-tpl");
  var numeoEl = document.getElementById("numeo-column");
  var tollguruEl = document.getElementById("tollguru-key");
  var save = document.getElementById("save");
  var msg = document.getElementById("msg");
  chrome.storage.local.get(
    [EMAIL_OFFER_TEMPLATE_KEY, EMAIL_BOOKING_TEMPLATE_KEY, DAT_EXT_NUMEO_COLUMN_KEY, DAT_EXT_TOLLGURU_API_KEY],
    (r) => {
      offerEl.value = r[EMAIL_OFFER_TEMPLATE_KEY] ?? "";
      bookingEl.value = r[EMAIL_BOOKING_TEMPLATE_KEY] ?? "";
      numeoEl.checked = r[DAT_EXT_NUMEO_COLUMN_KEY] !== false;
      tollguruEl.value = r[DAT_EXT_TOLLGURU_API_KEY] ?? "";
    }
  );
  save.addEventListener("click", () => {
    chrome.storage.local.set(
      {
        [EMAIL_OFFER_TEMPLATE_KEY]: offerEl.value,
        [EMAIL_BOOKING_TEMPLATE_KEY]: bookingEl.value,
        [DAT_EXT_NUMEO_COLUMN_KEY]: Boolean(numeoEl.checked),
        [DAT_EXT_TOLLGURU_API_KEY]: String(tollguruEl.value || "").trim()
      },
      () => {
        msg.textContent = "Saved.";
        setTimeout(() => {
          msg.textContent = "";
        }, 2e3);
      }
    );
  });
})();
