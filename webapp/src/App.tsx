import { useEffect, useLayoutEffect } from "react";
import { goBack, match, useLocation } from "./router";
import { Home } from "./screens/Home";
import { PlaceForm } from "./screens/PlaceForm";
import { PlaceScreen } from "./screens/PlaceScreen";
import { ProductScreen } from "./screens/ProductScreen";
import { Scan } from "./screens/Scan";
import { Stats } from "./screens/Stats";
import { tg } from "./telegram";

function Screen({ path, params }: ReturnType<typeof useLocation>) {
  let m: Record<string, string> | null;
  if (path === "/scan") return <Scan />;
  if (path === "/stats") return <Stats />;
  if (path === "/product/new") return <ProductScreen barcode={params.get("barcode") ?? undefined} />;
  if ((m = match("/product/:id", path))) return <ProductScreen id={Number(m.id)} />;
  if (path === "/place/new") return <PlaceForm />;
  if ((m = match("/place/:id/edit", path))) return <PlaceForm id={Number(m.id)} />;
  if ((m = match("/place/:id", path))) return <PlaceScreen id={Number(m.id)} />;
  return <Home />;
}

export function App() {
  const location = useLocation();
  const isHome = !["/scan", "/stats", "/product", "/place"].some((p) => location.path.startsWith(p));

  // Telegram's native Back button replaces browser navigation inside the Mini App.
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back) return;
    // Telegram's methods return the BackButton for chaining, so never return their result
    // from the effect: React would call it as a cleanup function and crash.
    if (isHome) {
      back.hide();
      return;
    }
    back.show();
    back.onClick(goBack);
    return () => void back.offClick(goBack);
  }, [isHome]);

  // New screens start at the top; Back restores the saved position (see router.navigate).
  // Layout effect: runs after the screen (with cached data) is in the DOM, before paint.
  // Block body on purpose: scrollTo returns a Promise in current browsers, and an effect's
  // return value is called as its cleanup.
  const href = location.path + "?" + location.params;
  useLayoutEffect(() => {
    window.scrollTo(0, (history.state?.scrollY as number | undefined) ?? 0);
  }, [href]);

  return (
    <>
      {!tg && <p className="message error">Open this app from the Telegram bot.</p>}
      <Screen key={href} {...location} />
    </>
  );
}
