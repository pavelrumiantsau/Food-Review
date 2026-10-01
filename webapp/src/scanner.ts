import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Serve the WASM from our own origin instead of the default jsDelivr CDN.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
});

const OPTIONS: ReaderOptions = {
  formats: ["EAN13", "EAN8", "UPCA", "UPCE"],
  tryHarder: true,
  maxNumberOfSymbols: 1,
};

export async function decodeImage(input: Blob | ImageData): Promise<string | null> {
  const [result] = await readBarcodes(input, OPTIONS);
  return result?.isValid ? result.text : null;
}

/** Decodes frames from a playing <video> until a barcode is found or stop() is called. */
export function scanVideo(video: HTMLVideoElement, onCode: (code: string) => void): { stop(): void } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const code = await decodeImage(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (code && !stopped) {
        stopped = true;
        onCode(code);
        return;
      }
    }
    setTimeout(tick, 150);
  };
  tick();
  return { stop: () => void (stopped = true) };
}
