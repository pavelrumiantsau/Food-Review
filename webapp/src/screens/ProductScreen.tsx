import { useEffect, useState } from "react";
import type { OffProduct, Product } from "../../../src/types";
import { api } from "../api";
import { ChipsInput, Field, Message, RatingPicker } from "../components";
import { useLoad } from "../hooks";
import { goBack, navigate } from "../router";
import { confirmDialog, haptic } from "../telegram";

interface Form {
  name: string;
  brand: string;
  barcode: string;
  category: string;
  rating: number | null;
  review: string;
  tags: string[];
  off_image_url: string | null;
  source: "manual" | "off";
}

const empty = (barcode = ""): Form => ({
  name: "",
  brand: "",
  barcode,
  category: "",
  rating: null,
  review: "",
  tags: [],
  off_image_url: null,
  source: "manual",
});

const fromProduct = (p: Product): Form => ({
  name: p.name,
  brand: p.brand ?? "",
  barcode: p.barcode ?? "",
  category: p.category ?? "",
  rating: p.rating,
  review: p.review ?? "",
  tags: p.tags,
  off_image_url: p.off_image_url,
  source: p.source,
});

/** `id` undefined → new product (optionally prefilled from Open Food Facts by `barcode`). */
export function ProductScreen({ id, barcode }: { id?: number; barcode?: string }) {
  const [form, setForm] = useState<Form | null>(id ? null : empty(barcode));
  const [initial, setInitial] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [offStatus, setOffStatus] = useState<string>();
  const tags = useLoad(() => api.get<{ product: { name: string }[] }>("/tags"), []);

  useEffect(() => {
    if (id) {
      api
        .get<Product>(`/products/${id}`)
        .then((p) => {
          const f = fromProduct(p);
          setForm(f);
          setInitial(JSON.stringify(f));
        })
        .catch((e) => setError(e.message));
    } else if (barcode) {
      setOffStatus("Looking up Open Food Facts…");
      api
        .get<OffProduct>(`/off/${barcode}`)
        .then((off) => {
          setOffStatus(undefined);
          setForm((f) =>
            f && {
              ...f,
              name: f.name || off.name || "",
              brand: f.brand || off.brand || "",
              off_image_url: off.imageUrl,
              source: "off",
            },
          );
        })
        .catch(() => setOffStatus("Not in Open Food Facts, so please enter the name."));
    }
  }, [id, barcode]);

  if (!form) return <main><Message error={error} loading /></main>;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const dirty = !id || JSON.stringify(form) !== initial;

  async function save() {
    setSaving(true);
    setError(undefined);
    const body = { ...form!, barcode: form!.barcode || null };
    try {
      if (id) {
        const p = await api.patch<Product>(`/products/${id}`, body);
        setForm(fromProduct(p));
        setInitial(JSON.stringify(fromProduct(p)));
      } else {
        const p = await api.post<Product>("/products", body);
        navigate(`/product/${p.id}`, { replace: true });
      }
      haptic.success();
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog(`Delete “${form!.name}”?`))) return;
    await api.delete(`/products/${id}`);
    haptic.success();
    goBack();
  }

  return (
    <main className="form">
      <div className="product-head">
        {form.off_image_url && <img src={form.off_image_url} alt="" />}
        <div className="grow">
          <h1>{form.name || "New product"}</h1>
          {form.barcode && <div className="hint">Barcode {form.barcode}</div>}
          {offStatus && <div className="hint">{offStatus}</div>}
        </div>
      </div>

      <Field label="Rating">
        <RatingPicker value={form.rating} onChange={(rating) => set({ rating })} />
      </Field>
      <Field label="Name">
        <input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
      </Field>
      <Field label="Brand">
        <input value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
      </Field>
      <Field label="Review">
        <textarea rows={3} value={form.review} onChange={(e) => set({ review: e.target.value })} placeholder="What was good or bad?" />
      </Field>
      <Field label="Category">
        <input value={form.category} onChange={(e) => set({ category: e.target.value })} placeholder="e.g. Cheese, Snacks" />
      </Field>
      <Field label="Tags">
        <ChipsInput value={form.tags} onChange={(t) => set({ tags: t })} suggestions={tags.data?.product.map((t) => t.name)} placeholder="Add tag" />
      </Field>
      {!id && (
        <Field label="Barcode">
          <input inputMode="numeric" value={form.barcode} onChange={(e) => set({ barcode: e.target.value.replace(/\D/g, "") })} />
        </Field>
      )}

      <Message error={error} />
      <div className="actions">
        <button disabled={!dirty || saving || !form.name.trim()} onClick={save}>
          {saving ? "Saving…" : id ? "Save" : "Add product"}
        </button>
        {id && (
          <button className="danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </main>
  );
}
