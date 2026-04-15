import stravaProxyHandler from "./proxy";

const widget = {
  api: "https://www.strava.com/api/v3/{endpoint}",
  proxyHandler: stravaProxyHandler,
  mappings: {
    athlete: {
      endpoint: "athlete",
    },
    activities: {
      endpoint: "athlete/activities",
    },
  },
};

export default widget;