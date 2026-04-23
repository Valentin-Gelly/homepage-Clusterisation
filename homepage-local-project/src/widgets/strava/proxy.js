import { httpProxy } from "utils/proxy/http";
import { formatApiCall } from "utils/proxy/api-helpers";
import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";

const logger = createLogger("stravaProxyHandler");

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

export default async function stravaProxyHandler(req, res) {
  const { group, service, endpoint } = req.query;

  const widget = await getServiceWidget(group, service);
  const { client_id, client_secret, refresh_token } = widget;

  if (!client_id || !client_secret || !refresh_token) {
    return res.status(400).json({ error: "Missing Strava credentials in widget config" });
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(client_id, client_secret, refresh_token);
  } catch (e) {
    logger.error("Failed to refresh Strava token", e);
    return res.status(500).json({ error: "Token refresh failed" });
  }

  // Construire l'URL selon l'endpoint demandé
  let apiUrl = `https://www.strava.com/api/v3/${endpoint}`;
  if (endpoint === "athlete/activities") {
    apiUrl = "https://www.strava.com/api/v3/athlete/activities?per_page=5";
  }

  const [status, , data] = await httpProxy(apiUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (status !== 200) {
    logger.error(`Strava API error [${status}]`, { data: data?.toString() });
    return res.status(status).json({ error: "Strava API returned an error" });
  }

  return res.send(data);
}