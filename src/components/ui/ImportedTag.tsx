/**
 * ImportedTag: the mark on a GRN, dispatch or invoice that was imported from the previous system (WH-180).
 * A neutral StatusTag with an icon, so the mark never relies on colour alone (style guide §3.5).
 */
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { t } from '@/i18n';
import { StatusTag } from './StatusTag';

export function ImportedTag({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  return <StatusTag status="neutral" icon="tray-arrow-down" label={t('common.importedTag')} style={style} testID={testID} />;
}

export default ImportedTag;
