import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_HK_LOCATION = { latitude: 22.3193, longitude: 114.1694 };
const isValidHongKongBusNumber = (value) => /^[A-Za-z]{0,2}[0-9]{1,3}[A-Za-z]{0,2}$/.test(value);

const formatArrivalTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

const getHongKongCurrentMinutes = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
};

const formatTimeLeft = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const arrivalMinutes = hours * 60 + minutes;
  const diffMinutes = arrivalMinutes - getHongKongCurrentMinutes();

  if (diffMinutes <= 0) {
    return 'Due now';
  }

  const hoursLeft = Math.floor(diffMinutes / 60);
  const minutesLeft = diffMinutes % 60;

  if (hoursLeft === 0) {
    return `${minutesLeft} min`;
  }

  return minutesLeft === 0 ? `${hoursLeft} hr` : `${hoursLeft} hr ${minutesLeft} min`;
};

function App() {
  const [busNumber, setBusNumber] = useState('');
  const [arrivals, setArrivals] = useState([]);
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

  const mapNodeRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

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
    const leaflet = window.L;
    if (!isMapOpen || !leaflet || !mapNodeRef.current || mapInstanceRef.current) {
      return;
    }

    const map = leaflet.map(mapNodeRef.current).setView(
      [DEFAULT_HK_LOCATION.latitude, DEFAULT_HK_LOCATION.longitude],
      12
    );

    leaflet
      .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      })
      .addTo(map);

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
  }, [isMapOpen]);

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
      setNearestStopInfo(null);
      setOperator('');
      return;
    }

    if (!isValidHongKongBusNumber(trimmedBusNumber)) {
      setError('That does not look like a Hong Kong bus route number. Please try values like 8, 88, or 8P.');
      setArrivals([]);
      setNearestStopInfo(null);
      setOperator('');
      return;
    }

    if (!latitude || !longitude) {
      setError('Please detect your device location or choose your location on the map first.');
      setArrivals([]);
      setNearestStopInfo(null);
      setOperator('');
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
      setNearestStopInfo(data.nearestStop || null);
      setOperator(data.operator || '');
    } catch (err) {
      console.error('Error fetching bus arrivals:', err);

      if (err && err.name === 'AbortError') {
        setError('Sorry. Service is unavailable.');
      } else {
        setError(err.message || 'Failed to fetch bus arrival data');
      }

      setNearestStopInfo(null);
      setOperator('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-2xl mx-auto p-4 font-sans">
      <div className="mb-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-slate-900">Vibe Bus Arrival</h1>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium tracking-[0.15em] text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:shrink-0">
            <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">HK</span>
            <span className="text-slate-800">{hongKongTime}</span>
          </div>
        </div>
        <p className="mt-3 text-slate-600">Choose your route and location to check the next 3 arrivals</p>
      </div>

      <div className="rounded-[28px] border border-slate-300 bg-white/92 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-sm space-y-4">
        <form onSubmit={fetchArrivals} className="flex flex-col gap-3">
          <label htmlFor="bus-number" className="text-sm font-medium text-slate-700">
            Bus Number
          </label>
          <input
            id="bus-number"
            type="text"
            value={busNumber}
            onChange={(e) => setBusNumber(e.target.value)}
            placeholder="Enter route like 8, 88, or 8P"
            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            disabled={loading}
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            <p className="text-sm text-slate-700 whitespace-nowrap">Your GPS Location</p>
            <input
              type="text"
              value={latitude}
              onChange={(e) => {
                setLatitude(e.target.value);
                setNearestStopLabel('');
              }}
              placeholder="Latitude"
              className="w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:bg-white"
              disabled={loading}
            />
            <input
              type="text"
              value={longitude}
              onChange={(e) => {
                setLongitude(e.target.value);
                setNearestStopLabel('');
              }}
              placeholder="Longitude"
              className="w-full min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:bg-white"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleDetectLocation}
              className="w-full shrink-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 lg:w-auto"
              disabled={locating || loading}
            >
              {locating ? 'Detecting...' : 'Detect Location'}
            </button>
          </div>

          {latitude && longitude && (
            <div className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              Location selected: {nearestStopLabel || 'Nearest stop pending'}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex-1 rounded-2xl border border-slate-300 bg-slate-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-700">Pick location from map</p>
                <button
                  type="button"
                  onClick={() => setIsMapOpen(true)}
                  className="rounded-xl border border-slate-400 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-100"
                  disabled={loading}
                >
                  Open Map
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Tap a point on the map to select location. The map window will close automatically.
              </p>
            </div>

            <button
              type="submit"
              className="min-h-[5.5rem] w-full rounded-2xl bg-slate-950 px-6 py-3 text-[15px] font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-300 sm:w-28 sm:self-stretch"
              disabled={loading || !busNumber.trim()}
            >
              {loading ? <span className="animate-spin">Searching...</span> : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      )}

      {arrivals.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-800">Next Arrivals</h2>
          {nearestStopInfo && (
            <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              {operator && <p className="mb-1 font-medium">Operator: {operator}</p>}
              <p className="font-medium">Nearest Stop: {nearestStopInfo.stopNameEn || nearestStopInfo.stopNameTc}</p>
              <p className="text-sky-700">Distance: {nearestStopInfo.distanceKm} km</p>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Bus Number</th>
                  <th className="px-4 py-3 font-medium">Time Left</th>
                  <th className="px-4 py-3 font-medium">Arrival Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arrivals.map((time, index) => (
                  <tr key={index} className="text-slate-700">
                    <td className="px-4 py-3 font-medium">{operator || '-'}</td>
                    <td className="px-4 py-3">{busNumber.trim().toUpperCase()}</td>
                    <td className="px-4 py-3">{formatTimeLeft(time)}</td>
                    <td className="px-4 py-3">{formatArrivalTime(time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="h-[75vh] w-[75vw] max-w-none rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
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
            <div ref={mapNodeRef} className="h-[calc(75vh-9rem)] w-full rounded-2xl border border-slate-200" />
            <p className="mt-3 text-sm text-slate-500">Click on the map to confirm location and close this window.</p>
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-sm text-gray-400">
        <p>Designed for Hong Kong commuters &copy; {new Date().getFullYear()}</p>
      </div>
    </div>

    </div>
  );
}

export default App;