import { useEffect } from "react";
import { goBack, match, useLocation } from "./router";
import { Home } from "./screens/Home";
import { PlaceForm } from "./screens/PlaceForm";
import { PlaceScreen } from "./screens/PlaceScreen";
import { ProductScreen } from "./screens/ProductScreen";
import { Scan } from "./screens/Scan";
import { tg } from "./telegram";

function Screen({ path, params }: ReturnType<typeof useLocation>) {
  let m: Record<string, string> | null;
  if (path === "/scan") return <Scan />;
  if (path === "/product/new") return <ProductScreen barcode={params.get("barcode") ?? undefined} />;
  if ((m = match("/product/:id", path))) return <ProductScreen id={Number(m.id)} />;
  if (path === "/place/new") return <PlaceForm />;
  if ((m = match("/place/:id/edit", path))) return <PlaceForm id={Number(m.id)} />;
  if ((m = match("/place/:id", path))) return <PlaceScreen id={Number(m.id)} />;
  return <Home />;
}

export function App() {
  const location = useLocation();
  const isHome = !["/scan", "/product", "/place"].some((p) => location.path.startsWith(p));

  // Telegram's native Back button replaces browser navigation inside the Mini App.
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    if (isHome) return back.hide();
    back.show();
    back.onClick(goBack);
    return () => back.offClick(goBack);
  }, [isHome]);

  useEffect(() => window.scrollTo(0, 0), [location.path]);

  return (
    <>
      {!tg && <p className="message error">Open this app from the Telegram bot.</p>}
      <Screen key={location.path + "?" + location.params} {...location} />
    </>
  );
}
