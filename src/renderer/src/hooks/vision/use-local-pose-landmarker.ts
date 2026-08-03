import { useEffect, useRef, useState } from 'react';
import { COORDINATE_SYSTEM, PoseLandmarkRecorder } from './pose-landmark-recorder';
import type { PoseObservationFrame } from './pose-landmark-recorder';

export const LOCAL_POSE_OBSERVATION = 'local-pose-observation';

export function useLocalPoseLandmarker(videoRef: React.RefObject<HTMLVideoElement>, isStreaming: boolean) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastObservation, setLastObservation] = useState<PoseObservationFrame | null>(null);
  const [observationCount, setObservationCount] = useState(0);
  const recorderRef = useRef<PoseLandmarkRecorder | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      setIsTracking(false);
      return undefined;
    }

    let cancelled = false;
    const recorder = new PoseLandmarkRecorder();
    recorderRef.current = recorder;

    const unsubscribe = recorder.subscribe((frame) => {
      if (cancelled) return;
      setLastObservation(frame);
      setObservationCount((count) => count + 1);
      window.dispatchEvent(new CustomEvent<PoseObservationFrame>(LOCAL_POSE_OBSERVATION, { detail: frame }));
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

  return { isTracking, lastObservation, observationCount, coordinateSystem: COORDINATE_SYSTEM };
}
