/**
 * In-memory handoff between the camera capture owner and a vision analyzer.
 * The analyzer must never receive a data URL, base64 string, Blob, or path.
 */
export interface VisionFrame {
  readonly bitmap: ImageBitmap;
  readonly capturedAt: number;
}

export interface VisionFrameLease {
  readonly frame: VisionFrame;
  release(): void;
}

export type VisionFrameAnalyzer<TResult> = (
  frame: VisionFrame,
  signal: AbortSignal,
) => Promise<TResult>;

export function createVisionFrameLease(
  bitmap: ImageBitmap,
  capturedAt = performance.now(),
): VisionFrameLease {
  let released = false;
  const frame: VisionFrame = { bitmap, capturedAt };

  return {
    frame,
    release() {
      if (released) return;
      released = true;
      bitmap.close();
    },
  };
}

/**
 * Owns the frame only for the duration of analysis. Cancellation is signalled
 * to the analyzer; release remains guaranteed when it resolves or rejects.
 */
export async function analyzeVisionFrame<TResult>(
  lease: VisionFrameLease,
  analyzer: VisionFrameAnalyzer<TResult>,
  signal: AbortSignal,
): Promise<TResult> {
  try {
    return await analyzer(lease.frame, signal);
  } finally {
    lease.release();
  }
}
