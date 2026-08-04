import { ChangeEvent, KeyboardEvent, useEffect, useState } from 'react';
import { useVAD } from '@/context/vad-context';
import { useWebSocket } from '@/context/websocket-context';
import { useTextInput } from '@/hooks/footer/use-text-input';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useMicToggle } from '@/hooks/utils/use-mic-toggle';
import { useAudioTask } from '@/components/canvas/live2d';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAiState, AiStateEnum } from '@/context/ai-state-context';
import { useTriggerSpeak } from '@/hooks/utils/use-trigger-speak';
import { useProactiveSpeak } from '@/context/proactive-speak-context';

export const useFooter = () => {
  const {
    inputText: inputValue,
    setInputText: handleChange,
    handleKeyPress: handleKey,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextInput();

  const { interrupt } = useInterrupt();
  const { startMic, stopMic, autoStartMicOn } = useVAD();
  const { handleMicToggle, micOn } = useMicToggle();
  const { setAiState, aiState } = useAiState();
  const { sendTriggerSignal } = useTriggerSpeak();
  const { settings } = useProactiveSpeak();
  const { sendMessage } = useWebSocket();
  const { stopCurrentAudioAndLipSync } = useAudioTask();
  const [quiet, setQuiet] = useState(false);

  useEffect(() => {
    const handleAutomaticQuietMode = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail
        ?.enabled;
      if (enabled) {
        setQuiet(true);
        stopCurrentAudioAndLipSync();
        audioTaskQueue.clearQueue();
        stopMic();
        setAiState(AiStateEnum.INTERRUPTED);
      }
    };
    window.addEventListener('realtime-quiet-mode', handleAutomaticQuietMode);
    return () =>
      window.removeEventListener(
        'realtime-quiet-mode',
        handleAutomaticQuietMode,
      );
  }, [setAiState, stopCurrentAudioAndLipSync, stopMic]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    handleChange({
      target: { value: e.target.value },
    } as ChangeEvent<HTMLInputElement>);
    setAiState(AiStateEnum.WAITING);
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    handleKey(e as any);
  };

  const handleInterrupt = () => {
    if (aiState === AiStateEnum.THINKING_SPEAKING) {
      interrupt();
      if (autoStartMicOn) {
        startMic();
      }
    } else if (settings.allowButtonTrigger) {
      sendTriggerSignal(-1);
    }
  };

  const handleQuietToggle = () => {
    const enabled = !quiet;
    setQuiet(enabled);
    if (enabled) {
      interrupt();
      stopCurrentAudioAndLipSync();
      audioTaskQueue.clearQueue();
      stopMic();
      setAiState(AiStateEnum.INTERRUPTED);
    } else {
      setAiState(AiStateEnum.IDLE);
    }
    sendMessage({ type: 'quiet-mode', enabled });
  };

  return {
    inputValue,
    handleInputChange,
    handleKeyPress,
    handleCompositionStart,
    handleCompositionEnd,
    handleInterrupt,
    handleQuietToggle,
    quiet,
    handleMicToggle,
    micOn,
  };
};
