import { useCallback } from 'react';
import { useWebSocket } from '@/context/websocket-context';

export function useTriggerSpeak() {
  const { sendMessage } = useWebSocket();

  const sendTriggerSignal = useCallback(
    async (actualIdleTime: number) => {
      sendMessage({
        type: "ai-speak-signal",
        idle_time: actualIdleTime,
      });
    },
    [sendMessage],
  );

  return {
    sendTriggerSignal,
  };
}
