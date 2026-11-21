/**
 * The rack field of the GRN item form. A rack is free text (owner decision of
 * 2026-10-11); the floor and chamber chips are an optional way to add
 * "/Floor" and "/Chamber" to it. The text is kept exactly as it is typed: the
 * chips only add or take off their own part at the end and never take
 * characters out of the text field. What the value next to the label shows
 * is what is saved.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { normalizeDigits } from '@/i18n';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

// The add-item sheet in the entry form (WH-56) needs the safe area and the network state.
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isStaffRole: false }) })); // WH-79: staff may add an item
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/hooks/useNetworkStatus', () => ({ useIsOffline: () => false }));
jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@/components/RemoteAutocompleteInput', () => ({ RemoteAutocompleteInput: () => null }));
jest.mock('@/services/item-search-service', () => ({ searchItems: jest.fn() }));

const item = (rack: string, id = 'line-1'): ItemFormData => ({
  grn_trl_id: id,
  item_table_id: 'item-1',
  item_name: 'Example Potatoes',
  packaging: 'Bag',
  qty: '10',
  weight: '50',
  rack,
  package_mark: '',
  trl_images: [],
  errors: {},
});

/** The form with a parent that keeps the rack, as the items step does. */
function Harness({ initial, onRack }: { initial: ItemFormData; onRack: (rack: string) => void }) {
  const [current, setCurrent] = React.useState(initial);
  React.useEffect(() => setCurrent(initial), [initial]);
  return (
    <HorizontalItemForm
      currentItem={current}
      onFieldChange={(field, value) => {
        if (field === 'rack') onRack(value);
        setCurrent((prev) => ({ ...prev, [field]: value }));
      }}
      onImagePick={jest.fn()}
      onImageRemove={jest.fn()}
      onSaveItem={jest.fn()}
      isValid
      isEditing
      editingItemNumber={1}
      savedItemsCount={1}
    />
  );
}

async function renderForm(initial: ItemFormData) {
  const onRack = jest.fn();
  const user = userEvent.setup({ delay: 0 });
  await render(<Harness initial={initial} onRack={onRack} />);
  const show = (next: ItemFormData) => screen.rerender(<Harness initial={next} onRack={onRack} />);
  return { user, onRack, show };
}

const rackInput = () => screen.getByLabelText('Rack');
const chip = (label: string) => screen.getByRole('radio', { name: label });
const selectedChips = () => screen.queryAllByRole('radio', { selected: true }).map((node) => node.props.accessibilityLabel as string);
/** The value shown next to the "Rack" label: the rack as it will be saved. */
const preview = () =>
  screen
    .queryAllByText(/[\s\S]*/)
    .filter((node) => node.props.numberOfLines === 1)
    .map((node) => ([] as unknown[]).concat(node.props.children).join(''));
const tap = (user: ReturnType<typeof userEvent.setup>, label: string) => user.press(chip(label));
/** Sets the whole text of the field, as a paste or autofill does. */
const type = (text: string) => fireEvent.changeText(rackInput(), text);
/** Types `text` one key at a time, each key added to what the field shows, as a keyboard does. */
const typeKeys = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  for (const key of Array.from(text)) await user.type(rackInput(), key);
};

