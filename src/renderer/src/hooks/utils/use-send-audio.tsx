import { useCallback } from "react";
import { useWebSocket } from "@/context/websocket-context";

export function useSendAudio() {
  const { sendMessage } = useWebSocket();

  const sendAudioPartition = useCallback(
    async (audio: Float32Array) => {
      const chunkSize = 4096;

      // Send the audio data in chunks
      for (let index = 0; index < audio.length; index += chunkSize) {
        const endIndex = Math.min(index + chunkSize, audio.length);
        const chunk = audio.slice(index, endIndex);
        sendMessage({
          type: "mic-audio-data",
          audio: Array.from(chunk),
        });
      }

      // Send end signal after all chunks
      sendMessage({ type: "mic-audio-end" });
    },
    [sendMessage],
  );

  return {
    sendAudioPartition,
  };
}
