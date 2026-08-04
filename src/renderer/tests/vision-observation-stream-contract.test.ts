import { describe, expect, it } from 'vitest';
import {
  isVisionObservationMessage,
  type VisionObservationMessage,
} from '../src/hooks/vision/vision-observation-stream-contract';

const validMessage: VisionObservationMessage = {
  type: 'vision-observation',
  version: 1,
  client_uid: 'client-1',
  sequence: 4,
  captured_at_ms: 10_000,
  sampling_interval_ms: 1_000,
  frame: { source: 'camera', data: 'encoded-frame', mime_type: 'image/jpeg' },
};

describe('vision observation stream contract', () => {
  it('accepts a valid observation message', () => {
    expect(isVisionObservationMessage(validMessage)).toBe(true);
  });

  it('rejects speak triggers, invalid timestamps, and invalid sampling intervals', () => {
    expect(
      isVisionObservationMessage({ ...validMessage, type: 'ai-speak-signal' }),
    ).toBe(false);
    expect(
      isVisionObservationMessage({ ...validMessage, captured_at_ms: 1.5 }),
    ).toBe(false);
    expect(
      isVisionObservationMessage({
        ...validMessage,
        sampling_interval_ms: 3_001,
      }),
    ).toBe(false);
  });

  it('rejects duplicate-sensitive fields that are missing or invalid', () => {
    expect(
      isVisionObservationMessage({ ...validMessage, client_uid: '' }),
    ).toBe(false);
    expect(isVisionObservationMessage({ ...validMessage, sequence: -1 })).toBe(
      false,
    );
    expect(
      isVisionObservationMessage({
        ...validMessage,
        frame: { ...validMessage.frame, data: '' },
      }),
    ).toBe(false);
  });
});
