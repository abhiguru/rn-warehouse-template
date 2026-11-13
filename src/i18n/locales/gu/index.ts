import type { en } from '../en';
import type { FullTranslation, Translation } from '../../types';
import { common } from './common';
import { auth } from './auth';
import { central } from './central';
import { nav } from './nav';
import { filters } from './filters';
import { grn } from './grn';
import { dispatch } from './dispatch';
import { invoice } from './invoice';
import { orders } from './orders';
import { customers } from './customers';
import { items } from './items';
import { lists } from './lists';
import { pricing } from './pricing';
import { reports } from './reports';
import { settings } from './settings';
import { numbering } from './numbering';
import { charging } from './charging';
import { payments } from './payments';
import { gst } from './gst';
import { connectionHistory } from './connectionHistory';
import { users } from './users';
import { sensors } from './sensors';
import { errors } from './errors';
import { validation } from './validation';
import { components } from './components';

/** Every Gujarati text of the app. An extra key is a compile error; a missing key falls back to English (see types.ts). */
const guTexts: Translation<typeof en> = {
  common,
  auth,
  central,
  nav,
  filters,
  grn,
  dispatch,
  invoice,
  orders,
  customers,
  items,
  lists,
  pricing,
  reports,
  settings,
  numbering,
  charging,
  payments,
  gst,
  connectionHistory,
  users,
  sensors,
  errors,
  validation,
  components,
};

/** Exposed as complete, so code and tests read it as before; `t` falls back to English for a missing key. */
export const gu = guTexts as FullTranslation<typeof en>;
