/**
 * The Floor and Chamber buttons of the GRN item form (owner request, backend migration 131): one list per facility,
 * set by administrators and supervisors in Settings. The built-in lists below are what a facility starts with and
 * what the app uses on a backend that has no such setting.
 *
 * A rack is free text. A chosen button adds "/Floor" and "/Chamber" after the typed text; a rack is split into text and
 * buttons only when a line is put into the form, and only when it ends in a floor and a chamber from the lists.
 * Racks that were saved never change when the lists do.
 */
export interface RackPresets {
  floor: string[];
  chamber: string[];
}

export const DEFAULT_RACK_PRESETS: RackPresets = {
  floor: ['BASE', 'F1', 'F2', 'F3', 'F4'],
  chamber: ['C4', 'C7', 'C2', 'Anti-Ch'],
};

export const parseRackValue = (
  rack: string,
  presets: RackPresets = DEFAULT_RACK_PRESETS
): { userInput: string; floor: string; chamber: string } => {
  if (!rack || rack.trim() === '') {
    return { userInput: '', floor: '', chamber: '' };
  }
  const parts = rack.split('/');
  if (parts.length >= 2) {
    const chamber = parts[parts.length - 1];
    const floor = parts[parts.length - 2];
    if (presets.floor.includes(floor) && presets.chamber.includes(chamber)) {
      return { userInput: parts.slice(0, parts.length - 2).join('/'), floor, chamber };
    }
  }
  return { userInput: rack, floor: '', chamber: '' };
};

// The text exactly as typed, then "/Floor" and "/Chamber" for the buttons that are chosen. Before a button the spaces
// at the text's ends are dropped, or they would be left in the middle of the rack ("ROW 3 /F1").
export const buildRackValue = (userInput: string, floor: string, chamber: string): string => {
  const chips = [floor, chamber].filter(Boolean).join('/');
  if (userInput.trim() === '') return chips;
  return chips ? `${userInput.trim()}/${chips}` : userInput;
};
