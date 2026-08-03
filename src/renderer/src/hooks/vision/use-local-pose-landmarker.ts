import { useEffect, useRef, useState } from 'react';
import {
  COORDINATE_SYSTEM,
  PoseLandmarkRecorder,
} from './pose-landmark-recorder';
import type { PoseObservationFrame } from './pose-landmark-recorder';
import { PoseObservationBuffer } from './pose-observation-summary';
import type { PoseObservationSummary } from './pose-observation-summary';

export const LOCAL_POSE_OBSERVATION = 'local-pose-observation';
export const LOCAL_POSE_OBSERVATION_SUMMARY = 'local-pose-observation-summary';

export function useLocalPoseLandmarker(
  videoRef: React.RefObject<HTMLVideoElement>,
  isStreaming: boolean,
) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastObservation, setLastObservation] =
    useState<PoseObservationFrame | null>(null);
  const [observationCount, setObservationCount] = useState(0);
  const [lastSummary, setLastSummary] = useState<PoseObservationSummary | null>(
    null,
  );
  const [summaryCount, setSummaryCount] = useState(0);
  const recorderRef = useRef<PoseLandmarkRecorder | null>(null);
  const bufferRef = useRef(new PoseObservationBuffer());

  useEffect(() => {
    if (!isStreaming) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      bufferRef.current.reset();
      setIsTracking(false);
      return undefined;
    }

    let cancelled = false;
    const recorder = new PoseLandmarkRecorder();
    recorderRef.current = recorder;
    bufferRef.current.reset();

    const unsubscribe = recorder.subscribe((frame) => {
      if (cancelled) return;
      setLastObservation(frame);
      setObservationCount((count) => count + 1);
      window.dispatchEvent(
        new CustomEvent<PoseObservationFrame>(LOCAL_POSE_OBSERVATION, {
          detail: frame,
        }),
      );
      const summary = bufferRef.current.push(frame);
      if (summary) {
        setLastSummary(summary);
        setSummaryCount((count) => count + 1);
        window.dispatchEvent(
          new CustomEvent<PoseObservationSummary>(
            LOCAL_POSE_OBSERVATION_SUMMARY,
            { detail: summary },
          ),
        );
      }
    });

    const start = async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        await recorder.start(video);
        if (!cancelled) setIsTracking(true);
      } catch (error) {
        console.error('Failed to initialize local pose landmarker:', error);
      }
    };
    void start();

    return () => {
      cancelled = true;
      unsubscribe();
      recorder.stop();
      if (recorderRef.current === recorder) recorderRef.current = null;
      setIsTracking(false);
    };
  }, [isStreaming, videoRef]);

  return {
    isTracking,
    lastObservation,
    observationCount,
    lastSummary,
    summaryCount,
    coordinateSystem: COORDINATE_SYSTEM,
  };
}
