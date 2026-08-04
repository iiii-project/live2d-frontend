/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable react-hooks/rules-of-hooks */
import { Stack, createListCollection } from '@chakra-ui/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { settingStyles } from './setting-styles';
import { useLive2dSettings } from '@/hooks/sidebar/setting/use-live2d-settings';
import { SelectField, SwitchField } from './common';

interface live2DProps {
  onSave?: (callback: () => void) => () => void;
  onCancel?: (callback: () => void) => () => void;
}

function live2D({ onSave, onCancel }: live2DProps): JSX.Element {
  const { t } = useTranslation();
  const {
    modelInfo,
    availableModels,
    handleModelChange,
    handleInputChange,
    handleSave,
    handleCancel,
  } = useLive2dSettings();
  const modelCollection = createListCollection({
    items: availableModels.map((model) => ({
      label: model.name,
      value: model.name,
    })),
  });

  useEffect(() => {
    if (!onSave || !onCancel) return;

    const cleanupSave = onSave(handleSave);
    const cleanupCancel = onCancel(handleCancel);

    return (): void => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [onSave, onCancel]);

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={t('settings.live2d.model')}
        value={modelInfo.name ? [modelInfo.name] : []}
        onChange={(value) => value[0] && handleModelChange(value[0])}
        collection={modelCollection}
        placeholder={t('settings.live2d.modelPlaceholder')}
      />

      <SwitchField
        label={t('settings.live2d.pointerInteractive')}
        checked={modelInfo.pointerInteractive ?? false}
        onChange={(checked) => handleInputChange('pointerInteractive', checked)}
      />

      <SwitchField
        label={t('settings.live2d.scrollToResize')}
        checked={modelInfo.scrollToResize ?? true}
        onChange={(checked) => handleInputChange('scrollToResize', checked)}
      />
    </Stack>
  );
}

export default live2D;
