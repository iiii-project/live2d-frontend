import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  submitPoseObservation,
  submitPoseObservationWithRetry,
  type PoseObservationPayload,
} from '../src/hooks/vision/pose-observation-client';
import { COORDINATE_SYSTEM } from '../src/hooks/vision/pose-landmark-recorder';
import type { PoseObservationFrame } from '../src/hooks/vision/pose-landmark-recorder';
import { buildPoseObservationSummary } from '../src/hooks/vision/pose-observation-summary';
import type { PoseObservationSummary } from '../src/hooks/vision/pose-observation-summary';

const CLIENT_UID = 'client-123';

function makeFrame(t: number): PoseObservationFrame {
  return {
    version: 1,
    relativeTimeMs: t,
    mediaTimestampMs: t,
    coordinateSystem: COORDINATE_SYSTEM,
    body: {
      detected: true,
      landmarks: Array.from({ length: 33 }, (_, index) => ({
        index,
        x: 0.4,
        y: 0.5,
        z: 0,
        visibility: 0.9,
        visible: true,
      })),
    },
    face: {
      detected: true,
      landmarks: [
        { index: 0, x: 0.5, y: 0.5, z: 0, visibility: null, visible: true },
      ],
    },
    hands: {
      detected: true,
      landmarks: [],
      handedness: [],
    },
  };
}

function summaryFixture(): PoseObservationSummary {
  const frames: PoseObservationFrame[] = [];
  for (let t = 0; t <= 5_000; t += 50) frames.push(makeFrame(t));
  return buildPoseObservationSummary(frames);
}

function payloadFixture(): PoseObservationPayload {
  return { ...summaryFixture(), client_uid: CLIENT_UID };
}

describe('submitPoseObservation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs the summary with client_uid to the versioned pose observations endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = payloadFixture();

    await submitPoseObservation('http://localhost:12393/', payload);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:12393/api/v1/pose-observations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
  });

  it('includes a non-empty client_uid in the payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitPoseObservation('http://localhost:12393', payloadFixture());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.client_uid).toBe(CLIENT_UID);
    expect(typeof body.client_uid).toBe('string');
  });

  it('keeps the payload to the objective pose observation contract plus client_uid only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const summary = summaryFixture();

    await submitPoseObservation('http://localhost:12393', payloadFixture());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual([...Object.keys(summary), 'client_uid']);
  });

  it('never includes raw image fields or fixed action labels in the payload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitPoseObservation('http://localhost:12393', payloadFixture());

    const serialized = JSON.stringify(
      JSON.parse(fetchMock.mock.calls[0][1].body),
    );
    expect(serialized).not.toMatch(/image|rawImage|base64|pixels|video_frame/);
    expect(serialized).not.toMatch(
      /wave|thumbs_up|smile|mouth_open|hug|heart|intent|action|gesture/,
    );
  });

  it('sends integer millisecond timestamps for every time field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await submitPoseObservation('http://localhost:12393', payloadFixture());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const intFields: Array<[unknown, string]> = [
      [body.period, 'startRelativeTimeMs'],
      [body.period, 'endRelativeTimeMs'],
      [body.period, 'durationMs'],
      [body.period, 'frameCount'],
      [body.period, 'submittedSampleCount'],
      [body.samples[0], 'relativeTimeMs'],
      [body.samples[0], 'sourceRelativeTimeMs'],
      [body.trajectories[0], 'startRelativeTimeMs'],
      [body.trajectories[0], 'endRelativeTimeMs'],
      [body.repetitions[0], 'cycleStartTimesMs'],
    ];
    for (const [object, field] of intFields) {
      const value = (object as Record<string, unknown>)[field];
      if (Array.isArray(value)) {
        for (const item of value) expect(Number.isInteger(item)).toBe(true);
      } else {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('rejects responses that are not accepted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 422 })),
    );

    await expect(
      submitPoseObservation('http://localhost:12393', payloadFixture()),
    ).rejects.toThrow('Pose observation request failed with status 422');
  });
});

describe('submitPoseObservationWithRetry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a failed request before succeeding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const onRetry = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await submitPoseObservationWithRetry(
      'http://localhost:12393',
      payloadFixture(),
      onRetry,
      async () => {},
    );

    expect(onRetry).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not affect the next observation cycle when a submission fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const onRetry = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      submitPoseObservationWithRetry(
        'http://localhost:12393',
        payloadFixture(),
        onRetry,
        async () => {},
      ),
    ).rejects.toThrow('Pose observation request failed with status 500');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await submitPoseObservationWithRetry(
      'http://localhost:12393',
      payloadFixture(),
      onRetry,
      async () => {},
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
