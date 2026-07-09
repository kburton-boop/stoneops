const METERS_PER_MILE = 1609.344;

export interface DistanceResult {
  miles: number;
  source: "google" | "osrm";
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
  return { miles: meters / METERS_PER_MILE, source: "google" };
}

interface GeocodeResult {
  lat: number;
  lon: number;
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

  const results = (await response.json()) as { lat: string; lon: string }[];
  if (results.length === 0) throw new Error(`Couldn't geocode "${query}"`);

  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
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

  return { miles: meters / METERS_PER_MILE, source: "osrm" };
}
