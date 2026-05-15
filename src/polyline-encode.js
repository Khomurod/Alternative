/**
 * Encoded polyline (precision 5) for Google Static Maps `enc:` paths.
 * @param {Array<[number, number]>} coordinates [lat, lng], …
 * @returns {string}
 */
export function encodePolylinePrecision5(coordinates) {
  let previousLat = 0;
  let previousLng = 0;
  let result = "";

  for (const pair of coordinates) {
    const lat = Number(pair?.[0]);
    const lng = Number(pair?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }

    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);

    const dLat = lat5 - previousLat;
    const dLng = lng5 - previousLng;
    previousLat = lat5;
    previousLng = lng5;

    result += encodeSigned(dLat);
    result += encodeSigned(dLng);
  }

  return result;
}

function encodeSigned(num) {
  let sgn = num << 1;
  if (num < 0) {
    sgn = ~sgn;
  }
  let chunk = "";
  while (sgn >= 0x20) {
    chunk += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
    sgn >>= 5;
  }
  chunk += String.fromCharCode(sgn + 63);
  return chunk;
}

/**
 * Reduce point count for Static Maps URL limits (~8k).
 * @param {Array<[number, number]>} points
 * @param {number} maxPoints
 * @returns {Array<[number, number]>}
 */
export function downsamplePolyline(points, maxPoints) {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points;
  }

  const out = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i += 1) {
    const idx = Math.round(i * step);
    out.push(points[idx]);
  }
  out.push(points[points.length - 1]);
  return out;
}
