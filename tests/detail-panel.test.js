/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/numeo-map.js", () => ({
  mountLaneMap: vi.fn((container) => {
    container?.replaceChildren?.(document.createTextNode("mock-map"));
    return {
      invalidateSize: vi.fn(),
      remove: vi.fn()
    };
  }),
  destroyLaneMap: vi.fn()
}));

import {
  enhanceLoadDetails,
  extractLoadDetailData,
  findLaneRowFromLoadDetails,
  findLoadDetailHosts
} from "../src/detail-panel.js";
import { findRateRowInsertion } from "../src/numeo-column.js";

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Real DAT tablet-mode capture (from `new one.txt`, Tucker -> Osceola, 406 mi).
 * Rate block exists but with no rate posted ("-").
 */
function realDatDetailFixture() {
  document.body.innerHTML = `
    <div class="row-container" id="summary-row">
      <div class="table-cell" data-test="load-origin-cell">Tucker, GA</div>
      <div class="table-cell" data-test="load-destination-cell">Osceola, WI</div>
      <div class="table-cell">Delta Group Logistics</div>
      <div class="table-cell">100 CS 24 DTP</div>
      <dat-load-details id="detail-host">
        <dat-details-header>
          <div class="details-header_info">
            <div>Tucker, GA</div>
            <div>Osceola, WI</div>
            <div class="trip-miles">406 mi</div>
          </div>
          <div class="details-header_actions">
            <button data-test="print-load-buttton" aria-label="print">P</button>
          </div>
        </dat-details-header>
        <div class="tablet-details-container">
          <div class="table-details-row row-spacing" id="trip-row">
            <div class="details-column">
              <dat-route>
                <div class="details-container">
                  <div class="details-subheader hide-view-route">
                    <div class="details-subheader-mileage">
                      <span class="trip-miles"> 406 mi</span>
                    </div>
                    <a data-test="view-route-button"><span class="route-title">VIEW ROUTE</span></a>
                  </div>
                  <div data-test="route-details" class="route">
                    <div class="origin"><span class="truncate extended-trip-point">Tucker, GA</span></div>
                    <div class="destination"><span class="truncate extended-trip-point">Osceola, WI</span></div>
                  </div>
                </div>
              </dat-route>
            </div>
          </div>
          <div class="table-details-row row-spacing" id="equipment-row">
            <div class="details-column column-spacing">
              <dat-equipment>
                <div data-test="details-container" class="details-container">
                  <div class="title">Equipment</div>
                </div>
              </dat-equipment>
              <div class="contact-methods contact-method-table">
                <dat-contacts>
                  <a class="contacts__phone" href="tel:2242220100">(224) 222-0100</a>
                  <div class="contacts__email"><a href="mailto:n.prica@deltagrouplog.com">n.prica@deltagrouplog.com</a></div>
                </dat-contacts>
              </div>
            </div>
            <div class="details-column">
              <dat-notes>
                <div data-test="comments-container" class="details-container">
                  <span class="notes-title">COMMENTS</span>
                  <div class="notes-contents multiline">PU by 6PM, DEL 5/15 6AM</div>
                </div>
              </dat-notes>
            </div>
          </div>
          <div class="table-details-row row-spacing" id="rate-row">
            <div class="details-column column-spacing">
              <dat-rate>
                <div data-test="rate-details-container" class="rate-details-container">
                  <div class="data-container">
                    <div class="rate-data">
                      <div class="data-item">$2,400</div>
                      <div class="data-item">406 mi</div>
                      <div class="data-item-ratemiles">$5.91/mi</div>
                    </div>
                  </div>
                </div>
              </dat-rate>
            </div>
            <div class="details-column">
              <dat-search-market-rates>
                <div data-test="market-rates-detail-container" class="market-rates-details-container">
                  <div>MARKET RATES Powered by DAT iQ</div>
                </div>
              </dat-search-market-rates>
            </div>
          </div>
          <div class="table-details-row row-spacing" id="company-row">
            <div class="details-column">
              <dat-company>
                <div data-test="company-details-container">
                  <div class="company">Delta Group Logistics</div>
                  <div>Credit Score 100</div>
                  <div>Days to Pay 24</div>
                </div>
              </dat-company>
            </div>
          </div>
          <div class="table-details-row" id="controls-row">
            <div class="details-column">
              <div class="row-divider"></div>
            </div>
          </div>
        </div>
        <dat-load-resources>
          <div class="resource-name">PER LOAD INSURANCE</div>
        </dat-load-resources>
      </dat-load-details>
    </div>
  `;
}

