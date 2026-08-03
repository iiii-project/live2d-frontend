import type { PoseObservationFrame } from './pose-landmark-recorder';
import type { PoseObservationSummary } from './pose-observation-summary';

export const LOCAL_POSE_PROCESSING_STARTED = 'local-pose-processing-started';
export const LOCAL_POSE_PROCESSING_COMPLETE = 'local-pose-processing-complete';
export const LOCAL_POSE_MOTION_WINDOW = 'local-pose-motion-window';

export interface LocalPoseMotionWindow {
  summary: PoseObservationSummary;
  frames: PoseObservationFrame[];
}
