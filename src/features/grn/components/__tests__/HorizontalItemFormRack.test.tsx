/**
 * The rack field of the GRN item form. A rack is free text (owner decision of
 * 2026-10-11); the floor and chamber chips are an optional way to add
 * "/Floor" and "/Chamber" to it. The text is kept exactly as it is typed: the
 * chips only add or take off their own part at the end and never take
 * characters out of the text field. What the value next to the label shows
 * is what is saved.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { normalizeDigits } from '@/i18n';
import { HorizontalItemForm, type ItemFormData } from '../HorizontalItemForm';

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
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

function render(initial: ItemFormData) {
  const onRack = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Harness initial={initial} onRack={onRack} />);
  });
  const show = (next: ItemFormData) => act(() => tree.update(<Harness initial={next} onRack={onRack} />));
  return { tree, onRack, show };
}

const rackInput = (tree: ReactTestRenderer) =>
  tree.root.find((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === 'Rack');
const chips = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
const chip = (tree: ReactTestRenderer, label: string) =>
  chips(tree).find((node) => node.props.accessibilityLabel === label)!;
const selectedChips = (tree: ReactTestRenderer) =>
  chips(tree).filter((node) => node.props.accessibilityState.selected).map((node) => node.props.accessibilityLabel);
/** The value shown next to the "Rack" label: the rack as it will be saved. */
const preview = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((node) => (node.type as unknown) === 'Text' && node.props.numberOfLines === 1)
    .map((node) => [].concat(node.props.children).join(''));
const tap = (tree: ReactTestRenderer, label: string) => act(() => chip(tree, label).props.onPress());
const type = (tree: ReactTestRenderer, text: string) => act(() => rackInput(tree).props.onChangeText(text));
/** Types `text` one key at a time, each key added to what the field shows, as a keyboard does. */
const typeKeys = (tree: ReactTestRenderer, text: string) => {
  for (const key of Array.from(text)) type(tree, `${rackInput(tree).props.value}${key}`);
};

