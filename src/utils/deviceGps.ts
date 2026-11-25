export type GpsProviderQuality = 'device_gps' | 'wifi_assisted' | 'coarse_network';

export interface DeviceGpsFix {
  lat: number;
  lng: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  capturedAtMs: number;
  sampleCount: number;
  providerQuality: GpsProviderQuality;
}

export interface AcquireDeviceGpsOptions {
  targetAccuracyMeters?: number;
  minListenMs?: number;
  maxListenMs?: number;
  signal?: AbortSignal;
  onProgress?: (fix: DeviceGpsFix, statusText: string) => void;
}

export const DEFAULT_ITI_CAMPUS_COORDS = {
  lat: 21.8958,
  lng: 83.4133,
};

export function classifyGpsAccuracy(accuracyMeters: number): GpsProviderQuality {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return 'wifi_assisted';
  if (accuracyMeters <= 80) return 'device_gps';
  if (accuracyMeters <= 300) return 'wifi_assisted';
  return 'coarse_network';
}

export function isValidCoordinatePair(lat: unknown, lng: unknown): boolean {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
  if (Math.abs(nLat) < 0.0001 && Math.abs(nLng) < 0.0001) return false;
  return true;
}

/**
 * Exact Haversine distance in meters matching server-side calculation.
 */
export function computeHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function getGeolocationPermissionState(): Promise<
  'granted' | 'prompt' | 'denied' | 'unsupported'
> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'granted' || status.state === 'prompt' || status.state === 'denied') {
        return status.state;
      }
    }
  } catch {
    // Some browsers throw on permissions.query('geolocation'); fall back cleanly
  }
  return 'prompt';
}

export function formatGeolocationErrorMessage(err: GeolocationPositionError | Error): string {
  if ('code' in err && typeof err.code === 'number') {
    if (err.code === 1) {
      return 'Location permission denied. Please allow Precise Location / GPS access for this site in your browser settings and reload.';
    }
    if (err.code === 2) {
      return 'Device GPS signal unavailable. Enable Location / High-Accuracy GPS in your phone settings and step near an open window or doorway.';
    }
    if (err.code === 3) {
      return 'Device GPS lock timed out before satellites responded. Tap "Refresh GPS" outdoors or near a window.';
    }
  }
  return err.message || 'Unable to read device GPS coordinates.';
}

function buildFixFromPosition(pos: GeolocationPosition, sampleCount: number): DeviceGpsFix | null {
  const { latitude, longitude, accuracy, altitude, heading, speed } = pos.coords;
  if (!isValidCoordinatePair(latitude, longitude)) {
    return null;
  }
  const roundedAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? Math.round(accuracy) : 100;
  return {
    lat: parseFloat(latitude.toFixed(6)),
    lng: parseFloat(longitude.toFixed(6)),
    accuracy: roundedAccuracy,
    altitude: typeof altitude === 'number' && Number.isFinite(altitude) ? Math.round(altitude) : null,
    heading: typeof heading === 'number' && Number.isFinite(heading) ? Math.round(heading) : null,
    speed: typeof speed === 'number' && Number.isFinite(speed) ? Number(speed.toFixed(2)) : null,
    capturedAtMs: Date.now(),
    sampleCount,
    providerQuality: classifyGpsAccuracy(roundedAccuracy),
  };
}

/**
 * Fetches exact client-side GPS coordinates directly from the trainee/admin device
 * via `navigator.geolocation.watchPosition` progressive satellite lock.
 *
 * Why `watchPosition` instead of single-shot `getCurrentPosition`?
 * Browsers often emit a coarse Wi-Fi / ISP IP estimate (accuracy 500m-15000m) first
 * before the device's GPS chip finishes acquiring satellites (accuracy 5m-35m).
 * Waiting briefly for a refined fix prevents false "Outside Campus" errors.
 */
