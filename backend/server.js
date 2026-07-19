require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret';
const STOP_CACHE_TTL_MS = 5 * 60 * 1000;

const stopCache = {
  kmb: { fetchedAt: 0, data: [] },
  ctb: { fetchedAt: 0, data: [] },
};

app.use(cors());
app.use(express.json());

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { demo: true };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function isValidHongKongBusNumber(value) {
  return /^[A-Za-z]{0,2}[0-9]{1,3}[A-Za-z]{0,2}$/.test(value);
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatEtaToHHmm(isoDateTime) {
  const etaDate = new Date(isoDateTime);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(etaDate);
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${url}`);
    }
    return response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error('UPSTREAM_TIMEOUT');
      timeoutError.code = 'UPSTREAM_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getKmbStopsCached() {
  const now = Date.now();
  if (now - stopCache.kmb.fetchedAt < STOP_CACHE_TTL_MS && stopCache.kmb.data.length > 0) {
    return stopCache.kmb.data;
  }

  const response = await fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/stop/');
  stopCache.kmb = {
    fetchedAt: now,
    data: response.data || [],
  };
  return stopCache.kmb.data;
}

async function getCitybusStopsCached() {
  const now = Date.now();
  if (now - stopCache.ctb.fetchedAt < STOP_CACHE_TTL_MS && stopCache.ctb.data.length > 0) {
    return stopCache.ctb.data;
  }

  try {
    const response = await fetchJson('https://rt.data.gov.hk/v2/transport/citybus/stop');
    stopCache.ctb = {
      fetchedAt: now,
      data: response.data || [],
    };
  } catch (error) {
    // Citybus does not always expose a bulk stop endpoint; keep service available using KMB stop data.
    stopCache.ctb = {
      fetchedAt: now,
      data: [],
    };
  }

  return stopCache.ctb.data;
}

async function findNearestAnyStop(userLat, userLng) {
  const [kmbStops, citybusStops] = await Promise.all([
    getKmbStopsCached(),
    getCitybusStopsCached(),
  ]);

  let nearest = null;

  for (const stop of kmbStops) {
    const stopLat = Number(stop.lat);
    const stopLng = Number(stop.long);
    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng)) {
      continue;
    }

    const distanceKm = haversineDistanceKm(userLat, userLng, stopLat, stopLng);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        operator: 'KMB',
        stopId: stop.stop,
        stopNameEn: stop.name_en,
        stopNameTc: stop.name_tc,
        distanceKm,
      };
    }
  }

  for (const stop of citybusStops) {
    const stopLat = Number(stop.lat);
    const stopLng = Number(stop.long);
    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng)) {
      continue;
    }

    const distanceKm = haversineDistanceKm(userLat, userLng, stopLat, stopLng);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = {
        operator: 'CTB',
        stopId: stop.stop,
        stopNameEn: stop.name_en,
        stopNameTc: stop.name_tc,
        distanceKm,
      };
    }
  }

  return nearest;
}

async function findNearestKmbStopForRoute(route, userLat, userLng) {
  const [routeList, routeStopList, stopList] = await Promise.all([
    fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/route/'),
    fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/route-stop/'),
    fetchJson('https://data.etabus.gov.hk/v1/transport/kmb/stop/'),
  ]);

  const matchingRoutes = routeList.data.filter(
    (item) => String(item.route).toUpperCase() === route
  );

  if (matchingRoutes.length === 0) {
    return null;
  }

  const stopMap = new Map(
    stopList.data.map((stop) => [stop.stop, stop])
  );

  let nearestCandidate = null;

  for (const routeItem of matchingRoutes) {
    const relevantRouteStops = routeStopList.data.filter(
      (routeStop) =>
        routeStop.route === routeItem.route &&
        routeStop.bound === routeItem.bound &&
        String(routeStop.service_type) === String(routeItem.service_type)
    );

    for (const routeStop of relevantRouteStops) {
      const stop = stopMap.get(routeStop.stop);
      if (!stop) {
        continue;
      }

      const stopLat = Number(stop.lat);
      const stopLng = Number(stop.long);
      if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng)) {
        continue;
      }

      const distanceKm = haversineDistanceKm(userLat, userLng, stopLat, stopLng);

      if (!nearestCandidate || distanceKm < nearestCandidate.distanceKm) {
        nearestCandidate = {
          stopId: stop.stop,
          stopNameEn: stop.name_en,
          stopNameTc: stop.name_tc,
          route: routeItem.route,
          bound: routeItem.bound,
          serviceType: routeItem.service_type,
          distanceKm,
        };
      }
    }
  }

  return nearestCandidate;
}

async function getUpcomingKmbEtas(nearestStopInfo) {
  const route = nearestStopInfo.route;
  const stopId = nearestStopInfo.stopId;
  const serviceType = nearestStopInfo.serviceType;

  const etaData = await fetchJson(
    `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/${serviceType}`
  );

  const now = new Date();
  const upcoming = etaData.data
    .filter(
      (item) =>
        item.eta &&
        String(item.service_type) === String(serviceType)
    )
    .map((item) => ({
      etaDate: new Date(item.eta),
      etaRaw: item.eta,
    }))
    .filter((item) => item.etaDate > now)
    .sort((a, b) => a.etaDate - b.etaDate)
    .slice(0, 3)
    .map((item) => formatEtaToHHmm(item.etaRaw));

  return upcoming;
}

async function getCitybusStop(stopId, cache) {
  if (cache.has(stopId)) {
    return cache.get(stopId);
  }

  const stopResponse = await fetchJson(
    `https://rt.data.gov.hk/v2/transport/citybus/stop/${stopId}`
  );

  const stop = stopResponse.data;
  cache.set(stopId, stop);
  return stop;
}

