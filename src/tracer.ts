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
export class Tracer {
  private potrace: (image: ImageBitmapSource, options?: any) => Promise<string>;

  constructor(potraceFn: (image: ImageBitmapSource, options?: any) => Promise<string>) {
    this.potrace = potraceFn;
  }

  async trace(canvas: HTMLCanvasElement): Promise<string | null> {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get 2D context');
      }

      // Create a temporary canvas for alpha-to-black conversion
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Could not get temp 2D context');
      }

      // Get original image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert alpha to grayscale: 100% alpha → black, 0% alpha → white
      // This preserves alpha intensity for potrace threshold control
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        const grayscale = 255 - alpha;
        data[i] = grayscale;     // R
        data[i + 1] = grayscale; // G
        data[i + 2] = grayscale; // B
        data[i + 3] = 255;       // Full opacity for potrace
      }

      // Put processed data on temp canvas
      tempCtx.putImageData(imageData, 0, 0);

      // Create ImageBitmap from processed canvas
      const imageBitmap = await createImageBitmap(tempCanvas);

      // Trace with potrace
      // threshold controls which grays get traced (0.5 = 50% alpha cutoff)
      // pathonly: true returns <path d="..."/> element, no <svg> wrapper
      const pathData = await this.potrace(imageBitmap, {
        turdsize: 2,
        turnpolicy: 4,
        alphamax: 1,
        opticurve: 1,
        opttolerance: 0.2,
        threshold: 0.5,
        pathonly: false,
        extractcolors: false,
      });

      return pathData;
    } catch (error) {
      console.error('Tracing error:', error);
      return null;
    }
  }
}

