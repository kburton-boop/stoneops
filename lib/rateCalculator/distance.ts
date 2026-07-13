const METERS_PER_MILE = 1609.344;

export type AmbiguityLevel = "none" | "soft" | "hard";

export interface LocationAmbiguity {
  level: AmbiguityLevel;
  // Other real, meaningfully-distant places that also matched the same
  // name — shown to the user so they can tell at a glance which one was
  // actually meant, e.g. surfaced in a "did you mean" style prompt.
  candidateLabels: string[];
}

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
  originAmbiguity: LocationAmbiguity;
  destinationAmbiguity: LocationAmbiguity;
}

export async function lookupDistance(origin: string, destination: string): Promise<DistanceResult> {
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const [primary, originAmbiguity, destinationAmbiguity] = await Promise.all([
    googleApiKey ? lookupViaGoogle(origin, destination, googleApiKey) : lookupViaOsrm(origin, destination),
    // Run regardless of which provider computes the actual mileage — a
    // paid, generally-more-reliable geocoder can still silently pick the
    // wrong same-named place (confirmed against the real Google API: a
    // "Spring Grove, OH" query resolved to a real but wrong Spring Grove
    // 250+ miles from the intended one). Distance Matrix doesn't expose
    // alternate candidates, but the free Nominatim search does when asked
    // for more than one result, so it's used here purely as an
    // independent ambiguity check, not as the mileage source.
    checkAmbiguity(origin),
    checkAmbiguity(destination),
  ]);

  return { ...primary, originAmbiguity, destinationAmbiguity };
}

async function lookupViaGoogle(
  origin: string,
  destination: string,
  apiKey: string,
): Promise<Omit<DistanceResult, "originAmbiguity" | "destinationAmbiguity">> {
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

async function geocodeCandidates(query: string, limit: number): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: { "User-Agent": "stoneops-rate-calculator/1.0 (single-user internal tool)" },
  });
  if (!response.ok) throw new Error(`Geocoding request failed: ${response.status}`);

  const results = (await response.json()) as { lat: string; lon: string; display_name?: string }[];
  return results.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name || query }));
}

async function geocode(query: string): Promise<GeocodeResult> {
  const results = await geocodeCandidates(query, 1);
  if (results.length === 0) throw new Error(`Couldn't geocode "${query}"`);
  return results[0];
}

async function lookupViaOsrm(
  origin: string,
  destination: string,
): Promise<Omit<DistanceResult, "originAmbiguity" | "destinationAmbiguity">> {
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

const EARTH_RADIUS_MILES = 3958.8;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Below this, two candidates are treated as "the same place" (a city
// point vs. its county seat, a rooftop match vs. a town-center match) —
// not evidence of ambiguity.
const SOFT_AMBIGUITY_MILES = 5;
// Above this, two candidates are different enough that picking the wrong
// one would materially wreck a mileage-based quote — matches the real
// gap observed between the wrong and right "Spring Grove, OH" (~250+ mi).
const HARD_AMBIGUITY_MILES = 20;

// Independent of whichever provider computes the actual route: asks
// Nominatim for several candidate matches on the same query text and
// checks how far apart the top two are. Two real, meaningfully distant
// places sharing a name is a direct, honest signal that a short location
// name doesn't uniquely identify anywhere — far more reliable than
// guessing from the resolved label's wording, which would also flag
// perfectly ordinary "City, County, State" resolutions.
export async function checkAmbiguity(query: string): Promise<LocationAmbiguity> {
  try {
    const candidates = await geocodeCandidates(query, 5);
    if (candidates.length < 2) return { level: "none", candidateLabels: [] };

    const [first, second] = candidates;
    const milesApart = haversineMiles(first.lat, first.lon, second.lat, second.lon);

    if (milesApart >= HARD_AMBIGUITY_MILES) {
      return { level: "hard", candidateLabels: candidates.slice(0, 3).map((c) => c.label) };
    }
    if (milesApart >= SOFT_AMBIGUITY_MILES) {
      return { level: "soft", candidateLabels: candidates.slice(0, 3).map((c) => c.label) };
    }
    return { level: "none", candidateLabels: [] };
  } catch {
    // Fail open — this is a supplementary safety check, not the primary
    // lookup, and its own unavailability shouldn't block a calculation
    // that would otherwise succeed.
    return { level: "none", candidateLabels: [] };
  }
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
// Kept alongside checkAmbiguity (not replaced by it) as defense in depth:
// this needs zero network calls and catches a wrong-state match even in
// the rare case Nominatim's ranking doesn't surface the correct candidate
// in its top results at all.
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
