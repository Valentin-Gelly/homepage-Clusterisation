import matomoProxyHandler from "./proxy";

const widget = {
  api: "{url}/index.php?module=API&format=JSON&idSite={siteid}&period={period}&date={date}",
  proxyHandler: matomoProxyHandler,

  mappings: {
    "VisitsSummary.get": { endpoint: "VisitsSummary.get" },
    "Actions.get": { endpoint: "Actions.get" },
    "VisitFrequency.get": { endpoint: "VisitFrequency.get" },
    "Referrers.get": { endpoint: "Referrers.get" },
    "Goals.get": { endpoint: "Goals.get" },
    "Live.getCounters": { endpoint: "Live.getCounters" },
  },
};

export default widget;
