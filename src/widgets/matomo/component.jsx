import { useTranslation } from "next-i18next";
import Container from "components/services/widget/container";
import Block from "components/services/widget/block";
import useWidgetAPI from "utils/proxy/use-widget-api";

const FIELDS = {
  "VisitsSummary.get": [
    { key: "nb_visits", label: "matomo.nb_visits", type: "number" },
    { key: "nb_uniq_visitors", label: "matomo.nb_uniq_visitors", type: "number" },
    { key: "nb_actions", label: "matomo.nb_actions", type: "number" },
    { key: "bounce_rate", label: "matomo.bounce_rate", type: "text" },
    { key: "nb_actions_per_visit", label: "matomo.nb_actions_per_visit", type: "number" },
    { key: "avg_time_on_site", label: "matomo.avg_time_on_site", type: "number" },
    { key: "nb_visits_converted", label: "matomo.nb_visits_converted", type: "number", defaultHidden: true },
    { key: "nb_users", label: "matomo.nb_users", type: "number", defaultHidden: true },
    { key: "bounce_count", label: "matomo.bounce_count", type: "number", defaultHidden: true },
    { key: "sum_visit_length", label: "matomo.sum_visit_length", type: "number", defaultHidden: true },
    { key: "max_actions", label: "matomo.max_actions", type: "number", defaultHidden: true },
  ],
  "Actions.get": [
    { key: "nb_pageviews", label: "matomo.nb_pageviews", type: "number" },
    { key: "nb_uniq_pageviews", label: "matomo.nb_uniq_pageviews", type: "number" },
    { key: "nb_downloads", label: "matomo.nb_downloads", type: "number", defaultHidden: true },
    { key: "nb_outlinks", label: "matomo.nb_outlinks", type: "number", defaultHidden: true },
  ],
  "Live.getCounters": [
    { key: "visits", label: "matomo.live_visits", type: "number" },
    { key: "actions", label: "matomo.live_actions", type: "number" },
    { key: "visitors", label: "matomo.live_visitors", type: "number" },
  ],
};

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;

  const hide = widget.hide ?? [];
  const show = widget.show ?? [];
  // endpoint configuré dans services.yaml, défaut : VisitsSummary.get
  const ep = widget.endpoint ?? "VisitsSummary.get";

  const fields = FIELDS[ep] ?? FIELDS["VisitsSummary.get"];
  const visibleFields = fields.filter((f) => {
    if (hide.includes(f.key)) return false;
    if (f.defaultHidden && !show.includes(f.key)) return false;
    return true;
  });

  const { data, error } = useWidgetAPI(widget, ep);

  // Live.getCounters retourne un tableau à un élément
  const resolved = Array.isArray(data) ? data[0] : data;

  if (error) return <Container service={service} error={error} />;

  if (!resolved) {
    return (
      <Container service={service}>
        {visibleFields.map((f) => (
          <Block key={f.key} label={f.label} />
        ))}
      </Container>
    );
  }

  return (
    <Container service={service}>
      {visibleFields.map((f) => (
        <Block
          key={f.key}
          label={f.label}
          value={f.type === "number" ? t("common.number", { value: resolved[f.key] }) : resolved[f.key]}
        />
      ))}
    </Container>
  );
}
