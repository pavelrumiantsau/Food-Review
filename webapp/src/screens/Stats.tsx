import { useState } from "react";
import type { Stats as StatsData } from "../../../src/types";
import { api } from "../api";
import { Message, RatingBadge, Section } from "../components";
import { useLoad } from "../hooks";
import { navigate } from "../router";
import { haptic } from "../telegram";
import { openPlaces } from "./Home";

export function Stats() {
  const { data, error } = useLoad(() => api.get<StatsData>("/stats"), [], "/stats");
  const [kind, setKind] = useState<"places" | "products">("places");
  if (!data) return <main><Message error={error} loading /></main>;

  return (
    <main>
      <h1>Stats</h1>
      <div className="tiles">
        <Tile label="Places" value={data.places.total} note={`${data.places.rated} rated`} />
        <Tile label="Avg place rating" value={data.places.avg ?? "–"} />
        <Tile label="Products" value={data.products.total} note={data.products.avg !== null ? `avg ${data.products.avg}` : undefined} />
        <Tile label="Visits" value={data.visits.total} note={`${data.visits.last30} in last 30 days`} />
      </div>
      {data.places.imported > 0 && (
        <button className="secondary wide" onClick={() => openPlaces({ placeFilter: "imported" })}>
          {data.places.imported} imported ratings to review →
        </button>
      )}

      <Section title="Ratings">
        <div className="tabs">
          {(["places", "products"] as const).map((k) => (
            <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
              {k === "places" ? "Places" : "Products"}
            </button>
          ))}
        </div>
        <Histogram counts={data.distribution[kind]} noun={kind === "places" ? "place" : "product"} />
      </Section>

      {data.topCategories.length > 0 && (
        <Section title="Best categories">
          <ul className="list">
            {data.topCategories.map((c) => (
              <li key={c.name} onClick={() => openPlaces({ category: c.name, sort: "rating", placeFilter: "all" })}>
                <div className="grow">
                  <div>{c.name}</div>
                  <div className="hint">{c.rated} rated</div>
                </div>
                <span className="avg">{c.avg.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.recentVisits.length > 0 && (
        <Section title="Recent visits">
          <ul className="list">
            {data.recentVisits.map((v) => (
              <li key={`${v.place_id}-${v.visited_on}`} onClick={() => navigate(`/place/${v.place_id}`)}>
                <div className="grow">
                  <div>{v.name}</div>
                  <div className="hint">{v.visited_on}</div>
                </div>
                <RatingBadge rating={v.rating} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </main>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="tile">
      <div className="hint">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="hint">{note}</div>}
    </div>
  );
}

/** Count per rating 1–10, one series. Tap a bar for its count (no labels on every bar). */
function Histogram({ counts, noun }: { counts: number[]; noun: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="message">No rated {noun}s yet.</p>;
  const mode = counts.indexOf(max) + 1;
  const caption =
    selected === null
      ? `Most common: ${mode}/10 (${max} ${noun}${max === 1 ? "" : "s"}). Tap a bar for its count.`
      : `${selected}/10: ${counts[selected - 1]} ${noun}${counts[selected - 1] === 1 ? "" : "s"} (${Math.round((counts[selected - 1] / total) * 100)}%)`;

  return (
    <figure className="histogram">
      <div className="bars" role="list">
        {counts.map((n, i) => (
          <button
            key={i}
            role="listitem"
            className={`bar-slot${selected !== null && selected !== i + 1 ? " dim" : ""}`}
            aria-label={`Rating ${i + 1}: ${n} ${noun}s`}
            onClick={() => {
              haptic.select();
              setSelected(selected === i + 1 ? null : i + 1);
            }}
          >
            <span className="bar" style={{ height: n ? `${Math.max((n / max) * 100, 2)}%` : 0 }} />
          </button>
        ))}
      </div>
      <div className="bar-axis">
        {counts.map((_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <figcaption className="hint">{caption}</figcaption>
    </figure>
  );
}
