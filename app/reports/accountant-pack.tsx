/**
 * Accountant pack (WH-158, backend migration 204): a zip of a period's invoices, receipts and stock, made on the server,
 * for the facility's accountant. Administrators and supervisors (route guard `accountantPack`).
 *
 * It opens with the last complete month. The server is the authority on the period; the screen checks the one rule it can see
 * at once (both dates inside one financial year, April to March) so a wrong choice is told before anything is sent. One request
 * runs at a time, and the dates stay whatever the answer is. The zip is handed to the share sheet under the name the server gave.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ReportHeader } from '@/components/reports';
import { Button } from '@/components/ui/Button';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { PACK_CODE, makeAccountantPack } from '@/features/reports/accountantPackService';
import { useThemedStyles } from '@/hooks/useTheme';
import { t as tr } from '@/i18n';
import { layout, space, typography, type ThemeTokens } from '@/theme/tokens';
import { showAlert } from '@/utils/alert';
import { todayInIST, toLocalISODate } from '@/utils/formatters';
import { createLogger } from '@/utils/logger';
import { shareFileBytes } from '@/utils/shareDocument';

const log = createLogger('accountantPackScreen');

const ZIP_TYPE = { mimeType: 'application/zip', UTI: 'public.zip-archive' } as const;

/** The financial year (April to March) a date is in, named by the year it starts. */
const financialYearOf = (date: Date): number => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

const makeStyles = (t: ThemeTokens) => ({
  container: { flex: 1, backgroundColor: t.background.base },
  form: { paddingHorizontal: layout.marginCompact, paddingTop: space.lg, paddingBottom: space.xxl, gap: space.md },
  problem: { ...typography.subhead, color: t.status.negative.text },
  note: { ...typography.footnote, color: t.text.secondary },
});

export default function AccountantPackScreen() {
  const styles = useThemedStyles(makeStyles);
  const today = useMemo(() => todayInIST(), []);
  const [from, setFrom] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const [to, setTo] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 0));
  // What the server said about the period (nothing in it, two financial years): shown inline until a date changes.
  const [serverProblem, setServerProblem] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const makingRef = useRef(false);

  const fromDay = toLocalISODate(from);
  const toDay = toLocalISODate(to);
  const oneYearProblem = financialYearOf(from) !== financialYearOf(to) ? tr('reports.accountantPack.packOneYear') : null;
  const problem = oneYearProblem ?? serverProblem;

  const changeFrom = (date: Date) => { setServerProblem(null); setFrom(date); };
  const changeTo = (date: Date) => { setServerProblem(null); setTo(date); };

  const makePack = useCallback(async () => {
    if (makingRef.current || oneYearProblem) return;
    makingRef.current = true;
    setMaking(true);
    setServerProblem(null);
    try {
      const made = await makeAccountantPack(fromDay, toDay);
      if (!made.success) {
        switch (made.code) {
          case PACK_CODE.NOTHING_IN_PERIOD:
          case PACK_CODE.PERIOD_ACROSS_YEARS:
            setServerProblem(made.message);
            break;
          case PACK_CODE.PACK_TOO_LONG:
            showAlert(tr('reports.titles.accountantPack'), tr('reports.accountantPack.packTooLarge'));
            break;
          default:
            showAlert(tr('reports.export.failedTitle'), made.message);
        }
        return;
      }
      const shared = await shareFileBytes(made.bytes, made.fileName, ZIP_TYPE);
      if (!shared.success) {
        // The 25 MB cap is worded as the pack being too large; any other failure is the share's own.
        if (shared.error === tr('reports.accountantPack.packTooLarge')) {
          showAlert(tr('reports.titles.accountantPack'), shared.error);
        } else {
          log.warn('Accountant pack could not be shared');
          showAlert(tr('reports.export.shareFailedTitle'), tr('errors.pdf.shareFailed'));
        }
      }
    } finally {
      makingRef.current = false;
      setMaking(false);
    }
  }, [fromDay, toDay, oneYearProblem]);

  return (
    <View style={styles.container}>
      <ReportHeader title={tr('reports.titles.accountantPack')} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <DatePickerInput
          testID="accountant-pack-from"
          label={tr('filters.date.from')}
          value={from}
          onChange={changeFrom}
          maximumDate={to}
          disabled={making}
        />
        <DatePickerInput
          testID="accountant-pack-to"
          label={tr('filters.date.to')}
          value={to}
          onChange={changeTo}
          minimumDate={from}
          maximumDate={today}
          disabled={making}
        />
        {problem ? (
          <Text style={styles.problem} testID="accountant-pack-problem" accessibilityLiveRegion="polite" accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
        <Button
          testID="accountant-pack-make"
          type="primary"
          size="fullWidth"
          loading={making}
          disabled={making || oneYearProblem !== null}
          onPress={() => { void makePack(); }}
        >
          {tr('reports.accountantPack.makePack')}
        </Button>
        <Text style={styles.note} testID="accountant-pack-note">{tr('reports.accountantPack.packNote')}</Text>
      </ScrollView>
    </View>
  );
}
