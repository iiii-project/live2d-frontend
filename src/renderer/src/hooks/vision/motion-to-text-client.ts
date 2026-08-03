import type { PoseObservationFrame } from './pose-landmark-recorder';
import { convertPoseFramesToHumanML3D } from './humanml3d-motion';

export async function motionToText(
  baseUrl: string,
  frames: PoseObservationFrame[],
): Promise<string> {
  console.info('[Pose] Converting motion window:', frames.length, 'frames');
  let motion: number[][];
  try {
    motion = convertPoseFramesToHumanML3D(frames);
  } catch (error) {
    console.error('[Pose] HumanML3D conversion failed:', error);
    throw error;
  }
  console.info('[Pose] Sending motion window to M2T:', motion.length, 'x', motion[0]?.length);
  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/api/v1/motion-to-text/json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motion }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Motion-to-text request failed: ${response.status} ${detail}`);
  }
  const result = (await response.json()) as { description?: string };
  if (!result.description) throw new Error('Motion-to-text response has no description');
  console.info('[Pose] M2T description received:', result.description);
  return result.description;
}
