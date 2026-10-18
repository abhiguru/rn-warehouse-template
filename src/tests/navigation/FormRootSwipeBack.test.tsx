/**
 * The root stack's six form routes turn the iOS edge swipe off (R2-09): the inner stacks already do, but on step 1
 * the inner stack cannot pop, so a swipe would pop the whole form route without its "Discard?" question.
 * Read from the source of the root layout, which cannot be rendered here.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, '../../../app/_layout.tsx'), 'utf8');

describe.each(['grn-form', 'grn-edit', 'dispatch-form', 'dispatch-edit', 'invoice-form', 'invoice-edit'])('the root route %s', (name) => {
  it('has gestureEnabled: false', () => {
    const screen = source.match(new RegExp(`<Stack\\.Screen\\s+name="${name}"[\\s\\S]*?/>`));
    expect(screen).not.toBeNull();
    expect(screen![0]).toMatch(/gestureEnabled:\s*false/);
  });
});
