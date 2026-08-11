/**
 * Tracer - Vector Tracing Integration
 *
 * Bridges the pixel canvas to esm-potrace-wasm library for converting raster to vector.
 *
 * Key responsibilities:
 * - Takes the pixel canvas (low-res bitmap)
 * - Pre-processes to convert alpha to grayscale (preserves opacity levels)
 * - Calls potrace with configured options
 * - Returns SVG string with traced paths
 *
 * Tracing process:
 * - Extracts ImageData from pixel canvas
 * - Converts alpha to grayscale: 100% alpha → black, 0% alpha → white
 * - Uses potrace threshold to control which opacity levels get traced
 * - Creates ImageBitmap for potrace
 * - Returns SVG string or null on error
 */
import {
  DEFAULT_POTRACE_OPTIONS,
  MAX_POTRACE_PIXELS,
  toPotraceWasmOptions,
  type PotraceTraceOptions,
} from "../import/image-import";

interface TraceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Tracer {
  private potrace: (image: ImageBitmapSource, options?: any) => Promise<string>;
  private recover?: () => Promise<void>;

  constructor(
    potraceFn: (image: ImageBitmapSource, options?: any) => Promise<string>,
    recover?: () => Promise<void>,
  ) {
    this.potrace = potraceFn;
    this.recover = recover;
  }

  private getAlphaBounds(imageData: ImageData): TraceBounds | null {
    const { width, height, data } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha === 0) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  private restoreCanvasSpace(svg: string, sourceCanvas: HTMLCanvasElement, bounds: TraceBounds): string {
    return svg
      .replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
        const nextAttrs = attrs
          .replace(/\swidth="[^"]*"/, "")
          .replace(/\sheight="[^"]*"/, "")
          .replace(/\sviewBox="[^"]*"/, "");

        return `<svg${nextAttrs} width="${sourceCanvas.width}" height="${sourceCanvas.height}" viewBox="0 0 ${sourceCanvas.width} ${sourceCanvas.height}"><g transform="translate(${bounds.x} ${bounds.y})">`;
      })
      .replace(/<\/svg>\s*$/, "</g></svg>");
  }

  /**
   * Trace an arbitrary bitmap (e.g. imported image) with the given potrace options.
   * Caller is responsible for downscaling oversized sources.
   */
  async traceSource(
    source: ImageBitmapSource,
    options: Partial<PotraceTraceOptions> = {},
  ): Promise<string | null> {
    const merged: PotraceTraceOptions = { ...DEFAULT_POTRACE_OPTIONS, ...options };
    let imageBitmap: ImageBitmap | null = null;
    try {
      imageBitmap = await createImageBitmap(source as ImageBitmapSource);
      if (imageBitmap.width * imageBitmap.height > MAX_POTRACE_PIXELS) {
        console.warn(
          `Skipping trace: raster ${imageBitmap.width}x${imageBitmap.height} exceeds ${MAX_POTRACE_PIXELS} pixels`,
        );
        return null;
      }
      return await this.potrace(imageBitmap, toPotraceWasmOptions(merged));
    } catch (error) {
      console.error("Tracing error:", error);
      await this.recover?.();
      return null;
    } finally {
      imageBitmap?.close();
    }
  }

  async trace(canvas: HTMLCanvasElement): Promise<string | null> {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get 2D context');
      }

      // Get original image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bounds = this.getAlphaBounds(imageData);
      if (!bounds) {
        return null;
      }

      if (bounds.width * bounds.height > MAX_POTRACE_PIXELS) {
        console.warn(
          `Skipping trace: raster bounds ${bounds.width}x${bounds.height} exceed ${MAX_POTRACE_PIXELS} pixels`,
        );
        return null;
      }

      const croppedImageData = new ImageData(
        Math.ceil(bounds.width),
        Math.ceil(bounds.height),
      );
      const data = imageData.data;
      const croppedData = croppedImageData.data;

      // Convert alpha to grayscale: 100% alpha → black, 0% alpha → white
      // This preserves alpha intensity for potrace threshold control
      for (let y = 0; y < croppedImageData.height; y += 1) {
        for (let x = 0; x < croppedImageData.width; x += 1) {
          const sourceX = bounds.x + x;
          const sourceY = bounds.y + y;
          const sourceIndex = (sourceY * canvas.width + sourceX) * 4;
          const targetIndex = (y * croppedImageData.width + x) * 4;
          const alpha = data[sourceIndex + 3];
          const grayscale = 255 - alpha;

          croppedData[targetIndex] = grayscale;     // R
          croppedData[targetIndex + 1] = grayscale; // G
          croppedData[targetIndex + 2] = grayscale; // B
          croppedData[targetIndex + 3] = 255;       // Full opacity for potrace
        }
      }

      // Create a temporary canvas for alpha-to-black conversion.
      // Tracing only the changed bounds avoids oversized WASM inputs at 1x.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = croppedImageData.width;
      tempCanvas.height = croppedImageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Could not get temp 2D context');
      }

      // Put processed data on temp canvas
      tempCtx.putImageData(croppedImageData, 0, 0);

      // Create ImageBitmap from processed canvas
      let imageBitmap: ImageBitmap | null = await createImageBitmap(tempCanvas);

      try {
        // Stroke path: mono silhouette (draw tools). Keep hardcoded defaults.
        const pathData = await this.potrace(imageBitmap, toPotraceWasmOptions({
          ...DEFAULT_POTRACE_OPTIONS,
          extractcolors: false,
          threshold: 0.5,
        }));

        return this.restoreCanvasSpace(pathData, canvas, bounds);
      } finally {
        imageBitmap.close();
        imageBitmap = null;
      }
    } catch (error) {
      console.error('Tracing error:', error);
      await this.recover?.();
      return null;
    }
  }
}
