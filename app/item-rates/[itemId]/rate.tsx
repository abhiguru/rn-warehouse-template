/**
 * Items → an item → Pricing → "+ Add rate", "Correct this rate" or "Change": the full-screen form of the item's
 * default rate (RateForm). `mode` is add, addBand, change (Change rate: the copy form), correct or upcoming; `price_type` is the type chosen on the tab;
 * `starts_on` names the period being corrected or changed.
 */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RateForm } from '@/features/item-pricing/components/RateForm';

export default function ItemRateFormScreen() {
  const params = useLocalSearchParams<{ itemId: string; mode?: string; price_type?: string; starts_on?: string }>();
  // 'change' (Change rate) is today's copy form: the editor's mode add, with its own title.
  const mode = params.mode === 'correct' || params.mode === 'upcoming' || params.mode === 'addBand' ? params.mode : 'add';
  return (
    <RateForm
      itemId={String(params.itemId ?? '')}
      mode={mode}
      changeRate={params.mode === 'change'}
      priceType={params.price_type === 'one_time' ? 'one_time' : 'monthly'}
      startsOn={typeof params.starts_on === 'string' ? params.starts_on : undefined}
    />
  );
}
