/**
 * The pencil beside an item group on the invoice's items step (a new invoice only): open the item's
 * price form for the customer, and, when that form saved a rate, apply it to the lines of the item
 * as the step is shown again. Looking at a price writes nothing; the price row is created only if
 * the form is saved.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { t as tr } from '@/i18n';
import { getItemStoragePrices, listItemRates } from '@/services/item-pricing-service';
import { subscribeRatesChanged } from '@/features/item-pricing/contract';
import { applicableRate } from '@/features/item-pricing/rateModel';
import { findCustomerPrice } from '@/features/item-pricing/utils/findCustomerPrice';
import { toLocalISODate } from '@/utils/formatters';
import { serverText } from '@/utils/serverText';
import { createLogger } from '@/utils/logger';
import type { InvoiceHeaderData, InvoiceItemData } from '@/types/invoice.types';
import type { EditPricingParams } from '../components/items/InvoiceItemsEditor';

const log = createLogger('usePricingPencil');

interface Options {
  header: Pick<InvoiceHeaderData, 'customer_id' | 'customer_name' | 'one_time_charge'>;
  items: InvoiceItemData[];
  applySavedRatesToLines: (rates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }>) => void;
  showError: (title: string, message: string) => void;
}

export function usePricingPencil({ header, items, applySavedRatesToLines, showError }: Options) {
  // True while the price list is read before the form opens.
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);

  // The customer's own price row for an item group, read from the price list. Nothing is written.
  const findPriceFor = useCallback(
    async (itemId: string, weight: number) => {
      const result = await getItemStoragePrices({ p_filters: { item_ids: [itemId] }, p_limit: 100 });
      if (!result.success) return { ok: false as const, message: result.message };
      const price = findCustomerPrice(result.data, {
        item_id: itemId,
        customer_id: header.customer_id,
        weight,
        // The GRN's pricing mode decides which kind of price the invoice uses.
        price_type: header.one_time_charge ? 'one_time' : 'monthly',
        today: toLocalISODate(new Date()),
      });
      return { ok: true as const, price };
    },
    [header.customer_id, header.one_time_charge]
  );

  // The item group whose price form was opened. `saved` turns true only when the editor reports a
  // successful save, so leaving the editor without saving changes nothing on the invoice.
  const pendingPricingUpdate = useRef<{ item_id: string; weight: number; saved: boolean } | null>(null);
  useEffect(
    () =>
      subscribeRatesChanged(changedItem => {
        if (pendingPricingUpdate.current?.item_id === changedItem) pendingPricingUpdate.current.saved = true;
      }),
    []
  );

  // The latest lines and header, for the continuation below: it must read what the form holds when
  // the rates arrive, not what it held when it started.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const headerRef = useRef(header);
  headerRef.current = header;
  const showErrorRef = useRef(showError);
  showErrorRef.current = showError;
  // Raised whenever the screen loses focus or the form is cancelled: an answer that started
  // before that is dropped, so it never writes into a form that was left or discarded.
  const applyToken = useRef(0);
  // True once the form was cancelled: a saved rate is then no longer applied or retried.
  const discarded = useRef(false);

  // When the screen regains focus, apply the rates the editor saved: each line by its own weight and
  // goods-received day. Lines that were typed by hand keep their value (the form's override marks).
  useFocusEffect(
    useCallback(() => {
      const applyUpdatedPricing = async () => {
        const pending = pendingPricingUpdate.current;
        if (!pending || !pending.saved) {
          if (pending) pendingPricingUpdate.current = null;
          return;
        }
        const token = applyToken.current;
        const restore = () => {
          // Left before the answer came: try again the next time this step is shown.
          if (!discarded.current && !pendingPricingUpdate.current) {
            pendingPricingUpdate.current = pending;
          }
        };

        try {
          // Every rate of the item as saved (ended ones too: an older lot is priced by the rate of its own day).
          const rates = await listItemRates(pending.item_id);
          if (token !== applyToken.current) {
            restore();
            return;
          }
          const today = toLocalISODate(new Date());
          const current = headerRef.current;
          const updates: Array<{ temp_id: string; charge: number; labour_rate: number; tax: number }> = [];
          // Every line of the item, by its own weight: the saved change can move any of its bands.
          itemsRef.current
            .filter(line => line.item_id === pending.item_id)
            .forEach(line => {
              // The same rule invoices use: the customer's own rate before the default, narrowest band, latest start.
              const rate = applicableRate(rates, {
                customer_id: current.customer_id,
                weight: line.weight,
                price_type: current.one_time_charge ? 'one_time' : 'monthly',
                day: line.grn_date || today,
              });
              if (rate) {
                updates.push({ temp_id: line.temp_id, charge: rate.unit_price, labour_rate: rate.labour_rate, tax: rate.tax_percent });
              }
            });
          pendingPricingUpdate.current = null;
          if (updates.length > 0) applySavedRatesToLines(updates);
        } catch (error) {
          log.error('Error applying updated pricing:', error);
          if (token !== applyToken.current) {
            restore();
            return;
          }
          // Keep the saved marker: leaving this step and coming back tries again.
          showErrorRef.current(tr('invoice.items.ratesNotAppliedTitle'), tr('invoice.items.ratesNotAppliedMessage'));
        }
      };

      applyUpdatedPricing();
      return () => {
        applyToken.current += 1;
      };
    }, [applySavedRatesToLines])
  );

  const openingPricing = useRef(false);

  // Pencil beside an item group: open the price form. The customer's existing price opens for
  // editing; when there is none, an empty form opens filled from the line.
  const editPricing = useCallback(
    async (params: EditPricingParams) => {
      if (!header.customer_id) {
        showErrorRef.current(tr('invoice.items.selectCustomerTitle'), tr('invoice.items.selectCustomerMessage'));
        return;
      }

      // A second tap while the first is still reading would stack a second editor.
      if (openingPricing.current) return;
      openingPricing.current = true;
      setIsLoadingPricing(true);

      try {
        const found = await findPriceFor(params.item_id, params.weight);
        if (!found.ok) {
          showErrorRef.current(tr('invoice.items.pricingOpenFailedTitle'), serverText(found.message, tr('common.checkConnection')));
          return;
        }

        discarded.current = false;
        pendingPricingUpdate.current = { item_id: params.item_id, weight: params.weight, saved: false };
        // The editor resolves the rate itself (the customer's own rate in force on the goods-received
        // day, or a new customer rate copied from the default): it needs the line and its day. The
        // days are those of the tapped group's own lines; a group of several days uses the latest.
        const own = items.filter(
          i => i.item_id === params.item_id && i.weight === params.weight && (params.package_mark === undefined || i.package_mark === params.package_mark)
        );
        const days = [...new Set(own.map(i => i.grn_date).filter((d): d is string => Boolean(d)))].sort();
        const grn_date = days[days.length - 1];
        router.push({
          pathname: '/item-rates/edit',
          params: {
            mode: 'invoice',
            item_id: params.item_id,
            item_name: params.item_name,
            customer_id: header.customer_id,
            customer_name: header.customer_name,
            price_type: header.one_time_charge ? 'one_time' : 'monthly',
            unit_price: String(params.charge),
            labour_rate: String(params.labour_rate),
            tax_percent: String(params.tax),
            weight_min: '0',
            weight_max: String(params.weight),
            grn_date,
            ...(days.length > 1 ? { grn_dates_differ: '1' } : {}),
          },
        });
      } catch (error) {
        log.error('Error in editPricing:', error);
        showErrorRef.current(tr('invoice.items.pricingOpenFailedTitle'), tr('common.checkConnection'));
      } finally {
        openingPricing.current = false;
        setIsLoadingPricing(false);
      }
    },
    [header.customer_id, header.customer_name, header.one_time_charge, findPriceFor, items]
  );

  /** The form was cancelled: a saved rate is no longer applied. */
  const discard = useCallback(() => {
    discarded.current = true;
    applyToken.current += 1;
    pendingPricingUpdate.current = null;
  }, []);

  return { editPricing, isLoadingPricing, discard };
}
