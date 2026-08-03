import { useEffect, useRef, useState } from 'react';
import { useGroup } from '@/context/group-context';
import { useWebSocket } from '@/context/websocket-context';
import { LOCAL_VISION_EVENT } from './use-local-vision-recognition';
import type { LocalVisionEvent } from './use-local-vision-recognition';
import { submitVisionEventWithRetry, VisionEventPayload } from './vision-event-client';

type VisionEventSubmissionStatus = 'idle' | 'sending' | 'retrying' | 'failed';

interface LocalVisionEventDetail {
  event: LocalVisionEvent;
  timestamp: number;
  confidence: number;
}

export function useVisionEventSubmission() {
  const { baseUrl } = useWebSocket();
  const { selfUid } = useGroup();
  const [status, setStatus] = useState<VisionEventSubmissionStatus>('idle');
  const activeRequestsRef = useRef(0);

  useEffect(() => {
    const submit = async (event: CustomEvent<LocalVisionEventDetail>) => {
      if (!selfUid) return;

      const payload: VisionEventPayload = {
        event: event.detail.event,
        client_uid: selfUid,
        timestamp: event.detail.timestamp,
        confidence: event.detail.confidence,
      };
      activeRequestsRef.current += 1;
      setStatus('sending');

      try {
        await submitVisionEventWithRetry(baseUrl, payload, () => setStatus('retrying'));
      } catch (error) {
        console.error('Failed to submit vision event:', error);
        setStatus('failed');
      } finally {
        activeRequestsRef.current -= 1;
        if (activeRequestsRef.current === 0) {
          setStatus((currentStatus) => (currentStatus === 'failed' ? currentStatus : 'idle'));
        }
      }
    };

    const listener: EventListener = (event) => {
      void submit(event as CustomEvent<LocalVisionEventDetail>);
    };
    window.addEventListener(LOCAL_VISION_EVENT, listener);
    return () => window.removeEventListener(LOCAL_VISION_EVENT, listener);
  }, [baseUrl, selfUid]);

  return { visionEventSubmissionStatus: status };
}