/**
 * Detail markup that has Trip block but no rate block; assistant must NOT inject anywhere.
 */
function noRateRowFixture() {
  document.body.innerHTML = `
    <dat-load-details id="detail-host">
      <div class="tablet-details-container">
        <div class="table-details-row row-spacing">
          <div class="details-column">
            <dat-route>
              <div data-test="route-details" class="route">
                <span class="extended-trip-point">Tucker, GA</span>
                <span class="extended-trip-point">Osceola, WI</span>
              </div>
              <span class="trip-miles">406 mi</span>
            </dat-route>
          </div>
        </div>
      </div>
    </dat-load-details>
  `;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findLoadDetailHosts", () => {
  it("returns 0 hosts on a collapsed page", () => {
    document.body.innerHTML = `<div class="row-container"><div class="row-cells"></div></div>`;
    expect(findLoadDetailHosts(document).length).toBe(0);
  });

  it("returns the dat-load-details element when present", () => {
    realDatDetailFixture();
    const hosts = findLoadDetailHosts(document);
    expect(hosts.length).toBe(1);
    expect(hosts[0].id).toBe("detail-host");
  });
});

describe("findRateRowInsertion", () => {
  it("returns the rate row when the rate container is present", () => {
    realDatDetailFixture();
    const result = findRateRowInsertion(document.getElementById("detail-host"));
    expect(result).not.toBeNull();
    expect(result.rateRow.id).toBe("rate-row");
    expect(result.tabletContainer.classList.contains("tablet-details-container")).toBe(true);
  });

  it("returns null when no rate row exists", () => {
    noRateRowFixture();
    expect(findRateRowInsertion(document.getElementById("detail-host"))).toBeNull();
  });
});

describe("findLaneRowFromLoadDetails", () => {
  it("returns the list summary row for an expanded detail host", () => {
    realDatDetailFixture();
    const row = findLaneRowFromLoadDetails(document.getElementById("detail-host"));
    expect(row?.id).toBe("summary-row");
  });
});

describe("extractLoadDetailData (real-DAT fixture)", () => {
  it("reads origin, destination, miles, rate, broker, email, company", () => {
    realDatDetailFixture();
    const data = extractLoadDetailData(document.getElementById("detail-host"));
    expect(data.origin).toBe("Tucker, GA");
    expect(data.destination).toBe("Osceola, WI");
    expect(data.tripMiles).toBe(406);
    expect(data.rateDollars).toBe(2400);
    expect(data.contactEmail).toBe("n.prica@deltagrouplog.com");
    expect(data.companyName).toBe("Delta Group Logistics");
    expect(data.cs).toBe(100);
    expect(data.dtp).toBe(24);
  });
});