export function acquireExactDeviceGps(
  options: AcquireDeviceGpsOptions = {}
): Promise<DeviceGpsFix> {
  const {
    targetAccuracyMeters = 30,
    minListenMs = 1000,
    maxListenMs = 8500,
    signal,
    onProgress,
  } = options;

  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(
        new Error(
          'Browser blocked device GPS because this page is not running in a secure HTTPS context.'
        )
      );
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation API is not supported by your browser or device.'));
      return;
    }

    if (signal?.aborted) {
      reject(new Error('GPS acquisition cancelled.'));
      return;
    }

    const startedAt = Date.now();
    let settled = false;
    let watchId: number | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;
    let minTimer: ReturnType<typeof setTimeout> | null = null;
    let sampleCount = 0;
    let bestFix: DeviceGpsFix | null = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (maxTimer !== null) {
        clearTimeout(maxTimer);
        maxTimer = null;
      }
      if (minTimer !== null) {
        clearTimeout(minTimer);
        minTimer = null;
      }
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
    };

    const finishWithBest = () => {
      if (settled) return;
      if (bestFix) {
        settled = true;
        cleanup();
        resolve(bestFix);
      }
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const handleAbort = () => {
      fail(new Error('GPS acquisition cancelled.'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    const shouldUpdateBest = (candidate: DeviceGpsFix, current: DeviceGpsFix | null): boolean => {
      if (!current) return true;
      // Prefer significantly better precision (smaller accuracy radius)
      if (candidate.accuracy <= current.accuracy) return true;
      // Or if current was coarse and candidate is within reasonable margin and fresher
      if (current.accuracy > 500 && candidate.accuracy <= current.accuracy * 1.1) return true;
      return false;
    };

    // Stop listening after maxListenMs if we already obtained at least one valid fix
    maxTimer = setTimeout(() => {
      if (settled) return;
      if (bestFix) {
        finishWithBest();
      }
    }, maxListenMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        sampleCount += 1;
        const candidate = buildFixFromPosition(pos, sampleCount);
        if (!candidate) return;

        if (shouldUpdateBest(candidate, bestFix)) {
          bestFix = candidate;
        } else if (bestFix) {
          bestFix = { ...bestFix, sampleCount };
        }

        const currentBest = bestFix!;
        const elapsed = Date.now() - startedAt;

        if (currentBest.providerQuality === 'device_gps') {
          onProgress?.(
            currentBest,
            `Locked device GPS (±${currentBest.accuracy}m)`
          );
        } else if (currentBest.providerQuality === 'wifi_assisted') {
          onProgress?.(
            currentBest,
            `Refining device GPS signal (±${currentBest.accuracy}m)...`
          );
        } else {
          onProgress?.(
            currentBest,
            `Waiting for hardware GPS lock (currently coarse ±${currentBest.accuracy}m)...`
          );
        }

        // Resolve early if we achieved satellite-grade GPS accuracy
        if (currentBest.accuracy <= targetAccuracyMeters) {
          if (elapsed >= minListenMs) {
            finishWithBest();
          } else if (!minTimer) {
            minTimer = setTimeout(() => {
              finishWithBest();
            }, Math.max(0, minListenMs - elapsed));
          }
        }
      },
      (geoErr) => {
        if (settled) return;
        // If we already captured a partial reading, return it instead of discarding
        if (bestFix && geoErr.code !== 1) {
          finishWithBest();
          return;
        }
        if (geoErr.code === 1) {
          fail(new Error(formatGeolocationErrorMessage(geoErr)));
          return;
        }

        // Fallback single-shot high-accuracy probe for browsers where watchPosition stalls
        cleanup();
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (settled) return;
            const fix = buildFixFromPosition(pos, sampleCount + 1);
            if (!fix) {
              fail(new Error('Device returned empty GPS coordinates (0, 0).'));
              return;
            }
            settled = true;
            resolve(fix);
          },
          (fallbackErr) => {
            fail(new Error(formatGeolocationErrorMessage(fallbackErr)));
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: Math.max(20000, maxListenMs + 5000),
        maximumAge: 0,
      }
    );
  });
}
