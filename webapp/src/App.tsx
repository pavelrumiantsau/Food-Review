import { useEffect, useRef, useState } from "react";
import { decodeImage, scanVideo } from "./scanner";
import { api, tg } from "./telegram";

interface OffProduct {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

type Method = "camera" | "photo" | "manual";

// Phase 0 spike: verifies auth and which barcode capture method works inside Telegram on iOS.
export function App() {
  const [me, setMe] = useState("checking…");
  const [log, setLog] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ code: string; method: Method; ms?: number } | null>(null);
  const [product, setProduct] = useState<OffProduct | "not found" | null>(null);
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<() => void>(() => {});

  const addLog = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l]);

  useEffect(() => {
    if (!tg) return setMe("not opened from Telegram");
    api<{ user: { first_name: string; id: number } }>("/api/me")
      .then(({ user }) => setMe(`✓ ${user.first_name} (${user.id})`))
      .catch((e) => setMe(`✗ ${e.message}`));
    return () => stopRef.current();
  }, []);

  async function found(code: string, method: Method, ms?: number) {
    tg?.HapticFeedback?.notificationOccurred("success");
    setResult({ code, method, ms });
    setProduct(null);
    addLog(`decoded ${code} via ${method}${ms ? ` in ${ms} ms` : ""}`);
    try {
      setProduct(await api<OffProduct>(`/api/off/${code}`));
    } catch (e) {
      setProduct("not found");
      addLog(`lookup: ${(e as Error).message}`);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return addLog("getUserMedia is not available");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      addLog("camera started");
      const started = performance.now();
      const scan = scanVideo(video, (code) => {
        stopCamera();
        found(code, "camera", Math.round(performance.now() - started));
      });
      stopRef.current = () => {
        scan.stop();
        stream.getTracks().forEach((t) => t.stop());
      };
    } catch (e) {
      addLog(`camera error: ${(e as Error).name}: ${(e as Error).message}`);
    }
  }

  function stopCamera() {
    stopRef.current();
    stopRef.current = () => {};
    setScanning(false);
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    addLog(`photo ${Math.round(file.size / 1024)} KB, decoding…`);
    const code = await decodeImage(file);
    code ? found(code, "photo") : addLog("no barcode found in photo");
  }

  return (
    <main>
      <h1>Scanner test</h1>
      <p className="hint">
        Auth: {me}
        <br />
        Platform: {tg?.platform ?? "browser"} {tg?.version ?? ""} · camera API:{" "}
        {typeof navigator.mediaDevices?.getUserMedia === "function" ? "yes" : "no"}
      </p>

      <section>
        <h2>1. Live camera</h2>
        <video ref={videoRef} playsInline muted hidden={!scanning} />
        {scanning ? (
          <button onClick={stopCamera}>Stop</button>
        ) : (
          <button onClick={startCamera}>Start camera</button>
        )}
      </section>

      <section>
        <h2>2. Take a photo</h2>
        <label className="button">
          Take photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </section>

      <section>
        <h2>3. Type digits</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{8,14}$/.test(manual)) found(manual, "manual");
          }}
        >
          <input inputMode="numeric" pattern="\d{8,14}" placeholder="4770123456789" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button type="submit">Look up</button>
        </form>
      </section>

      {result && (
        <section className="card">
          <h2>{result.code}</h2>
          <p className="hint">via {result.method}{result.ms ? ` · ${result.ms} ms` : ""}</p>
          {product === null && <p>Looking up…</p>}
          {product === "not found" && <p>Not in Open Food Facts.</p>}
          {product && product !== "not found" && (
            <div className="product">
              {product.imageUrl && <img src={product.imageUrl} alt="" />}
              <div>
                <strong>{product.name ?? "(no name)"}</strong>
                <div className="hint">{product.brand}</div>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2>Log</h2>
        <pre>{log.join("\n") || "—"}</pre>
      </section>
    </main>
  );
}
