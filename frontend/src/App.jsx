import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_HK_LOCATION = { latitude: 22.3193, longitude: 114.1694 };
const isValidHongKongBusNumber = (value) => /^[A-Za-z]{0,2}[0-9]{1,3}[A-Za-z]{0,2}$/.test(value);
const HKO_CURRENT_WEATHER_API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en';

const HKO_WEATHER_ICON_LABELS = {
  50: 'Sunny',
  51: 'Sunny periods',
  52: 'Sunny intervals',
  53: 'Sunny periods with a few showers',
  54: 'Sunny intervals with showers',
  60: 'Cloudy',
  61: 'Overcast',
  62: 'Light rain',
  63: 'Rain',
  64: 'Heavy rain',
  65: 'Thunderstorms',
  70: 'Fine',
  71: 'Mainly fine',
  72: 'Mainly cloudy',
  73: 'Cloudy',
  74: 'Foggy',
  75: 'Mist',
  76: 'Light rain',
  77: 'Rain',
  80: 'Windy',
  81: 'Dry',
  82: 'Humid',
  83: 'Hot',
  84: 'Cold',
  85: 'Sandstorm',
  90: 'Very hot',
  91: 'Warm',
  92: 'Cool',
  93: 'Cold',
};

const HKO_TEMPERATURE_STATION_COORDS = {
  "King's Park": { lat: 22.3119, lng: 114.1746 },
  'Hong Kong Observatory': { lat: 22.3019, lng: 114.1741 },
  'Wong Chuk Hang': { lat: 22.2475, lng: 114.1737 },
  'Ta Kwu Ling': { lat: 22.5283, lng: 114.1578 },
  'Lau Fau Shan': { lat: 22.4688, lng: 113.9836 },
  'Tai Po': { lat: 22.4497, lng: 114.1694 },
  'Sha Tin': { lat: 22.3833, lng: 114.1833 },
  'Tuen Mun': { lat: 22.3917, lng: 113.9778 },
  'Tseung Kwan O': { lat: 22.3119, lng: 114.2589 },
  'Sai Kung': { lat: 22.3814, lng: 114.2708 },
  'Cheung Chau': { lat: 22.2089, lng: 114.0289 },
  'Chek Lap Kok': { lat: 22.308, lng: 113.9185 },
  'Tsing Yi': { lat: 22.3571, lng: 114.1291 },
  'Tsuen Wan Ho Koon': { lat: 22.3838, lng: 114.1077 },
  'Tsuen Wan Shing Mun Valley': { lat: 22.375, lng: 114.1181 },
  'Hong Kong Park': { lat: 22.2782, lng: 114.1621 },
  'Shau Kei Wan': { lat: 22.2806, lng: 114.2251 },
  'Kowloon City': { lat: 22.3282, lng: 114.1916 },
  'Happy Valley': { lat: 22.2693, lng: 114.1848 },
  'Wong Tai Sin': { lat: 22.342, lng: 114.1953 },
  'Stanley': { lat: 22.2194, lng: 114.2136 },
  'Kwun Tong': { lat: 22.31, lng: 114.231 },
  'Sham Shui Po': { lat: 22.3307, lng: 114.1622 },
  'Kai Tak Runway Park': { lat: 22.3071, lng: 114.2145 },
  'Yuen Long Park': { lat: 22.4416, lng: 114.0226 },
  'Tai Mei Tuk': { lat: 22.4757, lng: 114.2378 },
};

const toRadians = (value) => (value * Math.PI) / 180;

const getDistanceInKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const getNearestTemperatureStation = (lat, lng, temperatureData) => {
  const stationCandidates = (temperatureData || [])
    .map((item) => {
      const stationCoords = HKO_TEMPERATURE_STATION_COORDS[item.place];
      if (!stationCoords || !Number.isFinite(item.value)) {
        return null;
      }

      return {
        ...item,
        distanceKm: getDistanceInKm(lat, lng, stationCoords.lat, stationCoords.lng),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return stationCandidates[0] || null;
};

const formatArrivalTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

const getHongKongCurrentMinutes = () => {
  const nowParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(nowParts.find((part) => part.type === 'hour')?.value);
  const minute = Number(nowParts.find((part) => part.type === 'minute')?.value);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
};

const formatTimeLeft = (timeString) => {
  const [arrivalHour, arrivalMinute] = timeString.split(':').map(Number);
  if (!Number.isFinite(arrivalHour) || !Number.isFinite(arrivalMinute)) {
    return '-';
  }

  const currentMinutes = getHongKongCurrentMinutes();
  if (currentMinutes === null) {
    return '-';
  }

  const arrivalMinutes = arrivalHour * 60 + arrivalMinute;
  let minutesLeft = arrivalMinutes - currentMinutes;

  // Treat nearby negative values as expired entries, but allow true cross-midnight services.
  if (minutesLeft < 0 && minutesLeft <= -720) {
    minutesLeft += 24 * 60;
  }

  return minutesLeft < 0 ? 'Expired' : minutesLeft === 0 ? 'Due' : `${minutesLeft} min`;
};

function App() {
  const [busNumber, setBusNumber] = useState('');
  const [arrivals, setArrivals] = useState([]);
  const [resultBusNumber, setResultBusNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [hongKongTime, setHongKongTime] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [nearestStopInfo, setNearestStopInfo] = useState(null);
  const [nearestStopLabel, setNearestStopLabel] = useState('');
  const [operator, setOperator] = useState('');
  const [nextStopName, setNextStopName] = useState('');
  const [prefetchedLocation, setPrefetchedLocation] = useState(null);
  const [weatherSummary, setWeatherSummary] = useState('Loading weather...');

  const mapNodeRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const busNumberInputRef = useRef(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hkDate = new Intl.DateTimeFormat('en-HK', {
        timeZone: 'Asia/Hong_Kong',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(now);

      setHongKongTime(hkDate);
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isMapOpen
      ) {
        return;
      }

      const activeElement = document.activeElement;
      const tagName = activeElement?.tagName?.toLowerCase();
      const isTypingField =
        activeElement?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';

      if (isTypingField) {
        return;
      }

      event.preventDefault();
      busNumberInputRef.current?.focus();
      busNumberInputRef.current?.select();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMapOpen]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchWeather = async () => {
      const latValue = Number(latitude);
      const lngValue = Number(longitude);
      const hasUserLocation = Number.isFinite(latValue) && Number.isFinite(lngValue);

      try {
        const response = await fetch(HKO_CURRENT_WEATHER_API, { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Weather API unavailable');
        }

        const data = await response.json();
        const temperatureData = data?.temperature?.data || [];
        const fallbackStation =
          temperatureData.find((item) => item.place === 'Hong Kong Observatory' && Number.isFinite(item.value)) ||
          temperatureData.find((item) => Number.isFinite(item.value)) ||
          null;

        const nearestStation = hasUserLocation
          ? getNearestTemperatureStation(latValue, lngValue, temperatureData) || fallbackStation
          : fallbackStation;

        const iconCode = Array.isArray(data?.icon) ? data.icon[0] : null;
        const weatherText = HKO_WEATHER_ICON_LABELS[iconCode] || 'Current conditions';
        const humidity = data?.humidity?.data?.[0]?.value;
        const humidityText = Number.isFinite(humidity) ? `Humidity ${humidity}%` : null;
        const temperatureText = nearestStation
          ? `${nearestStation.value}${nearestStation.unit === 'C' ? '°C' : nearestStation.unit || ''}`
          : null;

        const summaryParts = [weatherText];
        if (temperatureText) {
          summaryParts.push(`${temperatureText}`);
        }
        if (humidityText) {
          summaryParts.push(humidityText);
        }

        setWeatherSummary(summaryParts.join(' | '));
      } catch (err) {
        if (err?.name === 'AbortError') {
          return;
        }
        setWeatherSummary('Weather information temporarily unavailable');
      }
    };

    fetchWeather();

    return () => controller.abort();
  }, [latitude, longitude]);

  useEffect(() => {
    const leaflet = window.L;
    if (!isMapOpen || !leaflet || !mapNodeRef.current || mapInstanceRef.current) {
      return;
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const hasInputLocation = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);

    const initialLatitude = hasInputLocation
      ? parsedLatitude
      : prefetchedLocation?.latitude ?? DEFAULT_HK_LOCATION.latitude;
    const initialLongitude = hasInputLocation
      ? parsedLongitude
      : prefetchedLocation?.longitude ?? DEFAULT_HK_LOCATION.longitude;
    const initialZoom = prefetchedLocation ? 17 : hasInputLocation ? 15 : 12;

    const map = leaflet.map(mapNodeRef.current).setView([initialLatitude, initialLongitude], initialZoom);

    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      })
      .addTo(map);

    if (hasInputLocation || prefetchedLocation) {
      markerRef.current = leaflet.marker([initialLatitude, initialLongitude]).addTo(map);
    }

    map.on('click', (event) => {
      const { lat, lng } = event.latlng;
      setLatitude(lat.toFixed(6));
      setLongitude(lng.toFixed(6));
      updateNearestStopByLocation(lat, lng);

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = leaflet.marker([lat, lng]).addTo(map);
      }

      setIsMapOpen(false);
    });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isMapOpen, latitude, longitude, prefetchedLocation]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setPrefetchedLocation({ latitude: lat, longitude: lng });
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
      },
      () => {
        setPrefetchedLocation(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const updateNearestStopByLocation = async (latValue, lngValue) => {
    setNearestStopLabel('Loading nearest stop...');
    try {
      const params = new URLSearchParams({
        latitude: String(latValue),
        longitude: String(lngValue),
      });
      const response = await fetch(`/api/nearest-stop?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to find nearest stop.');
      }

      const stopName = data.nearestStop?.stopNameEn || data.nearestStop?.stopNameTc || '';
      setNearestStopLabel(stopName || 'Nearest stop not available');
    } catch (err) {
      setNearestStopLabel('Nearest stop not available');
    }
  };

  useEffect(() => {
    if (!latitude || !longitude) {
      return;
    }

    const latValue = Number(latitude);
    const lngValue = Number(longitude);
    if (!Number.isFinite(latValue) || !Number.isFinite(lngValue)) {
      return;
    }

    updateNearestStopByLocation(latValue, lngValue);
  }, [latitude, longitude]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Your browser does not support device location detection.');
      return;
    }

    setLocating(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        updateNearestStopByLocation(lat, lng);

        if (window.L && mapInstanceRef.current) {
          mapInstanceRef.current.setView([lat, lng], 15);
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            markerRef.current = window.L.marker([lat, lng]).addTo(mapInstanceRef.current);
          }
        }

        setLocating(false);
      },
      () => {
        setError('Unable to detect your location. Please allow GPS or pick a point on the map.');
        setNearestStopLabel('');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchArrivals = async (event) => {
    event?.preventDefault();

    const trimmedBusNumber = busNumber.trim().toUpperCase();
    if (!trimmedBusNumber) {
      setError('Please enter a bus number to check the next arrivals.');
      setArrivals([]);
      setResultBusNumber('');
      setNearestStopInfo(null);
      setOperator('');
      setNextStopName('');
      return;
    }

    if (!isValidHongKongBusNumber(trimmedBusNumber)) {
      setError('That does not look like a Hong Kong bus route number. Please try values like 8, 88, or 8P.');
      setArrivals([]);
      setResultBusNumber('');
      setNearestStopInfo(null);
      setOperator('');
      setNextStopName('');
      return;
    }

    if (!latitude || !longitude) {
      setError('Please detect your device location or choose your location on the map first.');
      setArrivals([]);
      setResultBusNumber('');
      setNearestStopInfo(null);
      setOperator('');
      setNextStopName('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        busNumber: trimmedBusNumber,
        latitude,
        longitude,
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let response;

      try {
        response = await fetch(`/api/bus-arrivals?${params.toString()}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Network response was not ok');
      }
      const data = await response.json();
      setArrivals(data.arrivalTimes || []);
      setResultBusNumber(data.busNumber || trimmedBusNumber);
      setNearestStopInfo(data.nearestStop || null);
      setOperator(data.operator || '');
      setNextStopName(data.nextStopName || '');
    } catch (err) {
      console.error('Error fetching bus arrivals:', err);

      if (err && err.name === 'AbortError') {
        setError('Sorry. Service is unavailable.');
      } else {
        setError(err.message || 'Failed to fetch bus arrival data');
      }

      setNearestStopInfo(null);
      setResultBusNumber('');
      setOperator('');
      setNextStopName('');
    } finally {
      setLoading(false);
    }
  };

  const visibleArrivals = arrivals.filter((time) => formatTimeLeft(time) !== 'Expired');

  return (
    <div className="mx-auto w-[92vw] p-4 font-sans lg:w-[80vw]">
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Vibe Bus Arrival</h1>
          <div className="flex flex-col items-start gap-1 sm:items-end sm:shrink-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[13px] font-medium tracking-[0.15em] text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm">
              <span className="text-[14.3px] text-slate-800">{hongKongTime}</span>
            </div>
            <p className="max-w-[28rem] text-xs text-slate-600">{weatherSummary}</p>
          </div>
        </div>
        <p className="mt-3 text-gray-600">Choose your route and location to check the next 3 arrivals</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section className="rounded-[28px] border border-slate-300/80 bg-white/90 p-3 shadow-[16px_18px_36px_-14px_rgba(15,23,42,0.42)] backdrop-blur-sm space-y-4">
          <form onSubmit={fetchArrivals} className="flex flex-col gap-3">
            <label htmlFor="bus-number" className="text-sm font-medium text-slate-600">
              Bus Number
            </label>
            <input
              ref={busNumberInputRef}
              id="bus-number"
              type="text"
              value={busNumber}
              onChange={(e) => setBusNumber(e.target.value)}
              placeholder="Enter route like 8, 88, or 8P"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              disabled={loading}
            />

            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600">Your GPS Location</p>
              <div className="flex flex-1 min-w-[220px] items-center gap-2">
                <input
                  type="text"
                  value={latitude}
                  placeholder="Latitude"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                  disabled
                />
                <input
                  type="text"
                  value={longitude}
                  placeholder="Longitude"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                  disabled
                />
              </div>
              <button
                type="button"
                onClick={handleDetectLocation}
                className="sm:ml-auto rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                disabled={locating || loading}
              >
                {locating ? 'Detecting...' : 'Detect Location'}
              </button>
            </div>

            {latitude && longitude && (
              <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Location selected: {nearestStopLabel || 'Nearest stop pending'}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-stretch">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-600">Pick location from map</p>
                  <button
                    type="button"
                    onClick={() => setIsMapOpen(true)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
                    disabled={loading}
                  >
                    Open Map
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="h-full min-h-[52px] rounded-2xl bg-slate-900 px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:bg-slate-300 sm:min-w-[120px]"
                disabled={loading || !busNumber.trim()}
              >
                {loading ? <span className="animate-spin">Searching...</span> : 'Search'}
              </button>
            </div>
          </form>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
              {error}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-300/80 bg-white/90 p-4 shadow-[16px_18px_36px_-14px_rgba(15,23,42,0.42)] backdrop-blur-sm space-y-3 lg:min-h-[24rem]">
          <h2 className="text-xl font-semibold text-gray-800">Next Arrivals</h2>

          {visibleArrivals.length > 0 ? (
            <>
              {nearestStopInfo && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  {operator && <p className="mb-1 font-medium">Operator: {operator}</p>}
                  <p className="font-medium">Nearest Stop: {nearestStopInfo.stopNameEn || nearestStopInfo.stopNameTc}</p>
                  <p className="text-sky-700">Distance: {Math.round(nearestStopInfo.distanceKm * 1000)} m</p>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-3 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <span>Company</span>
                  <span>Bus Number</span>
                  <span>Arrives In</span>
                </div>
                <ol>
                  {visibleArrivals.map((time, index) => (
                    <li key={index} className="grid grid-cols-3 border-t border-slate-200 px-4 py-3 text-base text-slate-700">
                      <span className="font-medium">{operator || '-'}</span>
                      <span>
                        <span className="block">{resultBusNumber || busNumber.trim().toUpperCase() || '-'}</span>
                        {nextStopName && <span className="block text-[11.04px] text-slate-500">Next stop: {nextStopName}</span>}
                      </span>
                      <span>
                        <span className="block font-medium">{formatTimeLeft(time)}</span>
                        <span className="block text-xs text-slate-500">{formatArrivalTime(time)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500">
              Search a route on the left to view live arrival information here.
            </div>
          )}
        </section>
      </div>

      {isMapOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setIsMapOpen(false)}
        >
          <div
            className="h-[80vh] w-[80vw] max-w-none rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Choose Your Location</h3>
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            <div ref={mapNodeRef} className="h-[calc(80vh-9rem)] w-full rounded-2xl border border-slate-200" />
            <p className="mt-3 text-sm text-slate-500">Click on the map to confirm location and close this window.</p>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-sm text-gray-400">
        <p>Designed for Hong Kong commuters &copy; {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}

export default App;