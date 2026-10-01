import { useEffect, useState } from "react";
import type { MapsPlace, Place } from "../../../src/types";
import { api } from "../api";
import { ChipsInput, Field, Message, PRICE_LABELS, RatingPicker } from "../components";
import { useLoad } from "../hooks";
import { goBack, navigate } from "../router";
import { haptic } from "../telegram";

interface Form {
  name: string;
  categories: string[];
  rating: number | null;
  city: string;
  address: string;
  map_url: string;
  website: string;
  price_level: number | null;
  notes: string;
  tags: string[];
  lat: number | null;
  lng: number | null;
}

const MAPS_LINK = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.|maps\.)?google\.[a-z.]{2,6}\/maps)\S*/i;

const empty: Form = {
  name: "",
  categories: [],
  rating: null,
  city: "Vilnius",
  address: "",
  map_url: "",
  website: "",
  price_level: null,
  notes: "",
  tags: [],
  lat: null,
  lng: null,
};

/** `id` undefined → new place. `mapUrl` (e.g. shared to the bot) is read and filled in on open. */
export function PlaceForm({ id, mapUrl }: { id?: number; mapUrl?: string }) {
  const [form, setForm] = useState<Form | null>(id ? null : empty);
  const [original, setOriginal] = useState<Place>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [mapsStatus, setMapsStatus] = useState<string>();
  const categories = useLoad(() => api.get<{ items: { name: string }[] }>("/categories"), []);
  const tags = useLoad(() => api.get<{ place: { name: string }[] }>("/tags"), []);

  useEffect(() => {
    if (!id) {
      if (mapUrl) fillFromMaps(mapUrl);
      return;
    }
    api
      .get<Place>(`/places/${id}`)
      .then((p) => {
        setOriginal(p);
        setForm({
          name: p.name,
          categories: p.categories,
          rating: p.rating,
          city: p.city ?? "",
          address: p.address ?? "",
          map_url: p.map_url ?? "",
          website: p.website ?? "",
          price_level: p.price_level,
          notes: p.notes ?? "",
          tags: p.tags,
          lat: p.lat,
          lng: p.lng,
        });
        if (mapUrl) fillFromMaps(mapUrl);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Fills name/address/coordinates from a Google Maps link, keeping anything already typed. */
  async function fillFromMaps(text: string) {
    const url = text.match(MAPS_LINK)?.[0];
    if (!url) return;
    setMapsStatus("Reading the Google Maps link…");
    try {
      const m = await api.post<MapsPlace>("/maps/resolve", { url });
      setForm((f) =>
        f && {
          ...f,
          map_url: url,
          name: f.name || m.name || "",
          address: f.address || m.address || "",
          city: f.city || m.city || "",
          lat: m.lat ?? f.lat,
          lng: m.lng ?? f.lng,
        },
      );
      setMapsStatus(m.lat !== null ? "📍 Location saved from Google Maps" : "Couldn't find a location in this link.");
    } catch (e) {
      setForm((f) => f && { ...f, map_url: url });
      setMapsStatus(`Couldn't read the link: ${(e as Error).message}`);
    }
  }

  if (!form) return <main><Message error={error} loading /></main>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  async function save() {
    setSaving(true);
    setError(undefined);
    const url = (v: string) => (v.trim() ? (/^https?:\/\//.test(v.trim()) ? v.trim() : `https://${v.trim()}`) : null);
    const body: Record<string, unknown> = { ...form!, map_url: url(form!.map_url), website: url(form!.website) };
    // Leave an imported rating untouched (and flagged) unless it was actually changed here.
    if (original?.rating_imported && form!.rating === original.rating) delete body.rating;
    try {
      const place = id ? await api.patch<Place>(`/places/${id}`, body) : await api.post<Place>("/places", body);
      haptic.success();
      // Editing returns to the place screen it came from; a new place replaces the form.
      if (id) goBack();
      else navigate(`/place/${place.id}`, { replace: true });
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="form">
      <h1>{id ? "Edit place" : "New place"}</h1>
      <Field label="Name">
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Categories">
        <ChipsInput
          value={form.categories}
          onChange={(c) => set({ categories: c })}
          suggestions={categories.data?.items.map((c) => c.name)}
          placeholder="Add category"
        />
      </Field>
      <Field label="Rating">
        <RatingPicker value={form.rating} onChange={(rating) => set({ rating })} />
      </Field>
      <Field label="Price">
        <div className="segmented">
          {PRICE_LABELS.map((label, i) => (
            <button
              type="button"
              key={label}
              className={form.price_level === i + 1 ? "selected" : ""}
              onClick={() => set({ price_level: form.price_level === i + 1 ? null : i + 1 })}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="City">
        <input value={form.city} onChange={(e) => set({ city: e.target.value })} />
      </Field>
      <Field label="Address">
        <input value={form.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Google Maps link">
        <input
          type="url"
          value={form.map_url}
          onChange={(e) => set({ map_url: e.target.value })}
          onPaste={(e) => {
            e.preventDefault();
            fillFromMaps(e.clipboardData.getData("text"));
          }}
          onBlur={(e) => e.target.value !== (original?.map_url ?? "") && !form.lat && fillFromMaps(e.target.value)}
          placeholder="Paste a link to fill name, address and location"
        />
        {mapsStatus && <span className="hint">{mapsStatus}</span>}
        {!mapsStatus && form.lat !== null && <span className="hint">📍 Has a location</span>}
      </Field>
      <Field label="Website">
        <input type="url" value={form.website} onChange={(e) => set({ website: e.target.value })} />
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <Field label="Tags">
        <ChipsInput value={form.tags} onChange={(t) => set({ tags: t })} suggestions={tags.data?.place.map((t) => t.name)} placeholder="Add tag" />
      </Field>

      <Message error={error} />
      <div className="actions">
        <button disabled={saving || !form.name.trim()} onClick={save}>
          {saving ? "Saving…" : id ? "Save" : "Add place"}
        </button>
      </div>
    </main>
  );
}
