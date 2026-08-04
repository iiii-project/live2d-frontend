export const VISION_OBSERVATION_VERSION = 1 as const;
export const MIN_VISION_SAMPLING_INTERVAL_MS = 250;
export const MAX_VISION_SAMPLING_INTERVAL_MS = 3000;

export interface VisionObservationFrame {
  source: 'camera';
  data: string;
  mime_type: 'image/jpeg' | 'image/png';
}

export interface VisionObservationMessage {
  type: 'vision-observation';
  version: typeof VISION_OBSERVATION_VERSION;
  client_uid: string;
  sequence: number;
  captured_at_ms: number;
  sampling_interval_ms: number;
  frame: VisionObservationFrame;
}

export function isVisionObservationMessage(
  value: unknown,
): value is VisionObservationMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<VisionObservationMessage>;
  return (
    message.type === 'vision-observation' &&
    message.version === VISION_OBSERVATION_VERSION &&
    typeof message.client_uid === 'string' &&
    message.client_uid.length > 0 &&
    typeof message.sequence === 'number' &&
    Number.isInteger(message.sequence) &&
    message.sequence >= 0 &&
    typeof message.captured_at_ms === 'number' &&
    Number.isInteger(message.captured_at_ms) &&
    message.captured_at_ms >= 0 &&
    typeof message.sampling_interval_ms === 'number' &&
    Number.isInteger(message.sampling_interval_ms) &&
    message.sampling_interval_ms >= MIN_VISION_SAMPLING_INTERVAL_MS &&
    message.sampling_interval_ms <= MAX_VISION_SAMPLING_INTERVAL_MS &&
    !!message.frame &&
    message.frame.source === 'camera' &&
    typeof message.frame.data === 'string' &&
    message.frame.data.length > 0 &&
    (message.frame.mime_type === 'image/jpeg' ||
      message.frame.mime_type === 'image/png')
  );
}