async function findNearestCitybusStopForRoute(route, userLat, userLng) {
  const routeResponse = await fetchJson(
    'https://rt.data.gov.hk/v2/transport/citybus/route/CTB'
  );

  const matchingRoutes = routeResponse.data.filter(
    (item) => String(item.route).toUpperCase() === route
  );

  if (matchingRoutes.length === 0) {
    return null;
  }

  const stopCache = new Map();
  let nearestCandidate = null;

  const directionConfigs = [
    { dirCode: 'O', dirPath: 'outbound' },
    { dirCode: 'I', dirPath: 'inbound' },
  ];

  for (const directionConfig of directionConfigs) {
    const dirCode = directionConfig.dirCode;
    const dirPath = directionConfig.dirPath;
    const routeStopResponse = await fetchJson(
      `https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route}/${dirPath}`
    );

    for (const routeStop of routeStopResponse.data) {
      const stop = await getCitybusStop(routeStop.stop, stopCache);
      const stopLat = Number(stop.lat);
      const stopLng = Number(stop.long);

      if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng)) {
        continue;
      }

      const distanceKm = haversineDistanceKm(userLat, userLng, stopLat, stopLng);

      if (!nearestCandidate || distanceKm < nearestCandidate.distanceKm) {
        nearestCandidate = {
          stopId: stop.stop,
          stopNameEn: stop.name_en,
          stopNameTc: stop.name_tc,
          route,
          dirCode,
          distanceKm,
        };
      }
    }
  }

  return nearestCandidate;
}

async function getUpcomingCitybusEtas(nearestStopInfo) {
  const etaResponse = await fetchJson(
    `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${nearestStopInfo.stopId}/${nearestStopInfo.route}`
  );

  const now = new Date();
  const upcoming = etaResponse.data
    .filter(
      (item) =>
        item.eta &&
        String(item.route).toUpperCase() === nearestStopInfo.route &&
        item.dir === nearestStopInfo.dirCode
    )
    .map((item) => ({
      etaDate: new Date(item.eta),
      etaRaw: item.eta,
    }))
    .filter((item) => item.etaDate > now)
    .sort((a, b) => a.etaDate - b.etaDate)
    .slice(0, 3)
    .map((item) => formatEtaToHHmm(item.etaRaw));

  return upcoming;
}

