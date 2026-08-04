import { describe, expect, it, vi } from 'vitest';
import {
  analyzeVisionFrame,
  createVisionFrameLease,
} from '../src/hooks/vision/vision-frame-memory-contract';

function fakeBitmap() {
  return { close: vi.fn() } as unknown as ImageBitmap;
}

describe('vision frame memory contract', () => {
  it('passes only an in-memory frame to the analyzer and releases it after success', async () => {
    const bitmap = fakeBitmap();
    const lease = createVisionFrameLease(bitmap, 123);
    const signal = new AbortController().signal;
    const analyzer = vi.fn(async (frame) => frame.capturedAt);

    await expect(analyzeVisionFrame(lease, analyzer, signal)).resolves.toBe(
      123,
    );

    expect(analyzer).toHaveBeenCalledWith(lease.frame, signal);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('releases the frame when analysis fails', async () => {
    const bitmap = fakeBitmap();
    const lease = createVisionFrameLease(bitmap);
    const error = new Error('analysis failed');

    await expect(
      analyzeVisionFrame(
        lease,
        async () => {
          throw error;
        },
        new AbortController().signal,
      ),
    ).rejects.toBe(error);

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('makes release idempotent for cancellation and disconnect cleanup', () => {
    const bitmap = fakeBitmap();
    const lease = createVisionFrameLease(bitmap);

    lease.release();
    lease.release();

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('passes cancellation to the analyzer before releasing the frame', async () => {
    const bitmap = fakeBitmap();
    const lease = createVisionFrameLease(bitmap);
    const controller = new AbortController();
    const analyzer = vi.fn(async (_frame, signal) => {
      expect(signal).toBe(controller.signal);
      expect(signal.aborted).toBe(true);
      return 'cancelled';
    });
    controller.abort();

    await expect(
      analyzeVisionFrame(lease, analyzer, controller.signal),
    ).resolves.toBe('cancelled');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
