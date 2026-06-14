const PRICING_POLICY = Object.freeze({
  baseDistanceKm: Number(process.env.TRAGO_BASE_DISTANCE_KM || 11.6),
  baseFeeMzn: Number(process.env.TRAGO_BASE_DISTANCE_FEE_MZN || 200),
  extraKmFeeMzn: Number(process.env.TRAGO_EXTRA_KM_FEE_MZN || 15)
});

function isValidCoordinate(coord) {
  return coord && Number.isFinite(Number(coord.lat)) && Number.isFinite(Number(coord.lng));
}

function calculateDeliveryFee(distanceKm) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  if (distance <= PRICING_POLICY.baseDistanceKm) return PRICING_POLICY.baseFeeMzn;
  const extraKm = Math.ceil(distance - PRICING_POLICY.baseDistanceKm);
  return PRICING_POLICY.baseFeeMzn + (extraKm * PRICING_POLICY.extraKmFeeMzn);
}

function haversineKm(origin, destination) {
  const R = 6371;
  const dLat = (Number(destination.lat) - Number(origin.lat)) * Math.PI / 180;
  const dLng = (Number(destination.lng) - Number(origin.lng)) * Math.PI / 180;
  const lat1 = Number(origin.lat) * Math.PI / 180;
  const lat2 = Number(destination.lat) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function quoteWithGoogleRoutes(origin, destination) {
  const apiKey = process.env.TRAGO_GOOGLE_MAPS_API_KEY;
  if (!apiKey || typeof fetch !== 'function') return null;

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } },
      destination: { location: { latLng: { latitude: Number(destination.lat), longitude: Number(destination.lng) } } },
      travelMode: 'TWO_WHEELER',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'pt-PT',
      units: 'METRIC'
    })
  });

  if (!response.ok) return null;
  const data = await response.json();
  const route = data.routes && data.routes[0];
  if (!route || !route.distanceMeters) return null;
  const distanceKm = Number(route.distanceMeters) / 1000;
  const durationMin = route.duration ? Math.round(Number(String(route.duration).replace('s', '')) / 60) : null;
  return { distance_km: distanceKm, duration_min: durationMin, source: 'google_routes' };
}

async function buildRouteQuote(origin, destination) {
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    throw new Error('Coordenadas de recolha e entrega são obrigatórias.');
  }

  let quote = null;
  try {
    quote = await quoteWithGoogleRoutes(origin, destination);
  } catch (_error) {
    quote = null;
  }

  if (!quote) {
    const distanceKm = haversineKm(origin, destination);
    quote = {
      distance_km: distanceKm,
      duration_min: Math.max(1, Math.round((distanceKm / 35) * 60)),
      source: 'haversine_fallback'
    };
  }

  const deliveryFee = calculateDeliveryFee(quote.distance_km);
  return {
    distance_km: Number(Number(quote.distance_km).toFixed(2)),
    duration_min: quote.duration_min,
    delivery_fee: Number(Number(deliveryFee).toFixed(2)),
    source: quote.source,
    policy: PRICING_POLICY
  };
}

module.exports = {
  PRICING_POLICY,
  calculateDeliveryFee,
  haversineKm,
  buildRouteQuote,
  isValidCoordinate
};