app.get('/api/hello', authenticateToken, (req, res) => {
  res.json({ message: 'Hello from Express API!', user: req.user });
});

app.get('/api/nearest-stop', authenticateToken, async (req, res) => {
  const lat = Number(req.query.latitude);
  const lng = Number(req.query.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: 'Please provide a valid GPS location from your device or map selection.',
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: 'The GPS location is out of range. Please choose a valid location.',
    });
  }

  try {
    const nearestStop = await findNearestAnyStop(lat, lng);
    if (!nearestStop) {
      return res.status(404).json({ error: 'No bus stop found near your location.' });
    }

    return res.json({
      operator: nearestStop.operator,
      nearestStop: {
        stopId: nearestStop.stopId,
        stopNameEn: nearestStop.stopNameEn,
        stopNameTc: nearestStop.stopNameTc,
        distanceKm: Number(nearestStop.distanceKm.toFixed(3)),
      },
    });
  } catch (error) {
    console.error('Error while finding nearest stop:', error);
    return res.status(502).json({
      error: 'Failed to retrieve nearest stop information. Please try again shortly.',
    });
  }
});

app.get('/api/bus-arrivals', authenticateToken, async (req, res) => {
  const { busNumber, latitude, longitude } = req.query;
  const normalizedBusNumber = String(busNumber || '').trim().toUpperCase();
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!normalizedBusNumber) {
    return res.status(400).json({ error: 'Please enter a bus number to check the next arrivals.' });
  }

  if (!isValidHongKongBusNumber(normalizedBusNumber)) {
    return res.status(400).json({
      error: 'That does not look like a Hong Kong bus route number. Please try values like 8, 88, or 8P.',
    });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({
      error: 'Please provide a valid GPS location from your device or map selection.',
    });
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: 'The GPS location is out of range. Please choose a valid location.',
    });
  }

  try {
    let nearestStop = await findNearestKmbStopForRoute(normalizedBusNumber, lat, lng);
    let operator = 'KMB';
    let arrivalTimes = [];

    if (nearestStop) {
      arrivalTimes = await getUpcomingKmbEtas(nearestStop);
    }

    if (!nearestStop || arrivalTimes.length === 0) {
      const citybusNearestStop = await findNearestCitybusStopForRoute(
        normalizedBusNumber,
        lat,
        lng
      );

      if (citybusNearestStop) {
        nearestStop = citybusNearestStop;
        operator = 'CTB';
        arrivalTimes = await getUpcomingCitybusEtas(citybusNearestStop);
      }
    }

    if (!nearestStop) {
      return res.status(404).json({
        error: `No route data found for ${normalizedBusNumber} in KMB or Citybus.`,
      });
    }

    if (arrivalTimes.length === 0) {
      return res.status(404).json({
        error: `No upcoming arrivals found for route ${normalizedBusNumber} at the nearest stop.`,
      });
    }

    return res.json({
      busNumber: normalizedBusNumber,
      operator,
      arrivalTimes,
      nearestStop: {
        stopId: nearestStop.stopId,
        stopNameEn: nearestStop.stopNameEn,
        stopNameTc: nearestStop.stopNameTc,
        distanceKm: Number(nearestStop.distanceKm.toFixed(3)),
      },
    });
  } catch (error) {
    console.error('Error while fetching nearest bus stop arrivals:', error);

    if (error && error.code === 'UPSTREAM_TIMEOUT') {
      return res.status(503).json({
        error: 'Sorry. Service is unavailable.',
      });
    }

    return res.status(502).json({
      error: 'Failed to retrieve live ETA data from transport provider. Please try again shortly.',
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});