/**
 * OpenTelemetry instrumentation for Homepage (Next.js)
 *
 * Ce fichier est chargé automatiquement par Next.js au démarrage du serveur Node.js.
 * Il configure le SDK OpenTelemetry pour exporter les traces vers l'OTel Collector.
 *
 * Traces générées :
 *  - Requêtes HTTP entrantes (pages & API routes Next.js)
 *  - Requêtes HTTP sortantes (appels proxy vers les services externes : Grafana, Strava, etc.)
 *  - Requêtes DNS
 *  - Opérations sur les modules Node.js instrumentés automatiquement
 */

// Stub function called by Next.js in build time - must export register
export async function register() {
  // L'instrumentation ne doit s'exécuter que côté serveur Node.js,
  // pas dans le runtime Edge ni côté navigateur.
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return;
  }

  if (process.env.NEXT_RUNTIME === "edge" || typeof window !== "undefined") {
    return;
  }

  // Charger OpenTelemetry dynamiquement côté serveur uniquement
  // Utiliser Function constructor pour contourner l'analyse statique de webpack
  // qui autrement découvrirait les imports gRPC
  const initCode = `
    (async () => {
      try {
        const { NodeSDK } = require("@opentelemetry/sdk-node");
        const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
        const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
        const { Resource } = require("@opentelemetry/resources");
        const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require("@opentelemetry/semantic-conventions");

        const sdk = new NodeSDK({
          resource: new Resource({
            [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "homepage",
            [ATTR_SERVICE_VERSION]: process.env.NEXT_PUBLIC_VERSION ?? "unknown",
          }),

          traceExporter: new OTLPTraceExporter({
            url: \`\${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector.observability.svc.cluster.local:4318"}/v1/traces\`,
          }),

          instrumentations: [
            getNodeAutoInstrumentations({
              "@opentelemetry/instrumentation-fs": { enabled: false },
              "@opentelemetry/instrumentation-http": { enabled: true },
              "@opentelemetry/instrumentation-dns": { enabled: true },
            }),
          ],
        });

        sdk.start();
        console.log("[instrumentation.js] OpenTelemetry SDK started successfully");
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[instrumentation.js] Failed to initialize OpenTelemetry:", error?.message);
        }
      }
    })();
  `;

  // Exécuter le code côté serveur seulement
  try {
    // eslint-disable-next-line no-new-func
    new Function(initCode)();
  } catch (error) {
    console.warn("[instrumentation.js] Failed to setup OpenTelemetry:", error?.message);
  }
}


