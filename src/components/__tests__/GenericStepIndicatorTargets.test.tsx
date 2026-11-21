/**
 * The step circles of GenericStepIndicatorHeader (style guide §13.8): each is 28 dp drawn, and its touch target is
 * at least touchTarget wide and tall, the circle plus the hit slop, with the connector still drawn between them.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { touchTarget } from '@/theme/tokens';
import { GenericStepIndicatorHeader } from '../GenericStepIndicatorHeader';

/** An element of the rendered tree, as the queries return it. */
type HostElement = ReturnType<typeof screen.getByRole>;

jest.mock('@/store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ theme: { preference: 'light', brand: 'orange' } }),
}));
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/EdgeToEdgeStatusBar', () => ({ EdgeToEdgeStatusBar: () => null }));

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([] as unknown[]).concat(style as never).flat(Infinity as 1).filter(Boolean));

/** The step circles are the buttons named "Step n of 3 ..."; the close button is not one of them. */
const stepButtons = () => screen.getAllByRole('button', { name: /^Step \d of 3/ });
/** Every drawn element of a rendered tree (the connectors have no role or text to query by). */
function elementsIn(root: HostElement): HostElement[] {
  return [root, ...root.children.flatMap(child => (typeof child === 'string' ? [] : elementsIn(child)))];
}

describe('GenericStepIndicatorHeader step circles', () => {
  it('gives each circle a target of at least touchTarget in both directions', async () => {
    await render(
      <GenericStepIndicatorHeader
        steps={[{ label: 'Details' }, { label: 'Items' }, { label: 'Review' }] as never}
        currentStep={2}
        completedSteps={[1]}
        onCancel={jest.fn()}
        onStepPress={jest.fn()}
        entity="dispatch"
      />,
    );
    const steps = stepButtons();
    expect(steps).toHaveLength(3);
    for (const step of steps) {
      const circle = elementsIn(step).find((n) => flat(n.props.style).borderRadius !== undefined && flat(n.props.style).width !== undefined)!;
      const { width, height } = flat(circle.props.style) as { width: number; height: number };
      const slop = step.props.hitSlop as { top: number; bottom: number; left: number; right: number };
      expect(width).toBe(28);
      expect(height).toBe(28);
      expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(touchTarget);
      expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(touchTarget);
    }
    // The connectors between the circles are still drawn (2 dp high), and no wider than the slop they leave.
    const connectors = elementsIn(screen.root!).filter((n) => flat(n.props.style).height === 2);
    expect(connectors).toHaveLength(2);
    for (const c of connectors) expect(flat(c.props.style).width).toBe(touchTarget - 28);
  });

  // The steps row is 24 dp wider than it was (wider targets), so the title has less room: at 320 dp and font scale 1.3
  // "Edit invoice" or a Gujarati title would be cut to "Edit invo…". The title wraps to two lines before it is cut.
  it.each([['Edit invoice'], ['ઇન્વૉઇસમાં ફેરફાર']])('lets the title "%s" wrap to two lines at 320 dp, font scale 1.3, and keeps every target', async (title) => {
    Dimensions.set({ window: { width: 320, height: 640, scale: 2, fontScale: 1.3 } });
    try {
      await render(
        <GenericStepIndicatorHeader
          steps={[{ label: 'Details' }, { label: 'Items' }, { label: 'Review' }] as never}
          currentStep={2}
          completedSteps={[1]}
          onCancel={jest.fn()}
          onStepPress={jest.fn()}
          entityName={title}
        />,
      );
      expect(screen.getByRole('header', { name: title })).toHaveProp('numberOfLines', 2);
      // The circles keep their full targets.
      const steps = stepButtons();
      expect(steps).toHaveLength(3);
      for (const step of steps) {
        const slop = step.props.hitSlop as { left: number; right: number };
        expect(28 + slop.left + slop.right).toBeGreaterThanOrEqual(touchTarget);
      }
    } finally {
      Dimensions.set({ window: { width: 392, height: 850, scale: 2.75, fontScale: 1 } });
    }
  });
});
