/**
 * Every executeRPC call for a write RPC says `write: true` (or `delete: true`): without it an empty answer to the change
 * would be worded as "no data" and the caller would not know the change may have been applied.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const WRITE_RPCS = [
  'add_item_to_order', 'update_order_item_quantity', 'remove_item_from_order', 'create_customer', 'update_customer',
  'set_customer_active', 'create_item', 'update_item', 'delete_item_safe', 'delete_dispatch_with_order_cleanup',
  'cancel_invoice', 'delete_grn_safe', 'delete_user_account', 'assign_customer_to_user', 'remove_customer_assignment',
];

const ROOT = join(__dirname, '..', '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The text of the call that opens at `open` (the "(" of `executeRPC(`), up to its closing ")". */
function callText(text: string, open: number): string {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === '(') depth++;
    if (text[at] === ')' && --depth === 0) return text.slice(open, at + 1);
  }
  return text.slice(open);
}

/** [file, rpc, the call's text] for each executeRPC call that names one of the write RPCs. */
function calls() {
  const found: { file: string; rpc: string; text: string }[] = [];
  for (const file of sources(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/executeRPC\s*(<[^(]*>)?\s*\(/g)) {
      const open = match.index! + match[0].length - 1;
      const body = callText(text, open);
      const rpc = WRITE_RPCS.find((name) => body.includes(`'${name}'`));
      if (rpc) found.push({ file, rpc, text: body });
    }
  }
  return found;
}

describe('executeRPC calls for write RPCs', () => {
  const all = calls();

  it('finds the writes it is meant to watch', () => {
    const names = new Set(all.map((call) => call.rpc));
    for (const rpc of ['add_item_to_order', 'update_order_item_quantity', 'remove_item_from_order', 'create_customer', 'update_customer', 'create_item', 'update_item', 'delete_item_safe', 'delete_dispatch_with_order_cleanup', 'cancel_invoice']) {
      expect(names).toContain(rpc);
    }
  });

  it.each(all.map((call) => [`${call.rpc} in ${call.file.slice(ROOT.length + 1)}`, call] as const))('%s says write: true or delete: true', (_name, call) => {
    expect(call.text).toMatch(/\b(write|delete): true/);
  });
});
