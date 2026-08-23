let cachedTurnData = null;
let cachedTurnExpiresAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

async function fetchMeteredCredentials() {
  const apiKey = process.env.METERED_API_KEY;
  const domain = process.env.METERED_DOMAIN;
  if (!apiKey || !domain) {
    return null;
  }

  const response = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`, {
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    throw new Error(`Metered API responded with status: ${response.status}`);
  }
  const data = await response.json();
  if (Array.isArray(data) && data.length > 0) {
    cachedTurnData = data;
    cachedTurnExpiresAt = Date.now() + CACHE_TTL_MS;
    return data;
  }
  return null;
}

// Proactive warm-up at startup
fetchMeteredCredentials().catch(err => {
  console.warn(`[${new Date().toISOString()}] Initial TURN pre-fetch warning: ${err.message}`);
});

export const getHealthStatus = (req, res) => {
  res.json({
    status: 'ok',
    message: 'WebRTC Signaling Server Running!'
  });
};

export const getTurnCredentials = async (req, res) => {
  try {
    // Return from in-memory cache if valid
    if (cachedTurnData && Date.now() < cachedTurnExpiresAt) {
      res.set('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
      return res.json(cachedTurnData);
    }

    const data = await fetchMeteredCredentials();
    if (data) {
      res.set('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
      return res.json(data);
    }

    // Fallback to stale cache if available
    if (cachedTurnData) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(cachedTurnData);
    }

    return res.status(500).json({ error: 'Failed to fetch TURN credentials' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching TURN credentials:`, error.message);
    if (cachedTurnData) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(cachedTurnData);
    }
    res.status(500).json({ error: 'Failed to fetch TURN credentials' });
  }
};
