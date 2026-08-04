import { useState, useEffect, useRef } from 'react';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useWebSocket } from '@/context/websocket-context';

interface Live2DModelEntry {
  name: string;
  model_info: ModelInfo;
}

export const useLive2dSettings = () => {
  const Live2DConfigContext = useLive2DConfig();
  const { baseUrl } = useWebSocket();

  const initialModelInfo: ModelInfo = {
    url: '',
    kScale: 0.5,
    initialXshift: 0,
    initialYshift: 0,
    emotionMap: {},
    scrollToResize: true,
  };

  const [modelInfo, setModelInfoState] = useState<ModelInfo>(
    Live2DConfigContext?.modelInfo || initialModelInfo,
  );
  const [originalModelInfo, setOriginalModelInfo] = useState<ModelInfo>(
    Live2DConfigContext?.modelInfo || initialModelInfo,
  );
  const [availableModels, setAvailableModels] = useState<Live2DModelEntry[]>(
    [],
  );
  const internalModelUpdate = useRef(false);

  useEffect(() => {
    let active = true;
    fetch(`${baseUrl}/live2d-models/info`)
      .then((response) => response.json())
      .then((data: { characters?: Live2DModelEntry[] }) => {
        if (active) {
          const models = (data.characters ?? []).map((model) => ({
            ...model,
            model_info: {
              ...model.model_info,
              url: new URL(model.model_info.url, baseUrl).toString(),
            },
          }));
          setAvailableModels(models);
          if (
            modelInfo.url &&
            models.length > 0 &&
            !models.some((model) => model.model_info.url === modelInfo.url)
          ) {
            setModelInfoState((prev) => ({ ...prev, ...models[0].model_info }));
            Live2DConfigContext?.setModelInfo({
              ...modelInfo,
              ...models[0].model_info,
            });
          }
        }
      })
      .catch(() => {
        if (active) setAvailableModels([]);
      });
    return () => {
      active = false;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (Live2DConfigContext?.modelInfo) {
      if (internalModelUpdate.current) {
        internalModelUpdate.current = false;
        return;
      }
      if (
        JSON.stringify(Live2DConfigContext.modelInfo) !==
        JSON.stringify(originalModelInfo)
      ) {
        setOriginalModelInfo(Live2DConfigContext.modelInfo);
        setModelInfoState(Live2DConfigContext.modelInfo);
      }
    }
  }, [Live2DConfigContext?.modelInfo]);

  useEffect(() => {
    if (Live2DConfigContext && modelInfo) {
      Live2DConfigContext.setModelInfo(modelInfo);
    }
  }, [modelInfo.pointerInteractive, modelInfo.scrollToResize]);

  const handleInputChange = (
    key: keyof ModelInfo,
    value: ModelInfo[keyof ModelInfo],
  ): void => {
    setModelInfoState((prev) => ({ ...prev, [key]: value }));
  };

  const handleModelChange = (name: string): void => {
    const selectedModel = availableModels.find((model) => model.name === name);
    if (selectedModel) {
      const nextModelInfo = { ...modelInfo, ...selectedModel.model_info };
      setModelInfoState(nextModelInfo);
      internalModelUpdate.current = true;
      Live2DConfigContext?.setModelInfo(nextModelInfo);
    }
  };

  const handleSave = (): void => {
    if (Live2DConfigContext && modelInfo) {
      setOriginalModelInfo(modelInfo);
    }
  };

  const handleCancel = (): void => {
    setModelInfoState(originalModelInfo);
    if (Live2DConfigContext && originalModelInfo) {
      Live2DConfigContext.setModelInfo(originalModelInfo);
    }
  };

  return {
    modelInfo,
    availableModels,
    handleModelChange,
    handleInputChange,
    handleSave,
    handleCancel,
  };
};
