const METERS_PER_MILE = 1609.344;

export interface DistanceResult {
  miles: number;
  source: "google" | "osrm";
  // The geocoder/router's own resolved location strings — always surfaced
  // back in the rate reply (not just on a suspected mismatch) so a wrong
  // match to a same-named place in another state is visible in the reply
  // itself rather than hidden inside a big rate number. See
  // looksLikeStateMismatch below.
  originLabel: string;
  destinationLabel: string;
}

export async function lookupDistance(origin: string, destination: string): Promise<DistanceResult> {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (googleApiKey) {
    return lookupViaGoogle(origin, destination, googleApiKey);
  }
  return lookupViaOsrm(origin, destination);
}

async function lookupViaGoogle(origin: string, destination: string, apiKey: string): Promise<DistanceResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origin);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Distance Matrix request failed: ${response.status}`);

  const data = await response.json();
  const element = data?.rows?.[0]?.elements?.[0];
  if (data.status !== "OK" || !element || element.status !== "OK") {
    throw new Error(`Google Distance Matrix couldn't resolve "${origin}" to "${destination}"`);
  }

  const meters = element.distance.value as number;
  return {
    miles: meters / METERS_PER_MILE,
    source: "google",
    originLabel: data.origin_addresses?.[0] || origin,
    destinationLabel: data.destination_addresses?.[0] || destination,
  };
}

interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

async function geocode(query: string): Promise<GeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": "stoneops-rate-calculator/1.0 (single-user internal tool)" },
  });
  if (!response.ok) throw new Error(`Geocoding request failed: ${response.status}`);

  const results = (await response.json()) as { lat: string; lon: string; display_name?: string }[];
  if (results.length === 0) throw new Error(`Couldn't geocode "${query}"`);

  const result = results[0];
  return { lat: Number(result.lat), lon: Number(result.lon), label: result.display_name || query };
}

async function lookupViaOsrm(origin: string, destination: string): Promise<DistanceResult> {
  const [originPoint, destinationPoint] = await Promise.all([geocode(origin), geocode(destination)]);

  const url = new URL(
    `https://router.project-osrm.org/route/v1/driving/${originPoint.lon},${originPoint.lat};${destinationPoint.lon},${destinationPoint.lat}`,
  );
  url.searchParams.set("overview", "false");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`OSRM routing request failed: ${response.status}`);

  const data = await response.json();
  const meters = data?.routes?.[0]?.distance;
  if (typeof meters !== "number") {
    throw new Error(`OSRM couldn't route "${origin}" to "${destination}"`);
  }

  return {
    miles: meters / METERS_PER_MILE,
    source: "osrm",
    originLabel: originPoint.label,
    destinationLabel: destinationPoint.label,
  };
}

const STATE_NAMES_BY_ABBREVIATION: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// The free OSRM/Nominatim fallback has no disambiguation beyond the raw
// query text, so "Spring Grove" or "Ghent" can silently resolve to a
// same-named place in a completely different state. Comparing the state
// actually spoken (classifier reliably extracts "City, ST") against the
// state in the resolved label is a cheap, high-signal way to catch that —
// far more reliable than guessing at a "plausible" mileage threshold, which
// would be arbitrary and would miss lanes that are legitimately long.
export function looksLikeStateMismatch(statedLocation: string, resolvedLabel: string): boolean {
  const match = statedLocation.match(/,\s*([A-Za-z]{2})\b/);
  if (!match) return false;
  const statedAbbrev = match[1].toUpperCase();
  const statedName = STATE_NAMES_BY_ABBREVIATION[statedAbbrev];
  if (!statedName) return false;

  const resolvedUpper = resolvedLabel.toUpperCase();
  const matchesAbbrev = new RegExp(`\\b${statedAbbrev}\\b`).test(resolvedUpper);
  const matchesFullName = resolvedUpper.includes(statedName.toUpperCase());
  return !matchesAbbrev && !matchesFullName;
}
