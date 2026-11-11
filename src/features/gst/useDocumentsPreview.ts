/**
 * The review step's question to the server: which document(s) do these lines make (WH-151, `preview_invoice_documents`).
 * Asked once for each set of lines; the answer is shown as it came. Nothing is worked out here.
 */
import { useEffect, useState } from 'react';
import { backendHasFeature } from '@/config/backendFeatures';
import { previewInvoiceDocuments, type DocumentsPreview } from '@/services/gstService';

export type PreviewState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; preview: DocumentsPreview }
  | { status: 'failed'; message: string };

export function useDocumentsPreview(grId: string, dispTrlIds: string[], invoiceId: string | null): PreviewState {
  const enabled = backendHasFeature('gstDocuments') && !!grId && dispTrlIds.length > 0;
  const key = `${grId}|${invoiceId ?? ''}|${[...dispTrlIds].sort().join(',')}`;
  const [state, setState] = useState<PreviewState>({ status: enabled ? 'loading' : 'off' });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'off' });
      return undefined;
    }
    let current = true;
    setState({ status: 'loading' });
    previewInvoiceDocuments(grId, dispTrlIds, invoiceId)
      .then((answer) => {
        if (!current) return;
        setState(answer.ok ? { status: 'ready', preview: answer.preview } : { status: 'failed', message: answer.message });
      })
      .catch(() => {
        if (current) setState({ status: 'failed', message: '' });
      });
    return () => {
      current = false;
    };
    // The lines are read through `key`: a new array with the same ids asks nothing again.
  }, [enabled, key]);

  return state;
}
