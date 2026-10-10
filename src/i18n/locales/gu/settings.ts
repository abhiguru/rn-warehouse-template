/** Gujarati text: settings. Follows docs/GUJARATI_GLOSSARY.md. */
import type { settings as source } from '../en/settings';
import type { Translation } from '../../types';

export const settings: Translation<typeof source> = {
  language: {
    title: 'ભાષા',
    system: 'ફોનની ભાષા',
    footerSystem: 'તમારા ફોનની ભાષા મુજબ. ઍપ હાલ ગુજરાતીમાં છે.',
    footerChosen: 'ઍપ ગુજરાતીમાં છે.',
    optionLabel: '{{language}} ભાષા',
  },
};
