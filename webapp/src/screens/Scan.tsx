import { useEffect, useRef, useState } from "react";
import type { Product } from "../../../src/types";
import { api } from "../api";
import { RatingBadge } from "../components";
import { navigate } from "../router";
import { decodeImage, scanVideo } from "../scanner";
import { haptic } from "../telegram";

export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Starting camera…");
  const [manual, setManual] = useState("");
  const [matches, setMatches] = useState<Product[] | null>(null);

  async function found(code: string) {
    haptic.success();
    setStatus(`Found ${code}, looking up…`);
    try {
      const { items } = await api.get<{ items: Product[] }>(`/products?barcode=${code}`);
      if (items.length === 0) navigate(`/product/new?barcode=${code}`, { replace: true });
      else if (items.length === 1) navigate(`/product/${items[0].id}`, { replace: true });
      else setMatches(items); // same barcode saved under several names
    } catch (e) {
      setStatus(`Lookup failed: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus("Point the camera at a barcode");
        const scan = scanVideo(video, (code) => {
          cleanup();
          found(code);
        });
        cleanup = () => {
          scan.stop();
          stream.getTracks().forEach((t) => t.stop());
        };
      } catch (e) {
        setStatus(`Camera unavailable (${(e as Error).name}). Take a photo or type the digits instead.`);
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setStatus("Reading photo…");
    const code = await decodeImage(file);
    if (code) found(code);
    else {
      haptic.error();
      setStatus("No barcode found in the photo. Try again closer.");
    }
  }

  if (matches) {
    return (
      <main>
        <h1>Several products use this barcode</h1>
        <ul className="list">
          {matches.map((p) => (
            <li key={p.id} onClick={() => navigate(`/product/${p.id}`, { replace: true })}>
              <div className="grow">{p.name}</div>
              <RatingBadge rating={p.rating} />
            </li>
          ))}
          <li onClick={() => navigate(`/product/new?barcode=${matches[0].barcode}`, { replace: true })}>
            <div className="grow link">+ Add another product with this barcode</div>
          </li>
        </ul>
      </main>
    );
  }

  return (
    <main>
      <div className="viewfinder">
        <video ref={videoRef} playsInline muted />
        <div className="aim" />
      </div>
      <p className="message">{status}</p>

      <div className="row">
        <label className="button secondary">
          Take photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{8,14}$/.test(manual)) found(manual);
        }}
      >
        <input inputMode="numeric" pattern="\d{8,14}" placeholder="Or type the digits" value={manual} onChange={(e) => setManual(e.target.value)} />
        <button type="submit">Go</button>
      </form>
    </main>
  );
}
