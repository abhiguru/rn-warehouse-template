import { createAuthenticatedFetch, getCurrentConfig } from '../config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';

/**
 * Fix private development origins returned by backend Edge Functions. Docker
 * service names and loopback hosts are not reachable from a physical device,
 * so retain the signed path/query while using the app's configured API origin.
 */
function fixInternalUrl(url: string): string {
  if (!url) return url;

  try {
    const signedUrl = new URL(url);
    const internalHosts = new Set(['kong', 'localhost', '127.0.0.1']);

    if (!internalHosts.has(signedUrl.hostname)) {
      return url;
    }

    const publicOrigin = new URL(getCurrentConfig().url).origin;
    if (signedUrl.origin !== publicOrigin) {
      return url.replace(signedUrl.origin, publicOrigin);
    }
  } catch {
    // Preserve malformed server values so the caller reports the download error.
  }

  return url;
}

export interface PDFResponse {
  success: boolean;
  pdfUrl?: string;
  expiresIn?: number;
  document?: {
    type: string;
    number: string;
    date: string;
    customer: string;
    items_count: number;
  };
  error?: string;
}

/**
 * Get authentication token for PDF API calls
 * First tries to get from Supabase session, falls back to stored JWT tokens
 */
const getAuthToken = getAuthTokenString;

/**
 * Generate GRN PDF using Supabase Edge Function
 * @param grNo - GRN number (e.g., "Z0797")
 * @returns PDF response with signed URL for download
 */
export async function generateGRNPDF(grNo: string): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-grn-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ gr_no: grNo }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to generate PDF (${response.status})`,
      };
    }

    return {
      success: true,
      pdfUrl: fixInternalUrl(data.pdf_url),
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Generate Dispatch PDF using Supabase Edge Function
 * @param dispNo - Dispatch number (e.g., "I4613")
 * @returns PDF response with signed URL for download
 */
export async function generateDispatchPDF(
  dispNo: string
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-dispatch-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ disp_no: dispNo }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to generate PDF (${response.status})`,
      };
    }

    return {
      success: true,
      pdfUrl: fixInternalUrl(data.pdf_url),
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Generate Invoice PDF using Supabase Edge Function
 * @param invNo - Invoice number (numeric, e.g., 2555)
 * @param finYear - Financial year (e.g., 2025)
 * @returns PDF response with signed URL for download
 */
export async function generateInvoicePDF(
  invNo: number,
  finYear: number
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-invoice-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ inv_no: invNo, fin_year: finYear }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to generate PDF (${response.status})`,
      };
    }

    return {
      success: true,
      pdfUrl: fixInternalUrl(data.pdf_url),
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}

/**
 * Generate Customer Stock Summary PDF using Supabase Edge Function
 * @param customerId - Customer UUID (e.g., "1275b249-2831-11ed-ba24-525400024271")
 * @returns PDF response with signed URL for download
 */
export async function generateCustomerStockPDF(
  customerId: string
): Promise<PDFResponse> {
  try {
    const authenticatedFetch = createAuthenticatedFetch();
    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-customer-stock-pdf`;

    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ customer_id: customerId }),
    });

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Failed to generate PDF (${response.status})`,
      };
    }

    return {
      success: true,
      pdfUrl: fixInternalUrl(data.pdf_url),
      expiresIn: data.expires_in,
      document: data.document,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}
