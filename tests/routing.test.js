/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import {
  adjustedRoadMiles,
  buildCitiesIndex,
  createRouteInspector,
  haversineMiles,
  inspectDispatcherM3Route,
  parseCityState
} from "../src/routing.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

describe("routing helpers", () => {
  it("parses city/state pairs from cleaned DAT text", () => {
    expect(parseCityState("Origin: Newark, NJ (28)")).toEqual({
      city: "Newark",
      state: "NJ",
      display: "Newark, NJ",
      key: "newark|nj"
    });
  });

  it("builds an index and computes adjusted road miles", () => {
    const index = buildCitiesIndex([{ city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 }]);
    expect(index.get("newark|nj")?.lat).toBeCloseTo(40.7357, 4);

    const straight = haversineMiles({ lat: 40, lon: -74 }, { lat: 41, lon: -87 });
    expect(straight).toBeGreaterThan(600);
    expect(adjustedRoadMiles(straight)).toBeCloseTo(straight * 1.15, 5);
  });
});

describe("createRouteInspector", () => {
  it("accepts full state names from Photon when DAT uses abbreviations", async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        features: [
          {
            properties: {
              name: "Somerset",
              state: "New Jersey",
              countrycode: "US"
            },
            geometry: {
              coordinates: [-74.5048662, 40.511589]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        features: [
          {
            properties: {
              name: "Bolingbrook",
              state: "Illinois",
              countrycode: "US"
            },
            geometry: {
              coordinates: [-88.0717708, 41.7003302]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        routes: [{ distance: 1261728, geometry: { type: "LineString", coordinates: [[-74.1724, 40.7357], [-87.6298, 41.8781]] } }]
      });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: ""
    });

    const lane = await inspector.inspectLane("Somerset, NJ", "Bolingbrook, IL");
    expect(lane.routeConfidence).toBe("exact");
    expect(lane.geocodeSources).toEqual(["photon", "photon"]);
  });

  it("returns exact route miles and caches the result", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            },
            {
              distance: 1293900,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74, 40],
                  [-88, 42]
                ]
              }
            }
          ]
        };
      }
    }));

    const inspector = createRouteInspector({
      fetchImpl,
      storage: createMemoryStorage(),
      googleApiKey: "",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const first = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    const second = await inspector.inspectLane("Newark, NJ", "Chicago, IL");

    expect(first.routeConfidence).toBe("exact");
    expect(first.routeOptionsCount).toBe(2);
    expect(first.adjustedMiles).toBeCloseTo(784, 0);
    expect(first.mapLineLatLngs?.[0]).toEqual([40.7357, -74.1724]);
    expect(second.adjustedMiles).toBeCloseTo(first.adjustedMiles, 5);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("adds Google toll estimates when Routes API succeeds", async () => {
    const requestJson = vi.fn(async (url, init = {}) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }

      if (url.includes("routes.googleapis.com")) {
        expect(init.method).toBe("POST");
        return {
          routes: [
            {
              distanceMeters: 1261728,
              polyline: {
                encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
              },
              travelAdvisory: {
                tollInfo: {
                  estimatedPrice: [{ currencyCode: "USD", units: "18", nanos: 500000000 }]
                }
              }
            }
          ]
        };
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "test-api-key",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.routeConfidence).toBe("exact");
    expect(lane.tollStatus).toContain("USD 18.50");
    expect(lane.tollSource).toBe("google");
    expect(lane.notes.join(" ")).toContain("toll estimate from Google Routes");
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it("prefers TollGuru toll when configured and TollGuru returns OK", async () => {
    const tollguruPayload = {
      status: "OK",
      summary: { currency: "USD" },
      route: {
        hasTolls: true,
        costs: { minimumTollCost: 33.06 }
      }
    };

    const requestJson = vi.fn(async (url, init = {}) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }

      if (url.includes("routes.googleapis.com")) {
        expect(init.method).toBe("POST");
        return {
          routes: [
            {
              distanceMeters: 1261728,
              polyline: {
                encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
              },
              travelAdvisory: {
                tollInfo: {
                  estimatedPrice: [{ currencyCode: "USD", units: "18", nanos: 500000000 }]
                }
              }
            }
          ]
        };
      }

      if (url.includes("apis.tollguru.com")) {
        expect(init.method).toBe("POST");
        expect(init.headers?.["x-api-key"]).toBe("tg_test_key");
        return tollguruPayload;
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "test-google-key",
      tollguruApiKey: "tg_test_key",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.tollStatus).toBe("USD 33.06 est (TollGuru)");
    expect(lane.tollSource).toBe("tollguru");
    expect(lane.tollVehicleType).toBe("5AxlesTruck");
    expect(lane.notes.join(" ")).toContain("toll estimate from TollGuru");
    expect(requestJson).toHaveBeenCalledTimes(3);
  });

  it("falls back to Google toll when TollGuru errors", async () => {
    const requestJson = vi.fn(async (url, init = {}) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }

      if (url.includes("routes.googleapis.com")) {
        return {
          routes: [
            {
              distanceMeters: 1261728,
              polyline: {
                encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
              },
              travelAdvisory: {
                tollInfo: {
                  estimatedPrice: [{ currencyCode: "USD", units: "18", nanos: 500000000 }]
                }
              }
            }
          ]
        };
      }

      if (url.includes("apis.tollguru.com")) {
        throw new Error("TollGuru unavailable");
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "test-api-key",
      tollguruApiKey: "tg_bad",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.tollStatus).toContain("USD 18.50");
    expect(lane.tollSource).toBe("google");
    expect(lane.notes.join(" ")).toContain("toll estimate from Google Routes");
    expect(requestJson).toHaveBeenCalledTimes(4);
  });

  it("reports toll roads even when Google has no estimated toll price", async () => {
    const requestJson = vi.fn(async (url) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 100000,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }
      if (url.includes("routes.googleapis.com")) {
        return {
          routes: [
            {
              distanceMeters: 100000,
              polyline: {
                encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
              },
              travelAdvisory: {
                tollInfo: {}
              }
            }
          ]
        };
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "test-api-key",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.tollStatus).toBe("Toll segments detected (estimate unavailable)");
    expect(lane.tollSource).toBe("google");
  });

  it("uses TollGuru origin-destination when complete-polyline fails but OD succeeds", async () => {
    const requestJson = vi.fn(async (url) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }

      if (url.includes("routes.googleapis.com")) {
        return {
          routes: [
            {
              distanceMeters: 1261728,
              polyline: {
                encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
              },
              travelAdvisory: {
                tollInfo: {
                  estimatedPrice: [{ currencyCode: "USD", units: "18", nanos: 500000000 }]
                }
              }
            }
          ]
        };
      }

      if (url.includes("complete-polyline-from-mapping-service")) {
        throw new Error("HTTP 403");
      }

      if (url.includes("origin-destination-waypoints")) {
        return {
          status: "OK",
          summary: { currency: "USD" },
          routes: [
            {
              summary: { hasTolls: true },
              costs: { minimumTollCost: 88.88 }
            }
          ]
        };
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "test-api-key",
      tollguruApiKey: "tg_od_fallback",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.tollStatus).toBe("USD 88.88 est (TollGuru)");
    expect(lane.tollSource).toBe("tollguru");
    expect(lane.notes.join(" ")).toMatch(/origin|destination|TollGuru/i);
  });

  it("sets tollSource to none when no toll estimate is available", async () => {
    const requestJson = vi.fn(async (url) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: 1261728,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const lane = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    expect(lane.tollSource).toBe("none");
  });

  it("bypasses lane cache when forceRefresh is requested", async () => {
    let osrmDistance = 100000;
    const requestJson = vi.fn(async (url) => {
      if (url.includes("router.project-osrm.org")) {
        return {
          routes: [
            {
              distance: osrmDistance,
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.1724, 40.7357],
                  [-87.6298, 41.8781]
                ]
              }
            }
          ]
        };
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const inspector = createRouteInspector({
      requestJson,
      storage: createMemoryStorage(),
      googleApiKey: "",
      citiesRecords: [
        { city: "Newark", state: "NJ", lat: 40.7357, lon: -74.1724 },
        { city: "Chicago", state: "IL", lat: 41.8781, lon: -87.6298 }
      ]
    });

    const first = await inspector.inspectLane("Newark, NJ", "Chicago, IL");
    osrmDistance = 200000;
    const second = await inspector.inspectLane("Newark, NJ", "Chicago, IL", { forceRefresh: true });

    expect(first.adjustedMiles).not.toBe(second.adjustedMiles);
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it("falls back to an offline estimate when live routing fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("OSRM unavailable");
    });

    const inspector = createRouteInspector({
      fetchImpl,
      storage: createMemoryStorage(),
      googleApiKey: "",
      citiesRecords: [
        { city: "Somerset", state: "NJ", lat: 40.4976, lon: -74.4885 },
        { city: "Bolingbrook", state: "IL", lat: 41.6986, lon: -88.0684 }
      ]
    });

    const lane = await inspector.inspectLane("Somerset, NJ", "Bolingbrook, IL");

    expect(lane.routeConfidence).toBe("estimated");
    expect(lane.adjustedMiles).toBeGreaterThan(700);
    expect(lane.notes[0]).toContain("crow-flight");
    expect(lane.tollSource).toBe("none");
  });

  it("passes leg2 tollSource and tollVehicleType on dispatcher M3 combined route", async () => {
    const inspectLane = vi
      .fn()
      .mockResolvedValueOnce({
        adjustedMiles: 10,
        tollStatus: "USD 1 est",
        tollSource: "google",
        mapLineLatLngs: [
          [33.74, -84.39],
          [33.85, -84.21]
        ],
        routeConfidence: "exact",
        routeOptionsCount: 1,
        routeUrl: "https://example.test/leg1",
        geocodeSources: ["cities.json", "cities.json"],
        notes: []
      })
      .mockResolvedValueOnce({
        adjustedMiles: 400,
        tollStatus: "USD 33.06 est (TollGuru)",
        tollSource: "tollguru",
        tollVehicleType: "5AxlesTruck",
        mapLineLatLngs: [
          [33.85, -84.21],
          [45.32, -92.7]
        ],
        routeConfidence: "exact",
        routeOptionsCount: 1,
        routeUrl: "https://example.test/leg2",
        geocodeSources: ["cities.json", "cities.json"],
        notes: []
      });

    const combined = await inspectDispatcherM3Route(
      { inspectLane },
      "Atlanta, GA",
      "Tucker, GA",
      "Osceola, WI"
    );

    expect(combined?.tollSource).toBe("tollguru");
    expect(combined?.tollVehicleType).toBe("5AxlesTruck");
    expect(combined?.tollStatus).toBe("USD 33.06 est (TollGuru)");
    expect(combined?.searchOriginLatLng).toEqual([33.74, -84.39]);
    expect(combined?.pickupMapLatLng).toEqual([33.85, -84.21]);
    expect(combined?.deliveryMapLatLng).toEqual([45.32, -92.7]);
  });
});