describe('GRN item form rack', () => {
  it.each(['C3', '20B', '20B-20C', 'A/1/2', '20B/F1', 'X/C4', 'ચેમ્બર ૩'])(
    'shows the stored rack %p whole, with no chip chosen, and changes nothing',
    (rack) => {
      const { tree, onRack } = render(item(rack));

      expect(rackInput(tree).props.value).toBe(rack);
      expect(selectedChips(tree)).toEqual([]);
      expect(preview(tree)).toContain(rack);
      expect(onRack).not.toHaveBeenCalled();
    }
  );

  it('shows a rack that ends in a known floor and chamber as text plus chips', () => {
    const { tree, onRack } = render(item('20B-20C/F1/C4'));

    expect(rackInput(tree).props.value).toBe('20B-20C');
    expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);
    expect(preview(tree)).toContain('20B-20C/F1/C4');
    expect(onRack).not.toHaveBeenCalled();
  });

  it('shows an empty rack with nothing chosen and no value', () => {
    const { tree, onRack } = render(item(''));

    expect(rackInput(tree).props.value).toBe('');
    expect(selectedChips(tree)).toEqual([]);
    expect(preview(tree)).toEqual([]);
    expect(onRack).not.toHaveBeenCalled();
  });

  it('takes any typed text, spaces included, without asking for a floor or chamber', () => {
    const { tree, onRack } = render(item(''));

    type(tree, 'ROW');
    type(tree, 'ROW ');
    expect(onRack).toHaveBeenLastCalledWith('ROW ');
    expect(rackInput(tree).props.value).toBe('ROW ');
    type(tree, 'ROW 3');

    expect(onRack).toHaveBeenLastCalledWith('ROW 3');
    expect(rackInput(tree).props.value).toBe('ROW 3');
    expect(selectedChips(tree)).toEqual([]);
  });

  it('gives an empty rack when the text is cleared or only spaces', () => {
    const { tree, onRack } = render(item('C3'));

    type(tree, '');
    expect(onRack).toHaveBeenLastCalledWith('');
    type(tree, '  ');
    expect(onRack).toHaveBeenLastCalledWith('');
  });

  // A chip that is shown as chosen is part of the rack. (A floor chosen alone
  // used to be highlighted without being saved.)
  it('adds a floor chosen alone to the rack, and a chamber chosen alone', () => {
    const { tree, onRack } = render(item('20B'));

    tap(tree, 'Floor F1');
    expect(selectedChips(tree)).toEqual(['Floor F1']);
    expect(onRack).toHaveBeenLastCalledWith('20B/F1');
    expect(preview(tree)).toContain('20B/F1');
    expect(rackInput(tree).props.value).toBe('20B');

    tap(tree, 'Floor F1');
    tap(tree, 'Chamber C4');
    expect(selectedChips(tree)).toEqual(['Chamber C4']);
    expect(onRack).toHaveBeenLastCalledWith('20B/C4');
    expect(preview(tree)).toContain('20B/C4');
  });

  it('adds floor and chamber, and takes them off again', () => {
    const { tree, onRack } = render(item('C3'));

    tap(tree, 'Floor F1');
    tap(tree, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3/F1/C4');
    expect(rackInput(tree).props.value).toBe('C3');
    expect(preview(tree)).toContain('C3/F1/C4');

    // Tapping a chosen chip takes it off: the chips are optional.
    tap(tree, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3/F1');
    expect(selectedChips(tree)).toEqual(['Floor F1']);
    tap(tree, 'Floor F1');
    expect(selectedChips(tree)).toEqual([]);
    expect(onRack).toHaveBeenLastCalledWith('C3');
  });

  it('changes one chip for another of the same kind', () => {
    const { tree, onRack } = render(item('C3'));

    tap(tree, 'Floor F1');
    tap(tree, 'Chamber C4');
    tap(tree, 'Floor F3');
    tap(tree, 'Chamber Anti-Ch');

    expect(selectedChips(tree)).toEqual(['Floor F3', 'Chamber Anti-Ch']);
    expect(onRack).toHaveBeenLastCalledWith('C3/F3/Anti-Ch');
  });

  it('with no text the chips alone are the rack', () => {
    const { tree, onRack } = render(item(''));

    tap(tree, 'Chamber C7');
    expect(onRack).toHaveBeenLastCalledWith('C7');
    tap(tree, 'Floor BASE');
    expect(onRack).toHaveBeenLastCalledWith('BASE/C7');
    tap(tree, 'Chamber C7');
    tap(tree, 'Floor BASE');
    expect(onRack).toHaveBeenLastCalledWith('');
  });

  it('keeps the chosen floor and chamber while the text is typed', () => {
    const { tree, onRack } = render(item('F1/C4'));

    expect(rackInput(tree).props.value).toBe('');
    type(tree, '20B');

    expect(onRack).toHaveBeenLastCalledWith('20B/F1/C4');
    expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);
  });

  it('drops the chips of the line edited before when a line with a plain rack is opened', () => {
    const { tree, onRack, show } = render(item('20B/F1/C4', 'line-1'));
    expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);

    show(item('C3', 'line-2'));

    expect(selectedChips(tree)).toEqual([]);
    expect(rackInput(tree).props.value).toBe('C3');
    expect(preview(tree)).toContain('C3');
    expect(preview(tree)).not.toContain('C3/F1/C4');
    expect(onRack).not.toHaveBeenCalled();
  });

  it('drops a half-made choice when another line is opened', () => {
    const { tree, show } = render(item('C3', 'line-1'));
    tap(tree, 'Floor F2');
    expect(selectedChips(tree)).toEqual(['Floor F2']);

    show(item('C3', 'line-2'));

    expect(selectedChips(tree)).toEqual([]);
  });

  // "R5/F2/C2" ends in a floor and a chamber from the chip lists. While it was
  // typed, the form took "/F2/C2" out of the field and into the chips, so the
  // next key landed after "R5": "R5/F2/C21" was saved as "R51/F2/C2".
  describe('typed key by key', () => {
    const TYPED = ['R5/F2/C21', 'R5/F2/C2', 'A/1/2', 'C3', '20B/F1', 'X/C4', 'F1/C4', 'BASE/C7/9', 'ચેમ્બર ૩', 'રેક ૫/F2/C2૧'];

    // A digit typed as ૦-૯ is stored as 0-9 (owner decision D15): "ચેમ્બર ૩" is stored as "ચેમ્બર 3". Every other
    // character is kept exactly as typed.
    it.each(TYPED)('%p is kept as typed (digits as 0-9), at every key, and chooses no chip', (text) => {
      const { tree, onRack } = render(item(''));
      const keys = Array.from(text);

      keys.forEach((key, index) => {
        type(tree, `${rackInput(tree).props.value}${key}`);
        const soFar = normalizeDigits(keys.slice(0, index + 1).join(''));
        expect(rackInput(tree).props.value).toBe(soFar);
        expect(onRack).toHaveBeenLastCalledWith(soFar.trim() === '' ? '' : soFar);
        expect(selectedChips(tree)).toEqual([]);
      });
      expect(preview(tree)).toContain(normalizeDigits(text));
    });

    it.each(TYPED)('%p: the chips add their part after it and take it off again, and the text stays', (typed) => {
      const text = normalizeDigits(typed);
      const { tree, onRack } = render(item(''));
      typeKeys(tree, typed);

      tap(tree, 'Floor F1');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/F1`);
      tap(tree, 'Chamber C4');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/F1/C4`);
      expect(preview(tree)).toContain(`${text}/F1/C4`);
      expect(rackInput(tree).props.value).toBe(text);
      expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);

      tap(tree, 'Floor F1');
      expect(onRack).toHaveBeenLastCalledWith(`${text}/C4`);
      tap(tree, 'Chamber C4');
      expect(onRack).toHaveBeenLastCalledWith(text);
      expect(rackInput(tree).props.value).toBe(text);
      expect(selectedChips(tree)).toEqual([]);
    });

    it('goes on after the chips were chosen: more keys go to the end of the text, the chips stay at the end of the rack', () => {
      const { tree, onRack } = render(item(''));
      typeKeys(tree, 'R5/F2/C2');
      tap(tree, 'Floor F1');
      tap(tree, 'Chamber C4');

      typeKeys(tree, '1');

      expect(rackInput(tree).props.value).toBe('R5/F2/C21');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C21/F1/C4');
      expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);
    });

    it('a key deleted from the end takes that key only', () => {
      const { tree, onRack } = render(item(''));
      typeKeys(tree, 'R5/F2/C21');

      type(tree, 'R5/F2/C2');
      expect(rackInput(tree).props.value).toBe('R5/F2/C2');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C2');
      expect(selectedChips(tree)).toEqual([]);
      type(tree, 'R5/F2/C');
      expect(rackInput(tree).props.value).toBe('R5/F2/C');
      expect(onRack).toHaveBeenLastCalledWith('R5/F2/C');
    });
  });

  it('drops the spaces at the ends of the text before a chip, and leaves them in the field', () => {
    const { tree, onRack } = render(item(''));
    typeKeys(tree, ' ROW 3 ');
    expect(onRack).toHaveBeenLastCalledWith(' ROW 3 ');

    tap(tree, 'Floor F1');

    expect(onRack).toHaveBeenLastCalledWith('ROW 3/F1');
    expect(rackInput(tree).props.value).toBe(' ROW 3 ');
    typeKeys(tree, 'B');
    expect(onRack).toHaveBeenLastCalledWith('ROW 3 B/F1');
    expect(rackInput(tree).props.value).toBe(' ROW 3 B');
  });

  it('shows the stored rack again when the same line is opened again without saving', () => {
    const { tree, onRack, show } = render(item('20B/F1/C4', 'line-1'));
    typeKeys(tree, 'X');
    tap(tree, 'Floor F1');
    expect(onRack).toHaveBeenLastCalledWith('20BX/C4');

    // The items step puts the saved line back into the form.
    show(item('20B/F1/C4', 'line-1'));

    expect(rackInput(tree).props.value).toBe('20B');
    expect(selectedChips(tree)).toEqual(['Floor F1', 'Chamber C4']);
    expect(preview(tree)).toContain('20B/F1/C4');
  });
});
