import type { LocalVisionEvent } from './use-local-vision-recognition';

export interface VisionEventPayload {
  event: LocalVisionEvent;
  client_uid: string;
  timestamp: number;
  confidence: number;
}

export async function submitVisionEvent(baseUrl: string, payload: VisionEventPayload) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/vision-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status !== 202) {
    throw new Error(`Vision event request failed with status ${response.status}`);
  }
}

export async function submitVisionEventWithRetry(
  baseUrl: string,
  payload: VisionEventPayload,
  onRetry: () => void,
  retryDelay = (attempt: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, attempt * 500);
  }),
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await submitVisionEvent(baseUrl, payload);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      onRetry();
      await retryDelay(attempt);
    }
  }
}
