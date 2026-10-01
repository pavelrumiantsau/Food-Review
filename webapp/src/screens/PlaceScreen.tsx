import { useState } from "react";
import type { Dish, Place, Visit } from "../../../src/types";
import { api } from "../api";
import { Field, Message, PRICE_LABELS, RatingBadge, RatingPicker, Section } from "../components";
import { today, useLoad } from "../hooks";
import { goBack, navigate } from "../router";
import { confirmDialog, haptic } from "../telegram";

export function PlaceScreen({ id }: { id: number }) {
  const { data: place, setData, error, reload } = useLoad(() => api.get<Place>(`/places/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  if (!place) return <main><Message error={error} loading /></main>;

  /** Runs an action with busy state and error reporting; resolves to true on success. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setActionError(undefined);
    try {
      await action();
      haptic.success();
      return true;
    } catch (e) {
      haptic.error();
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Tapping the current rating keeps it but confirms it (clears the "imported" flag).
  const rate = (rating: number | null) =>
    run(async () => setData(await api.patch<Place>(`/places/${id}`, { rating: rating ?? place.rating })));

  async function remove() {
    if (!(await confirmDialog(`Delete “${place!.name}” with all its visits and dishes?`))) return;
    if (await run(() => api.delete(`/places/${id}`))) goBack();
  }

  const info = [
    place.city,
    place.price_level ? PRICE_LABELS[place.price_level - 1] : null,
    place.visit_avg !== null ? `visits avg ${place.visit_avg}` : null,
  ].filter(Boolean);

  return (
    <main>
      <div className="place-head">
        <div className="grow">
          <h1>{place.name}</h1>
          <div className="chips">
            {place.categories.map((c) => (
              <span key={c} className="chip static">
                {c}
              </span>
            ))}
          </div>
          {info.length > 0 && <div className="hint">{info.join(" · ")}</div>}
        </div>
        <RatingBadge rating={place.rating} imported={place.rating_imported} />
      </div>

      <Section title="Overall rating">
        {place.rating_imported && (
          <p className="hint">Converted from your 5-point list. Tap a number to confirm or change it.</p>
        )}
        <RatingPicker value={place.rating_imported ? null : place.rating} onChange={rate} required />
        {place.rating_imported && <p className="hint">Imported value: {place.rating}</p>}
      </Section>

      {(place.address || place.map_url || place.website || place.notes || place.tags.length > 0) && (
        <Section title="Details">
          {place.address && <p>{place.address}</p>}
          <div className="row">
            {place.map_url && (
              <a href={place.map_url} target="_blank" rel="noreferrer">
                Map
              </a>
            )}
            {place.website && (
              <a href={place.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
          </div>
          {place.notes && <p className="notes">{place.notes}</p>}
          {place.tags.length > 0 && <p className="hint">Tags: {place.tags.join(", ")}</p>}
        </Section>
      )}

      <Visits place={place} onChange={reload} run={run} />
      <Dishes place={place} onChange={reload} run={run} />

      <Message error={actionError} />
      <div className="actions">
        <button className="secondary" disabled={busy} onClick={() => navigate(`/place/${id}/edit`)}>
          Edit details
        </button>
        <button className="danger" disabled={busy} onClick={remove}>
          Delete place
        </button>
      </div>
    </main>
  );
}

type Run = (action: () => Promise<unknown>) => Promise<boolean>;

function Visits({ place, onChange, run }: { place: Place; onChange: () => void; run: Run }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ visited_on: today(), rating: null as number | null, notes: "" });

  async function add() {
    const ok = await run(async () => {
      await api.post<Visit>(`/places/${place.id}/visits`, form);
      // Offer to carry a visit rating over to the overall rating.
      if (form.rating !== null && form.rating !== place.rating) {
        if (await confirmDialog(`Set overall rating to ${form.rating}?`)) {
          await api.patch(`/places/${place.id}`, { rating: form.rating });
        }
      }
    });
    onChange();
    if (!ok) return;
    setAdding(false);
    setForm({ visited_on: today(), rating: null, notes: "" });
  }

  async function remove(v: Visit) {
    if (!(await confirmDialog(`Delete the visit on ${v.visited_on}?`))) return;
    if (await run(() => api.delete(`/visits/${v.id}`))) onChange();
  }

  return (
    <Section
      title={`Visits (${place.visits.length})`}
      action={!adding && <button className="link" onClick={() => setAdding(true)}>+ Add visit</button>}
    >
      {adding && (
        <div className="inline-form">
          <Field label="Date">
            <input type="date" value={form.visited_on} max={today()} onChange={(e) => setForm({ ...form, visited_on: e.target.value })} />
          </Field>
          <Field label="Rating">
            <RatingPicker value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
          </Field>
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="row">
            <button onClick={add}>Save visit</button>
            <button className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul className="list compact">
        {place.visits.map((v) => (
          <li key={v.id}>
            <div className="grow">
              <div>{v.visited_on}</div>
              {v.notes && <div className="hint">{v.notes}</div>}
            </div>
            <RatingBadge rating={v.rating} />
            <button className="icon-button" aria-label="Delete visit" onClick={() => remove(v)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Dishes({ place, onChange, run }: { place: Place; onChange: () => void; run: Run }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", rating: null as number | null, notes: "" });

  async function add() {
    // Link the dish to today's visit if there is one.
    const visit = place.visits.find((v) => v.visited_on === today());
    if (!(await run(() => api.post<Dish>(`/places/${place.id}/dishes`, { ...form, visit_id: visit?.id ?? null })))) return;
    setAdding(false);
    setForm({ name: "", rating: null, notes: "" });
    onChange();
  }

  async function remove(d: Dish) {
    if (!(await confirmDialog(`Delete “${d.name}”?`))) return;
    if (await run(() => api.delete(`/dishes/${d.id}`))) onChange();
  }

  return (
    <Section
      title={`Dishes (${place.dishes.length})`}
      action={!adding && <button className="link" onClick={() => setAdding(true)}>+ Add dish</button>}
    >
      {adding && (
        <div className="inline-form">
          <Field label="Dish">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cepelinai" />
          </Field>
          <Field label="Rating">
            <RatingPicker value={form.rating} onChange={(rating) => setForm({ ...form, rating })} />
          </Field>
          <Field label="Notes">
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="row">
            <button disabled={!form.name.trim()} onClick={add}>
              Save dish
            </button>
            <button className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <ul className="list compact">
        {place.dishes.map((d) => (
          <li key={d.id}>
            <div className="grow">
              <div>{d.name}</div>
              {d.notes && <div className="hint">{d.notes}</div>}
            </div>
            <RatingBadge rating={d.rating} />
            <button className="icon-button" aria-label="Delete dish" onClick={() => remove(d)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
