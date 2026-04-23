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

export async function register() {
  // L'instrumentation ne doit s'exécuter que côté serveur Node.js,
  // pas dans le runtime Edge ni côté navigateur.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  const { Resource } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import("@opentelemetry/semantic-conventions");

  const sdk = new NodeSDK({
    resource: new Resource({
      // Nom du service visible dans Grafana / Tempo / VictoriaTraces
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "homepage",
      // Version de l'application (injectée via NEXT_PUBLIC_VERSION à la build)
      [ATTR_SERVICE_VERSION]: process.env.NEXT_PUBLIC_VERSION ?? "unknown",
    }),

    // Exporteur OTLP HTTP → OTel Collector
    // L'URL de base est lue depuis OTEL_EXPORTER_OTLP_ENDPOINT,
    // le SDK ajoute automatiquement /v1/traces.
    traceExporter: new OTLPTraceExporter({
      url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://otel-collector.observability.svc.cluster.local:4318"}/v1/traces`,
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
        // Désactivé : génère trop de spans pour chaque lecture de fichier (config YAML, etc.)
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // HTTP et HTTPS : trace les appels proxy vers Grafana, Strava, Minecraft, etc.
        "@opentelemetry/instrumentation-http": { enabled: true },
        // DNS : trace les résolutions DNS (utile pour débugger les problèmes réseau k8s)
        "@opentelemetry/instrumentation-dns": { enabled: true },
      }),
    ],
  });

  sdk.start();
}