describe('GRN item form rack', () => {
  it.each(['C3', '20B', '20B-20C', 'A/1/2', '20B/F1', 'X/C4', 'ચેમ્બર ૩'])(
    'shows the stored rack %p whole, with no chip chosen, and changes nothing',
    async (rack) => {
      const { user, onRack } = await renderForm(item(rack));

      expect(rackInput()).toHaveDisplayValue(rack);
      expect(selectedChips()).toEqual([]);
      expect(preview()).toContain(rack);
      expect(onRack).not.toHaveBeenCalled();
    }
  );

  it('shows a rack that ends in a known floor and chamber as text plus chips', async () => {
    const { user, onRack } = await renderForm(item('20B-20C/F1/C4'));

    expect(rackInput()).toHaveDisplayValue('20B-20C');
    expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);
    expect(preview()).toContain('20B-20C/F1/C4');
    expect(onRack).not.toHaveBeenCalled();
  });

  it('shows an empty rack with nothing chosen and no value', async () => {
    const { user, onRack } = await renderForm(item(''));

    expect(rackInput()).toHaveDisplayValue('');
    expect(selectedChips()).toEqual([]);
    expect(preview()).toEqual([]);
    expect(onRack).not.toHaveBeenCalled();
  });

  it('takes any typed text, spaces included, without asking for a floor or chamber', async () => {
    const { user, onRack } = await renderForm(item(''));

    await type('ROW');
    await type('ROW ');
    expect(onRack).toHaveBeenLastCalledWith('ROW ');
    expect(rackInput()).toHaveDisplayValue('ROW ');
    await type('ROW 3');

    expect(onRack).toHaveBeenLastCalledWith('ROW 3');
    expect(rackInput()).toHaveDisplayValue('ROW 3');
    expect(selectedChips()).toEqual([]);
  });

  it('gives an empty rack when the text is cleared or only spaces', async () => {
    const { user, onRack } = await renderForm(item('C3'));

    await type('');
    expect(onRack).toHaveBeenLastCalledWith('');
    await type('  ');
    expect(onRack).toHaveBeenLastCalledWith('');
  });

  // A chip that is shown as chosen is part of the rack. (A floor chosen alone
  // used to be highlighted without being saved.)
  it('adds a floor chosen alone to the rack, and a chamber chosen alone', async () => {
    const { user, onRack } = await renderForm(item('20B'));

    await tap(user, 'Floor F1');
    expect(selectedChips()).toEqual(['Floor F1']);
    expect(onRack).toHaveBeenLastCalledWith('20B/F1');
    expect(preview()).toContain('20B/F1');
    expect(rackInput()).toHaveDisplayValue('20B');

    await tap(user, 'Floor F1');
    await tap(user, 'Chamber C4');
    expect(selectedChips()).toEqual(['Chamber C4']);
    expect(onRack).toHaveBeenLastCalledWith('20B/C4');
    expect(preview()).toContain('20B/C4');
  });

  it('adds floor and chamber, and takes them off again', async () => {
    const { user, onRack } = await renderForm(item('C3'));

    await tap(user, 'Floor F1');
    await tap(user, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3/F1/C4');
    expect(rackInput()).toHaveDisplayValue('C3');
    expect(preview()).toContain('C3/F1/C4');

    // Tapping a chosen chip takes it off: the chips are optional.
    await tap(user, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3/F1');
    expect(selectedChips()).toEqual(['Floor F1']);
    await tap(user, 'Floor F1');
    expect(selectedChips()).toEqual([]);
    expect(onRack).toHaveBeenLastCalledWith('C3');
  });

  it('changes one chip for another of the same kind', async () => {
    const { user, onRack } = await renderForm(item('C3'));

    await tap(user, 'Floor F1');
    await tap(user, 'Chamber C4');
    await tap(user, 'Floor F3');
    await tap(user, 'Chamber Anti-Ch');

    expect(selectedChips()).toEqual(['Floor F3', 'Chamber Anti-Ch']);
    expect(onRack).toHaveBeenLastCalledWith('C3/F3/Anti-Ch');
  });

  it('with no text the chips alone are the rack', async () => {
    const { user, onRack } = await renderForm(item(''));

    await tap(user, 'Chamber C7');
    expect(onRack).toHaveBeenLastCalledWith('C7');
    await tap(user, 'Floor BASE');
    expect(onRack).toHaveBeenLastCalledWith('BASE/C7');
    await tap(user, 'Chamber C7');
    await tap(user, 'Floor BASE');
    expect(onRack).toHaveBeenLastCalledWith('');
  });

  it('keeps the chosen floor and chamber while the text is typed', async () => {
    const { user, onRack } = await renderForm(item('F1/C4'));

    expect(rackInput()).toHaveDisplayValue('');
    await type('20B');

    expect(onRack).toHaveBeenLastCalledWith('20B/F1/C4');
    expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);
  });

  it('drops the chips of the line edited before when a line with a plain rack is opened', async () => {
    const { user, onRack, show } = await renderForm(item('20B/F1/C4', 'line-1'));
    expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);

    await show(item('C3', 'line-2'));

    expect(selectedChips()).toEqual([]);
    expect(rackInput()).toHaveDisplayValue('C3');
    expect(preview()).toContain('C3');
    expect(preview()).not.toContain('C3/F1/C4');
    expect(onRack).not.toHaveBeenCalled();
  });

  it('drops a half-made choice when another line is opened', async () => {
    const { user, show } = await renderForm(item('C3', 'line-1'));
    await tap(user, 'Floor F2');
    expect(selectedChips()).toEqual(['Floor F2']);

    await show(item('C3', 'line-2'));

    expect(selectedChips()).toEqual([]);
  });

  // "R5/F2/C2" ends in a floor and a chamber from the chip lists. While it was
  // typed, the form took "/F2/C2" out of the field and into the chips, so the
  // next key landed after "R5": "R5/F2/C21" was saved as "R51/F2/C2".
  describe('typed key by key', () => {
    const TYPED = ['R5/F2/C21', 'R5/F2/C2', 'A/1/2', 'C3', '20B/F1', 'X/C4', 'F1/C4', 'BASE/C7/9', 'ચેમ્બર ૩', 'રેક ૫/F2/C2૧'];

    // A digit typed as ૦-૯ is stored as 0-9 (owner decision D15): "ચેમ્બર ૩" is stored as "ચેમ્બર 3". Every other
    // character is kept exactly as typed.
    it.each(TYPED)('%p is kept as typed (digits as 0-9), at every key, and chooses no chip', async (text) => {
      const { user, onRack } = await renderForm(item(''));
      const keys = Array.from(text);

      for (const [index, key] of keys.entries()) {
        await user.type(rackInput(), key);
        const soFar = normalizeDigits(keys.slice(0, index + 1).join(''));
        expect(rackInput()).toHaveDisplayValue(soFar);
        expect(onRack).toHaveBeenLastCalledWith(soFar.trim() === '' ? '' : soFar);
        expect(selectedChips()).toEqual([]);
      }
      expect(preview()).toContain(normalizeDigits(text));
    });

    it.each(TYPED)('%p: the chips add their part after it and take it off again, and the text stays', async (typed) => {
      const text = normalizeDigits(typed);
      const { user, onRack } = await renderForm(item(''));
      await typeKeys(user, typed);

      await tap(user, 'Floor F1');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/F1`);
      await tap(user, 'Chamber C4');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/F1/C4`);
      expect(preview()).toContain(`${text}/F1/C4`);
      expect(rackInput()).toHaveDisplayValue(text);
      expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);

      await tap(user, 'Floor F1');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/C4`);
      await tap(user, 'Chamber C4');
      expect(onRack).toHaveBeenLastCalledWith(text);
      expect(rackInput()).toHaveDisplayValue(text);
      expect(selectedChips()).toEqual([]);
    });

    it('goes on after the chips were chosen: more keys go to the end of the text, the chips stay at the end of the rack', async () => {
      const { user, onRack } = await renderForm(item(''));
      await typeKeys(user, 'R5/F2/C2');
      await tap(user, 'Floor F1');
      await tap(user, 'Chamber C4');

      await typeKeys(user, '1');

      expect(rackInput()).toHaveDisplayValue('R5/F2/C21');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C21/F1/C4');
      expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);
    });

    it('a key deleted from the end takes that key only', async () => {
      const { user, onRack } = await renderForm(item(''));
      await typeKeys(user, 'R5/F2/C21');

      await type('R5/F2/C2');
      expect(rackInput()).toHaveDisplayValue('R5/F2/C2');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C2');
      expect(selectedChips()).toEqual([]);
      await type('R5/F2/C');
      expect(rackInput()).toHaveDisplayValue('R5/F2/C');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C');
    });
  });

  it('drops the spaces at the ends of the text before a chip, and leaves them in the field', async () => {
    const { user, onRack } = await renderForm(item(''));
    await typeKeys(user, ' ROW 3 ');
    expect(onRack).toHaveBeenLastCalledWith(' ROW 3 ');

    await tap(user, 'Floor F1');

    expect(onRack).toHaveBeenLastCalledWith('ROW 3/F1');
    expect(rackInput()).toHaveDisplayValue(' ROW 3 ');
    await typeKeys(user, 'B');
    expect(onRack).toHaveBeenLastCalledWith('ROW 3 B/F1');
    expect(rackInput()).toHaveDisplayValue(' ROW 3 B');
  });

  it('shows the stored rack again when the same line is opened again without saving', async () => {
    const { user, onRack, show } = await renderForm(item('20B/F1/C4', 'line-1'));
    await typeKeys(user, 'X');
    await tap(user, 'Floor F1');
    expect(onRack).toHaveBeenLastCalledWith('20BX/C4');

    // The items step puts the saved line back into the form.
    await show(item('20B/F1/C4', 'line-1'));

    expect(rackInput()).toHaveDisplayValue('20B');
    expect(selectedChips()).toEqual(['Floor F1', 'Chamber C4']);
    expect(preview()).toContain('20B/F1/C4');
  });
});
