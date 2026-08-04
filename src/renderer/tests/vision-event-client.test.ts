import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitVisionEvent, submitVisionEventWithRetry } from '../src/hooks/vision/vision-event-client';
import type { VisionEventPayload } from '../src/hooks/vision/vision-event-client';

const payload: VisionEventPayload = {
  event: 'wave',
  client_uid: 'client-123',
  timestamp: 1_722_000_000_000,
  confidence: 0.82,
};

describe('submitVisionEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    'wave', 'thumbs_up', 'thumbs_down', 'victory', 'love_you', 'pointing_up', 'fist', 'hug', 'heart',
    'smile', 'mouth_open', 'surprised', 'sad', 'angry', 'wink', 'kiss', 'tongue_out', 'eyebrow_raise',
  ] as const)('sends %s using only the versioned API contract fields', async (event) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitVisionEvent('http://localhost:12393/', { ...payload, event });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:12393/api/v1/vision-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, event }),
    });
    expect(Object.keys(JSON.parse(fetchMock.mock.calls[0][1].body))).toEqual([
      'event', 'client_uid', 'timestamp', 'confidence',
    ]);
  });

  it('rejects responses that are not accepted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(submitVisionEvent('http://localhost:12393', payload)).rejects.toThrow(
      'Vision event request failed with status 500',
    );
  });

  it('retries a failed request before succeeding', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const onRetry = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await submitVisionEventWithRetry('http://localhost:12393', payload, onRetry, async () => {});

    expect(onRetry).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