describe("enhanceLoadDetails (rate-row injection contract)", () => {
  it("inserts exactly one assist row immediately before the rate row in shadow DOM", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    const rateRow = document.getElementById("rate-row");
    const injected = document.querySelectorAll(".dat-ext-tom-row");
    expect(injected.length).toBe(1);
    expect(injected[0].nextElementSibling).toBe(rateRow);

    const host = injected[0].querySelector(".dat-ext-tom-panel");
    expect(host).toBeTruthy();
    expect(host.shadowRoot).toBeTruthy();
    const card = host.shadowRoot.querySelector('[data-role="tom-load-intelligence"]');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Load Intelligence");
    expect(host.shadowRoot.querySelector('[data-role="get-tolls"]')).toBeTruthy();
    expect(host.shadowRoot.querySelector('[data-role="lane-map"]')).toBeTruthy();
  });

  it("is idempotent under repeated scans (no duplicate injection)", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(1);
  });

  it("renders posted rate from DAT and falls back to DAT trip miles when route miles are unavailable", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    const inputs = Object.fromEntries(
      [...shadow.querySelectorAll(".metric-input")].map((input) => [input.dataset.role, input.value])
    );
    expect(inputs.rate).toBe("2,400");
    expect(inputs.miles).toBe("406");
    expect(inputs.rpm).toBe("5.91");
  });

  it("disables all email buttons when no contact email is parsed", () => {
    realDatDetailFixture();
    document.querySelectorAll('a[href^="mailto:"]').forEach((el) => el.remove());
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.querySelector('[data-role="offer-email"]').disabled).toBe(true);
    expect(shadow.querySelector('[data-role="offer-gmail"]').disabled).toBe(true);
    expect(shadow.querySelector('[data-role="booking-email"]').disabled).toBe(true);
    expect(shadow.querySelector('[data-role="booking-gmail"]').disabled).toBe(true);
  });

  it("does not inject anything when the rate row is missing", () => {
    noRateRowFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(0);
  });

  it("does not inject anything when the column is disabled via numeroColumnEnabled=false", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null, numeroColumnEnabled: false });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(0);
  });

  it("cleans up the injected row if the rate row disappears between scans", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(1);
    document.getElementById("rate-row").remove();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(0);
  });

  it("invokes route inspector once and updates miles from routed distance", async () => {
    realDatDetailFixture();
    const inspectLane = vi.fn(async () => ({
      routeConfidence: "exact",
      routeSource: "OSRM exact route",
      adjustedMiles: 412,
      routeOptionsCount: 1,
      tollStatus: "Unavailable",
      routeUrl: "https://example.test/route",
      mapLineLatLngs: [
        [33.85, -84.21],
        [45.32, -92.7]
      ],
      geocodeSources: ["cities.json", "cities.json"],
      notes: ["1 route option returned"]
    }));

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();
    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    expect(inspectLane).toHaveBeenCalledTimes(1);
    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.textContent).toContain("Load Intelligence");
    expect(shadow.querySelector('[data-role="miles"]').value).toBe("412");
    expect(shadow.querySelector('[data-role="lane-map"]').textContent).toContain("mock-map");
  });

  it("shows toll provider caption and strips duplicate TollGuru suffix on main line", async () => {
    realDatDetailFixture();
    const inspectLane = vi.fn(async () => ({
      routeConfidence: "exact",
      routeSource: "OSRM exact route",
      adjustedMiles: 412,
      routeOptionsCount: 1,
      tollStatus: "USD 33.06 est (TollGuru)",
      tollSource: "tollguru",
      tollVehicleType: "5AxlesTruck",
      routeUrl: "https://example.test/route",
      mapLineLatLngs: [
        [33.85, -84.21],
        [45.32, -92.7]
      ],
      geocodeSources: ["cities.json", "cities.json"],
      notes: []
    }));

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    const tollMain = shadow.querySelector('[data-role="toll"]');
    const tollCaption = shadow.querySelector('[data-role="toll-source"]');
    expect(tollMain?.textContent).toBe("USD 33.06 est");
    expect(tollCaption?.textContent).toContain("TollGuru");
    expect(tollCaption?.textContent).toContain("5-axle truck");
  });

  it("re-requests lane data with forceRefresh when Get Tolls is clicked", async () => {
    realDatDetailFixture();
    const inspectLane = vi.fn(async () => ({
      routeConfidence: "exact",
      routeSource: "OSRM exact route",
      adjustedMiles: 412,
      routeOptionsCount: 1,
      tollStatus: "USD 5.00 est",
      routeUrl: "https://example.test/route",
      mapLineLatLngs: [
        [33.85, -84.21],
        [45.32, -92.7]
      ],
      geocodeSources: ["cities.json", "cities.json"],
      notes: []
    }));

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    shadow.querySelector('[data-role="get-tolls"]').click();
    await flushPromises();

    expect(inspectLane).toHaveBeenCalledTimes(2);
    expect(inspectLane.mock.calls[1][2]).toEqual({ forceRefresh: true });
  });

  it("runs two inspectLane legs when the search origin field has a different city than pickup", async () => {
    realDatDetailFixture();
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="search-chrome"><input id="origin-automation" value="Atlanta, GA" /></div>`
    );

    const inspectLane = vi.fn(async (from, to) => {
      if (from.includes("Atlanta")) {
        return {
          routeConfidence: "exact",
          routeSource: "OSRM exact route",
          adjustedMiles: 25,
          routeOptionsCount: 1,
          tollStatus: "Unavailable",
          routeUrl: "https://example.test/leg1",
          mapLineLatLngs: [
            [33.74, -84.39],
            [33.85, -84.21]
          ],
          geocodeSources: ["cities.json", "cities.json"],
          notes: []
        };
      }
      return {
        routeConfidence: "exact",
        routeSource: "OSRM exact route",
        adjustedMiles: 400,
        routeOptionsCount: 1,
        tollStatus: "Unavailable",
        routeUrl: "https://example.test/leg2",
        mapLineLatLngs: [
          [33.85, -84.21],
          [45.32, -92.7]
        ],
        geocodeSources: ["cities.json", "cities.json"],
        notes: []
      };
    });

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();
    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    expect(inspectLane).toHaveBeenCalledTimes(2);
    expect(inspectLane).toHaveBeenNthCalledWith(1, "Atlanta, GA", "Tucker, GA", undefined);
    expect(inspectLane).toHaveBeenNthCalledWith(2, "Tucker, GA", "Osceola, WI", undefined);

    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.querySelector('[data-role="miles"]').value).toBe("425");
  });

  it("survives route inspector rejection and renders unavailable route", async () => {
    realDatDetailFixture();
    const inspectLane = vi.fn(async () => {
      throw new Error("Geocoding failed");
    });

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.querySelector('[data-role="miles"]').value).toBe("406");
    expect(shadow.textContent).toContain("Load Intelligence");
    expect(shadow.querySelector('[data-role="lane-map"]').textContent).toContain("Route map unavailable");
  });

  it("re-injects after the row is wiped by an Angular re-render", () => {
    realDatDetailFixture();
    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(1);

    // Simulate DAT re-render: replace tablet-details-container with a fresh subtree
    const host = document.getElementById("detail-host");
    const tablet = host.querySelector(".tablet-details-container");
    tablet.replaceWith(tablet.cloneNode(true));

    enhanceLoadDetails(document, { targets: {}, routeInspector: null });
    expect(document.querySelectorAll(".dat-ext-tom-row").length).toBe(1);
  });

  it("ignores stale route resolves when the signature has changed", async () => {
    realDatDetailFixture();
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const inspectLane = vi
      .fn()
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => ({
        routeConfidence: "exact",
        routeSource: "OSRM exact route",
        adjustedMiles: 999,
        routeOptionsCount: 1,
        tollStatus: "Unavailable",
        routeUrl: null,
        mapLineLatLngs: [[33, -84], [45, -92]],
        geocodeSources: ["cities.json", "cities.json"],
        notes: []
      }));

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });

    // Mutate the detail so a fresh signature is computed
    document
      .querySelector('[data-test="rate-details-container"] .data-item')
      .replaceWith(Object.assign(document.createElement("div"), { className: "data-item", textContent: "$9,999" }));

    enhanceLoadDetails(document, { targets: {}, routeInspector: { inspectLane } });
    await flushPromises();

    // Resolve the stale first call AFTER signature changed; renderer must not use it.
    resolveFirst({
      routeConfidence: "estimated",
      routeSource: "STALE",
      adjustedMiles: 111,
      routeOptionsCount: 0,
      tollStatus: "Unavailable",
      routeUrl: null,
      mapLineLatLngs: null,
      notes: ["stale data"]
    });
    await flushPromises();

    const shadow = document.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.querySelector('[data-role="miles"]').value).toBe("999");
  });

  it("injects as a new column between Trip and Rate in the desktop flex-row layout", async () => {
    document.body.innerHTML = `
      <dat-load-details id="detail-host">
        <div class="result-details-container">
          <div class="desktop-container" id="desktop-row">
            <div class="desktop-column" id="trip-col">
              <dat-route>
                <div data-test="route-details" class="route">
                  <span class="extended-trip-point">Portage, IN</span>
                  <span class="extended-trip-point">Joliet, IL</span>
                </div>
                <span class="trip-miles">52 mi</span>
              </dat-route>
            </div>
            <div class="desktop-column" id="rate-col">
              <dat-rate>
                <div data-test="rate-details-container" class="rate-details-container">
                  <div class="rate-data">
                    <div class="data-item">$503</div>
                    <div class="data-item">52 mi</div>
                    <div class="data-item-ratemiles">$9.67/mi</div>
                  </div>
                </div>
              </dat-rate>
              <dat-search-market-rates>
                <div data-test="market-rates-detail-container"></div>
              </dat-search-market-rates>
            </div>
            <div class="desktop-column" id="company-col">
              <dat-company>
                <div data-test="company-details-container">
                  <div class="company">Circle Logistics Inc</div>
                  <div>Credit Score 95</div>
                  <div>Days to Pay 20</div>
                </div>
              </dat-company>
            </div>
          </div>
        </div>
      </dat-load-details>
    `;

    enhanceLoadDetails(document, { targets: {}, routeInspector: null });

    const injectedColumn = document.querySelector(".dat-ext-tom-column");
    expect(injectedColumn).toBeTruthy();
    expect(injectedColumn.previousElementSibling?.id).toBe("trip-col");
    expect(injectedColumn.nextElementSibling?.id).toBe("rate-col");
    const shadow = injectedColumn.querySelector(".dat-ext-tom-panel").shadowRoot;
    expect(shadow.querySelector(".card").textContent).toContain("Load Intelligence");
    expect(shadow.querySelector('[data-role="miles"]').value).toBe("52");
    expect(shadow.querySelector('[data-role="rpm"]').value).toBe("9.67");
    expect(shadow.querySelector('[data-role="rate"]').value).toBe("503");
  });

  it("falls back to summary row metrics when company block is missing inside the detail card", async () => {
    document.body.innerHTML = `
      <div class="row-container" id="summary-row">
        <div class="table-cell" data-test="load-origin-cell">Somerset, NJ</div>
        <div class="table-cell" data-test="load-destination-cell">Bolingbrook, IL</div>
        <div class="table-cell">Shine Logistics LLC</div>
        <div class="table-cell">hardin.c@shinelogistics.test</div>
        <div class="table-cell">95 CS 24 DTP</div>
        <dat-load-details id="detail-host">
          <div class="tablet-details-container">
            <div class="table-details-row row-spacing">
              <div class="details-column">
                <dat-route>
                  <div data-test="route-details" class="route">
                    <span class="extended-trip-point">Somerset, NJ</span>
                    <span class="extended-trip-point">Bolingbrook, IL</span>
                  </div>
                  <span class="trip-miles">797 mi</span>
                </dat-route>
              </div>
            </div>
            <div class="table-details-row row-spacing" id="rate-row">
              <div class="details-column">
                <dat-rate>
                  <div data-test="rate-details-container" class="rate-details-container">
                    <div class="rate-data">
                      <div class="data-item">$1,000</div>
                      <div class="data-item">797 mi</div>
                      <div class="data-item-ratemiles">$1.25/mi</div>
                    </div>
                  </div>
                </dat-rate>
              </div>
            </div>
          </div>
        </dat-load-details>
      </div>
    `;

    enhanceLoadDetails(document, { targets: {}, routeInspector: null });

    const data = extractLoadDetailData(document.getElementById("detail-host"));
    expect(data.companyName).toBe("Shine Logistics LLC");
    expect(data.cs).toBe(95);
    expect(data.dtp).toBe(24);
    expect(data.contactEmail).toBe("hardin.c@shinelogistics.test");
  });
});
