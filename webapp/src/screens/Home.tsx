import { useState } from "react";
import type { PlaceSummary, Product, SearchHit } from "../../../src/types";
import { api, query } from "../api";
import { Message, RatingBadge } from "../components";
import { useDebounced, useLoad } from "../hooks";
import { navigate } from "../router";

const PAGE = 50;

type Tab = "places" | "products";
type PlaceFilter = "all" | "imported" | "unrated" | "rated";

interface HomeState {
  tab: Tab;
  q: string;
  placeFilter: PlaceFilter;
  category: string;
  sort: "name" | "rating" | "recent";
  placeLimit: number;
  productLimit: number;
}

// Survives navigating to a detail screen and back.
let saved: HomeState = { tab: "places", q: "", placeFilter: "all", category: "", sort: "name", placeLimit: PAGE, productLimit: PAGE };

/** Opens the Places tab of Home with the given filters (used by the Stats screen). */
export function openPlaces(patch: Partial<HomeState>) {
  saved = { ...saved, tab: "places", q: "", placeLimit: PAGE, ...patch };
  navigate("/");
}

export function Home() {
  const [state, setState] = useState(saved);
  const update = (patch: Partial<HomeState>) => setState((s) => (saved = { ...s, ...patch }));
  const q = useDebounced(state.q.trim(), 250);

  return (
    <main>
      <div className="search-row">
      <input
        className="search"
        type="search"
        placeholder="Search places, products, dishes…"
        value={state.q}
        onChange={(e) => update({ q: e.target.value })}
      />
        <button className="secondary" aria-label="Stats" onClick={() => navigate("/stats")}>
          📊
        </button>
      </div>

      {q ? (
        <SearchResults q={q} />
      ) : (
        <>
          <div className="tabs">
            {(["places", "products"] as const).map((t) => (
              <button key={t} className={state.tab === t ? "active" : ""} onClick={() => update({ tab: t })}>
                {t === "places" ? "Places" : "Products"}
              </button>
            ))}
          </div>
          {state.tab === "places" ? <PlaceList state={state} update={update} /> : <ProductList state={state} update={update} />}
        </>
      )}

      <div className="bottom-bar">
        <button onClick={() => navigate("/scan")}>Scan barcode</button>
        <button className="secondary" onClick={() => navigate(state.tab === "products" ? "/product/new" : "/place/new")}>
          + {state.tab === "products" ? "Product" : "Place"}
        </button>
      </div>
    </main>
  );
}

function SearchResults({ q }: { q: string }) {
  const path = `/search${query({ q, limit: 50 })}`;
  const { data, error, loading } = useLoad(() => api.get<{ results: SearchHit[] }>(path), [path], path);
  if (!data) return <Message error={error} loading={loading} />;
  if (data.results.length === 0) return <p className="message">Nothing found for “{q}”.</p>;
  return (
    <ul className="list">
      {data.results.map((hit) => (
        <li key={`${hit.kind}-${hit.id}`} onClick={() => navigate(`/${hit.kind}/${hit.id}`)}>
          <span className="icon">{hit.kind === "place" ? "🍽" : "🛒"}</span>
          <div className="grow">
            <div>{hit.name}</div>
            {hit.subtitle && <div className="hint">{hit.subtitle}</div>}
          </div>
          <RatingBadge rating={hit.rating} />
        </li>
      ))}
    </ul>
  );
}

const PLACE_FILTERS: { id: PlaceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "imported", label: "Re-rate imported" },
  { id: "unrated", label: "Unrated" },
  { id: "rated", label: "Rated" },
];

function PlaceList({ state, update }: { state: HomeState; update: (p: Partial<HomeState>) => void }) {
  const limit = state.placeLimit;
  const setLimit = (placeLimit: number) => update({ placeLimit });
  const categories = useLoad(() => api.get<{ items: { name: string; count: number }[] }>("/categories"), [], "/categories");
  const filter = {
    imported: state.placeFilter === "imported" ? true : undefined,
    rated: state.placeFilter === "unrated" ? false : state.placeFilter === "rated" ? true : undefined,
  };
  const path = `/places${query({ ...filter, category: state.category, sort: state.sort, limit })}`;
  const { data, error, loading } = useLoad(() => api.get<{ items: PlaceSummary[] }>(path), [path], path);

  return (
    <>
      <div className="chips scroll">
        {PLACE_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`chip${state.placeFilter === f.id ? " active" : ""}`}
            onClick={() => (setLimit(PAGE), update({ placeFilter: f.id }))}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="filters">
        <select value={state.category} onChange={(e) => (setLimit(PAGE), update({ category: e.target.value }))}>
          <option value="">All categories</option>
          {categories.data?.items.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
        <SortSelect value={state.sort} onChange={(sort) => update({ sort })} />
      </div>

      {data && (
        <ul className="list">
          {data.items.map((p) => (
            <li key={p.id} onClick={() => navigate(`/place/${p.id}`)}>
              <div className="grow">
                <div>{p.name}</div>
                <div className="hint">
                  {[p.categories.join(", "), p.visit_count ? `${p.visit_count} visit${p.visit_count > 1 ? "s" : ""}` : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <RatingBadge rating={p.rating} imported={p.rating_imported} />
            </li>
          ))}
          {data.items.length === 0 && <p className="message">No places match.</p>}
        </ul>
      )}
      <Message error={error} loading={loading && !data} />
      {data?.items.length === limit && (
        <button className="secondary wide" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </>
  );
}

function ProductList({ state, update }: { state: HomeState; update: (p: Partial<HomeState>) => void }) {
  const { sort, productLimit: limit } = state;
  const setLimit = (productLimit: number) => update({ productLimit });
  const path = `/products${query({ sort, limit })}`;
  const { data, error, loading } = useLoad(() => api.get<{ items: Product[] }>(path), [path], path);
  return (
    <>
      <div className="filters">
        <SortSelect value={sort} onChange={(s) => update({ sort: s })} />
      </div>
      {data && (
        <ul className="list">
          {data.items.map((p) => (
            <li key={p.id} onClick={() => navigate(`/product/${p.id}`)}>
              {p.off_image_url ? <img className="thumb" src={p.off_image_url} alt="" /> : <span className="icon">🛒</span>}
              <div className="grow">
                <div>{p.name}</div>
                {p.brand && <div className="hint">{p.brand}</div>}
              </div>
              <RatingBadge rating={p.rating} />
            </li>
          ))}
          {data.items.length === 0 && <p className="message">No products yet. Scan a barcode to add one.</p>}
        </ul>
      )}
      <Message error={error} loading={loading && !data} />
      {data?.items.length === limit && (
        <button className="secondary wide" onClick={() => setLimit(limit + PAGE)}>
          Show more
        </button>
      )}
    </>
  );
}

function SortSelect({ value, onChange }: { value: HomeState["sort"]; onChange: (v: HomeState["sort"]) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as HomeState["sort"])}>
      <option value="name">A–Z</option>
      <option value="rating">Best rated</option>
      <option value="recent">Recently changed</option>
    </select>
  );
}
