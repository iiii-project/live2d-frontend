import { useCallback, useEffect, useState } from 'react';
import { useProactiveSpeak } from '@/context/proactive-speak-context';
import { useWebSocket } from '@/context/websocket-context';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';

interface UseAgentSettingsProps {
  onSave?: (callback: () => void) => () => void
  onCancel?: (callback: () => void) => () => void
}

export function useAgentSettings({ onSave, onCancel }: UseAgentSettingsProps = {}) {
  const { settings: persistedSettings, updateSettings } = useProactiveSpeak();
  const { sendMessage } = useWebSocket();
  const [maxResponseCharacters, setMaxResponseCharacters] = useLocalStorage('maxResponseCharacters', 500);

  const [tempSettings, setTempSettings] = useState({
    allowProactiveSpeak: persistedSettings.allowProactiveSpeak,
    idleSecondsToSpeak: persistedSettings.idleSecondsToSpeak,
    allowButtonTrigger: persistedSettings.allowButtonTrigger,
    maxResponseCharacters,
  });

  const [originalSettings, setOriginalSettings] = useState({
    ...persistedSettings,
    maxResponseCharacters,
  });

  useEffect(() => {
    if (persistedSettings) {
      const settings = { ...persistedSettings, maxResponseCharacters };
      setOriginalSettings(settings);
      setTempSettings(settings);
    }
  }, [persistedSettings, maxResponseCharacters]);

  const handleAllowProactiveSpeakChange = useCallback((checked: boolean) => {
    setTempSettings((prev) => ({
      ...prev,
      allowProactiveSpeak: checked,
    }));
  }, []);

  const handleIdleSecondsChange = useCallback((value: number) => {
    setTempSettings((prev) => ({
      ...prev,
      idleSecondsToSpeak: value,
    }));
  }, []);

  const handleAllowButtonTriggerChange = useCallback((checked: boolean) => {
    setTempSettings((prev) => ({
      ...prev,
      allowButtonTrigger: checked,
    }));
  }, []);

  const handleMaxResponseCharactersChange = useCallback((value: number) => {
    setTempSettings((prev) => ({ ...prev, maxResponseCharacters: value }));
  }, []);

  const handleSave = useCallback(() => {
    updateSettings(tempSettings);
    setMaxResponseCharacters(tempSettings.maxResponseCharacters);
    sendMessage({
      type: 'update-response-quality-settings',
      max_response_characters: tempSettings.maxResponseCharacters,
    });
    setOriginalSettings(tempSettings);
  }, [updateSettings, tempSettings, setMaxResponseCharacters, sendMessage]);

  const handleCancel = useCallback(() => {
    setTempSettings(originalSettings);
    updateSettings(originalSettings);
  }, [originalSettings, updateSettings]);

  useEffect(() => {
    if (!onSave || !onCancel) return;

    const cleanupSave = onSave(handleSave);
    const cleanupCancel = onCancel(handleCancel);

    return () => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [onSave, onCancel, handleSave, handleCancel]);

  return {
    settings: tempSettings,
    handleAllowProactiveSpeakChange,
    handleIdleSecondsChange,
    handleAllowButtonTriggerChange,
    handleMaxResponseCharactersChange,
  };
}
