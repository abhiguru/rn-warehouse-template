/**
 * The rack field of the GRN item form. A rack is free text (owner decision of
 * 2026-10-11); the floor and chamber chips are an optional way to add
 * "/Floor/Chamber" to it. What the field shows is what is saved.
 */
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
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

  it('leaves the rack as it is while only one of floor and chamber is chosen', () => {
    const { tree, onRack } = render(item('C3'));

    tap(tree, 'Floor F1');

    expect(selectedChips(tree)).toEqual(['Floor F1']);
    expect(onRack).toHaveBeenLastCalledWith('C3');
    expect(preview(tree)).toContain('C3');
    expect(preview(tree)).not.toContain('C3/F1');
  });

  it('adds floor and chamber once both are chosen, and takes them off again', () => {
    const { tree, onRack } = render(item('C3'));

    tap(tree, 'Floor F1');
    tap(tree, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3/F1/C4');
    expect(rackInput(tree).props.value).toBe('C3');
    expect(preview(tree)).toContain('C3/F1/C4');

    // Tapping a chosen chip takes it off: the chips are optional.
    tap(tree, 'Chamber C4');
    expect(onRack).toHaveBeenLastCalledWith('C3');
    expect(selectedChips(tree)).toEqual(['Floor F1']);
    tap(tree, 'Floor F1');
    expect(selectedChips(tree)).toEqual([]);
    expect(onRack).toHaveBeenLastCalledWith('C3');
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
});
