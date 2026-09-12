import { getCurrentConfig } from '../config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';

/**
 * Fix internal Docker URLs returned by backend Edge Functions
 * The backend may return URLs with internal Docker service names (e.g., http://kong:8000)
 * which are not accessible from mobile devices. This function rewrites them to the public URL.
 */
function fixInternalUrl(url: string): string {
  if (!url) return url;

  // Replace internal Docker URLs with public URL
  const internalPatterns = [
    'http://kong:8000',
    'http://kong:8443',
    'http://localhost:54321',
    'http://127.0.0.1:54321',
  ];

  const config = getCurrentConfig();
  const publicUrl = config.url; // e.g., http://localhost:8000

  for (const pattern of internalPatterns) {
    if (url.startsWith(pattern)) {
      const fixedUrl = url.replace(pattern, publicUrl);
      console.log('[PDF Service] Fixed internal URL:', {
        original: pattern,
        fixed: publicUrl,
      });
      return fixedUrl;
    }
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
    console.log('[PDF Service] generateGRNPDF called:', { grNo });

    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-grn-pdf`;
    console.log('[PDF Service] Request URL:', url);

    const response = await fetch(url, {
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
      const textResponse = await response.text();
      console.error('[PDF Service] ✗ Non-JSON response:', {
        status: response.status,
        preview: textResponse.substring(0, 200),
      });
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();
    console.log('[PDF Service] Response:', data);

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
    console.error('[PDF Service] Exception in generateGRNPDF:', error);
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
    console.log('[PDF Service] generateDispatchPDF called:', { dispNo });

    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-dispatch-pdf`;
    console.log('[PDF Service] Request URL:', url);

    const response = await fetch(url, {
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
      const textResponse = await response.text();
      console.error('[PDF Service] ✗ Non-JSON response:', {
        status: response.status,
        preview: textResponse.substring(0, 200),
      });
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();
    console.log('[PDF Service] Response:', data);

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
    console.error('[PDF Service] Exception in generateDispatchPDF:', error);
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
    console.log('[PDF Service] generateInvoicePDF called:', { invNo, finYear });

    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-invoice-pdf`;
    console.log('[PDF Service] Request URL:', url);

    const response = await fetch(url, {
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
      const textResponse = await response.text();
      console.error('[PDF Service] ✗ Non-JSON response:', {
        status: response.status,
        preview: textResponse.substring(0, 200),
      });
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();
    console.log('[PDF Service] Response:', data);

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
    console.error('[PDF Service] Exception in generateInvoicePDF:', error);
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
    console.log('[PDF Service] generateCustomerStockPDF called:', {
      customerId,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/generate-customer-stock-pdf`;
    console.log('[PDF Service] Request URL:', url);

    const response = await fetch(url, {
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
      const textResponse = await response.text();
      console.error('[PDF Service] ✗ Non-JSON response:', {
        status: response.status,
        preview: textResponse.substring(0, 200),
      });
      return {
        success: false,
        error: `Server error (${response.status}): PDF generation service unavailable.`,
      };
    }

    const data = await response.json();
    console.log('[PDF Service] Response:', data);

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
    console.error(
      '[PDF Service] Exception in generateCustomerStockPDF:',
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PDF',
    };
  }
}
