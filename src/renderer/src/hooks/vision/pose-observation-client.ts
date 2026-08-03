import type { PoseObservationSummary } from './pose-observation-summary';

export interface PoseObservationPayload extends PoseObservationSummary {
  client_uid: string;
  motion_description?: string;
}

export async function submitPoseObservation(
  baseUrl: string,
  payload: PoseObservationPayload,
) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/api/v1/pose-observations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (response.status !== 202) {
    let detail = '';
    try {
      detail = ` ${JSON.stringify(await response.json())}`;
    } catch {
      detail = '';
    }
    throw new Error(
      `Pose observation request failed with status ${response.status}${detail}`,
    );
  }
}

export async function submitPoseObservationWithRetry(
  baseUrl: string,
  payload: PoseObservationPayload,
  onRetry: () => void,
  retryDelay = (attempt: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, attempt * 500);
    }),
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await submitPoseObservation(baseUrl, payload);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      onRetry();
      await retryDelay(attempt);
    }
  }
}
