import { useTranslation } from "next-i18next";
import Container from "components/services/widget/container";
import Block from "components/services/widget/block";
import useWidgetAPI from "utils/proxy/use-widget-api";

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data: athlete, error: athleteError } = useWidgetAPI(widget, "athlete");
  const { data: activities, error: activitiesError } = useWidgetAPI(widget, "activities");

  const error = athleteError ?? activitiesError;
  if (error) return <Container service={service} error={error} />;

  if (!athlete || !activities) {
    return (
      <Container service={service}>
        <Block label="strava.activity" />
        <Block label="strava.distance" />
        <Block label="strava.moving_time" />
        <Block label="strava.elevation" />
      </Container>
    );
  }

  const last = activities[0];
  const distanceKm = last ? (last.distance / 1000).toFixed(1) : "—";
  const minutes = last ? Math.round(last.moving_time / 60) : "—";
  const elevation = last ? `${Math.round(last.total_elevation_gain)} m` : "—";
  const name = last ? last.name : "—";

  return (
    <Container service={service}>
      <Block label="strava.activity" value={name} />
      <Block label="strava.distance" value={`${distanceKm} km`} />
      <Block label="strava.moving_time" value={`${minutes} min`} />
      <Block label="strava.elevation" value={elevation} />
    </Container>
  );
}