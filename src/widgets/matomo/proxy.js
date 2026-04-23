import getServiceWidget from "utils/config/service-helpers";
import createLogger from "utils/logger";
import { sanitizeErrorURL } from "utils/proxy/api-helpers";
import { httpProxy } from "utils/proxy/http";
import validateWidgetData from "utils/proxy/validate-widget-data";
import widgets from "widgets/widgets";

const logger = createLogger("matomoProxyHandler");

export default async function matomoProxyHandler(req, res, map) {
  const { group, service, endpoint, index } = req.query;

  if (!group || !service) {
    return res.status(400).json({ error: "Invalid proxy service type" });
  }

  const widget = await getServiceWidget(group, service, index);

  if (!widgets?.[widget.type]?.api) {
    return res.status(403).json({ error: "Service does not support API calls" });
  }

  // Construction de l'URL de base (sans token_auth)
  const baseUrl = widgets[widget.type].api
    .replace("{url}", widget.url)
    .replace("{siteid}", widget.siteid)
    .replace("{period}", widget.period ?? "day")
    .replace("{date}", widget.date ?? "today")
    .replace(/(?<=\?.*)\?/g, "&");

  const url = new URL(baseUrl);

  // Le method= (endpoint Matomo) est passé en query param, pas en body
  url.searchParams.set("method", endpoint);

  // Body POST : token_auth uniquement → jamais exposé en URL
  const body = new URLSearchParams();
  body.append("token_auth", widget.key);

  // Paramètres spécifiques à certains endpoints
  if (endpoint === "Live.getCounters") {
    url.searchParams.set("lastMinutes", widget.lastMinutes ?? "30");
  }
  if (endpoint === "Goals.get" && widget.idgoal !== undefined) {
    url.searchParams.set("idGoal", widget.idgoal);
  }

  const [status, contentType, data] = await httpProxy(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  let resultData = data;

  if (status === 200) {
    if (!validateWidgetData(widget, endpoint, resultData)) {
      return res.status(status).json({
        error: { message: "Invalid data", url: sanitizeErrorURL(url), data: resultData },
      });
    }
    if (map) resultData = map(resultData);
  }

  if (contentType) res.setHeader("Content-Type", contentType);
  if (status === 204 || status === 304) return res.status(status).end();

  if (status >= 400) {
    logger.debug("HTTP Error %d calling %s", status, sanitizeErrorURL(url));
    return res.status(status).json({
      error: {
        message: "HTTP Error",
        url: sanitizeErrorURL(url),
        data: Buffer.isBuffer(resultData) ? Buffer.from(resultData).toString() : resultData,
      },
    });
  }

  return res.status(status).send(resultData);
}
