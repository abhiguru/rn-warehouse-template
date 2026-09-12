import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentConfig } from '../config/supabaseConfig';
import { getAuthTokenString } from '@/utils/authTokenUtils';

interface PrintJobResponse {
  success: boolean;
  message?: string;
  range?: {
    start: string;
    end: string;
    count?: number;
    fin_year?: number;
  };
  print_job?: {
    cups_job_id: number;
    job_uri: string;
    printer: string;
    content_size: number;
  };
  timestamp?: string;
  error?: string;
}

export interface PrintJob {
  id: string;
  job_type: string; // Backend returns "GRN", "Dispatch", "Invoice" (capitalized)
  cups_job_id: number;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  user_id: string;
  user_name: string;
  document_range_start: string;
  document_range_end: string;
  document_count: number;
  printer_name: string;
  content_size: number;
  submitted_at: string;
  completed_at: string | null;
  updated_at: string;
  error_message: string | null;
}

export interface GetPrintJobsResponse {
  success: boolean;
  data?: PrintJob[];
  error?: string;
}

export interface CancelPrintJobResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export type PrinterStatus = 'online' | 'offline' | 'error' | 'busy';

export interface GetPrinterStatusResponse {
  success: boolean;
  status?: PrinterStatus;
  message?: string;
  printer_name?: string;
  printer_state?: number;
  printer_state_message?: string;
  printer_state_reasons?: string[];
  printer_is_accepting_jobs?: boolean;
  queued_job_count?: number;
  timestamp?: string;
  error?: string;
}

/**
 * Get authentication token for print API calls
 * First tries to get from Supabase session, falls back to stored JWT tokens (properly decoded)
 */
const getAuthToken = getAuthTokenString;

/**
 * Print GRN range using Supabase Edge Function
 * @param startGrNo - Starting GRN number (e.g., "Z0797")
 * @param endGrNo - Ending GRN number (e.g., "Z0801")
 * @returns Print job response with CUPS job details
 */
export async function printGRNRange(
  startGrNo: string,
  endGrNo: string
): Promise<PrintJobResponse> {
  try {
    console.log('[Print Service] printGRNRange called:', {
      startGrNo,
      endGrNo,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Print Service] ✗ No auth token, returning error');
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    console.log('[Print Service] ✓ Auth token obtained, making API request...');

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/print-grn-preprinted`;
    console.log('[Print Service] Request URL:', url);
    console.log('[Print Service] Request body:', {
      start_gr_no: startGrNo,
      end_gr_no: endGrNo,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        start_gr_no: startGrNo,
        end_gr_no: endGrNo,
      }),
    });

    console.log('[Print Service] Response status:', response.status);
    console.log('[Print Service] Response ok:', response.ok);

    const data = await response.json();
    console.log('[Print Service] Response data:', data);

    if (!response.ok) {
      console.log('[Print Service] ✗ Request failed:', {
        status: response.status,
        error: data.error,
      });
      return {
        success: false,
        error: data.error || `HTTP error! status: ${response.status}`,
      };
    }

    console.log('[Print Service] ✓ Print job submitted successfully');
    return data;
  } catch (error) {
    console.error('[Print Service] Exception in printGRNRange:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to submit print job',
    };
  }
}

/**
 * Print dispatch range using Supabase Edge Function
 * @param startDispNo - Starting dispatch number
 * @param endDispNo - Ending dispatch number
 * @returns Print job response with CUPS job details
 */
export async function printDispatchRange(
  startDispNo: string,
  endDispNo: string
): Promise<PrintJobResponse> {
  try {
    console.log('[Print Service] printDispatchRange called:', {
      startDispNo,
      endDispNo,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Print Service] ✗ No auth token, returning error');
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    console.log('[Print Service] ✓ Auth token obtained, making API request...');

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/print-dispatch-preprinted`;
    console.log('[Print Service] Request URL:', url);
    console.log('[Print Service] Request body:', {
      start_disp_no: startDispNo,
      end_disp_no: endDispNo,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        start_disp_no: startDispNo,
        end_disp_no: endDispNo,
      }),
    });

    console.log('[Print Service] Response status:', response.status);
    console.log('[Print Service] Response ok:', response.ok);

    const data = await response.json();
    console.log('[Print Service] Response data:', data);

    if (!response.ok) {
      console.log('[Print Service] ✗ Request failed:', {
        status: response.status,
        error: data.error,
      });
      return {
        success: false,
        error: data.error || `HTTP error! status: ${response.status}`,
      };
    }

    console.log('[Print Service] ✓ Print job submitted successfully');
    return data;
  } catch (error) {
    console.error('[Print Service] Exception in printDispatchRange:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to submit print job',
    };
  }
}

/**
 * Print invoice range using Supabase Edge Function
 * @param startInvNo - Starting invoice number (e.g., "INV001")
 * @param endInvNo - Ending invoice number (e.g., "INV005")
 * @param finYear - Financial year (optional, defaults to current year in backend)
 * @returns Print job response with CUPS job details
 */
export async function printInvoiceRange(
  startInvNo: string,
  endInvNo: string,
  finYear?: number
): Promise<PrintJobResponse> {
  try {
    console.log('[Print Service] printInvoiceRange called:', {
      startInvNo,
      endInvNo,
      finYear,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Print Service] ✗ No auth token, returning error');
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    console.log('[Print Service] ✓ Auth token obtained, making API request...');
    console.log('[Print Service] Auth token preview:', {
      length: authToken.length,
      prefix: authToken.substring(0, 20) + '...',
      isJWT: authToken.split('.').length === 3,
    });

    const requestBody: {
      start_inv_no_str: string;
      end_inv_no_str: string;
      inv_fin_year?: number;
    } = {
      start_inv_no_str: startInvNo,
      end_inv_no_str: endInvNo,
    };

    if (finYear !== undefined) {
      requestBody.inv_fin_year = finYear;
    }

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/print-invoice-preprinted`;
    console.log('[Print Service] Request URL:', url);
    console.log('[Print Service] Request body:', requestBody);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Print Service] Response status:', response.status);
    console.log('[Print Service] Response ok:', response.ok);

    // Handle non-JSON responses (like 502 HTML error pages)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const textResponse = await response.text();
      console.error('[Print Service] ✗ Non-JSON response:', {
        status: response.status,
        contentType,
        preview: textResponse.substring(0, 200),
      });
      return {
        success: false,
        error: `Server error (${response.status}): The print server is unavailable. Please try again later.`,
      };
    }

    const data = await response.json();
    console.log('[Print Service] Response data:', data);

    if (!response.ok) {
      console.log('[Print Service] ✗ Request failed:', {
        status: response.status,
        error: data.error,
      });
      return {
        success: false,
        error: data.error || `HTTP error! status: ${response.status}`,
      };
    }

    console.log('[Print Service] ✓ Print job submitted successfully');
    return data;
  } catch (error) {
    console.error('[Print Service] Exception in printInvoiceRange:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to submit print job',
    };
  }
}

/**
 * Get list of print jobs from the database
 * @param jobType - Optional filter by job type (grn, dispatch, invoice)
 * @param limit - Maximum number of jobs to return (default: 50)
 * @param status - Optional filter by status (pending, processing, completed, failed, cancelled)
 * @returns List of print jobs with status
 */
export async function getPrintJobs(
  jobType?: 'grn' | 'dispatch' | 'invoice',
  limit = 50,
  status?: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled'
): Promise<GetPrintJobsResponse> {
  try {
    console.log('[Print Service] getPrintJobs called:', {
      jobType,
      limit,
      status,
    });

    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Print Service] ✗ No auth token, returning error');
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    console.log(
      '[Print Service] ✓ Auth token obtained, making RPC API request...'
    );

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/rest/v1/rpc/get_print_jobs`;
    console.log('[Print Service] Request URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        apikey: config.anonKey,
      },
      body: JSON.stringify({
        p_job_type: jobType || null,
        p_limit: limit,
        p_status: status || null,
      }),
    });

    const data = await response.json();
    console.log('[Print Service] RPC response data:', data);
    console.log('[Print Service] Response data type:', typeof data);
    console.log('[Print Service] Is array?:', Array.isArray(data));

    if (!response.ok) {
      console.log('[Print Service] ✗ Request failed:', {
        status: response.status,
        error: data.error || data.message,
      });
      return {
        success: false,
        error:
          data.error ||
          data.message ||
          `HTTP error! status: ${response.status}`,
      };
    }

    console.log(
      '[Print Service] ✓ Print jobs fetched successfully:',
      Array.isArray(data) ? data.length : 0,
      'jobs'
    );
    return {
      success: true,
      data: Array.isArray(data) ? data : [],
    };
  } catch (error) {
    console.error('[Print Service] Exception in getPrintJobs:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to fetch print jobs',
    };
  }
}

/**
 * Cancel a pending print job
 * @param jobId - Database ID of the print job to cancel
 * @returns Success status and message
 */
export async function cancelPrintJob(
  jobId: string
): Promise<CancelPrintJobResponse> {
  try {
    console.log('[Print Service] cancelPrintJob called:', { jobId });

    const authToken = await getAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/rest/v1/rpc/cancel_print_job`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        apikey: config.anonKey,
      },
      body: JSON.stringify({
        p_print_job_id: jobId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Print Service] Error cancelling print job:', data);
      return {
        success: false,
        error: data.error || data.message || 'Failed to cancel print job',
      };
    }

    console.log('[Print Service] ✓ Print job cancelled successfully');
    return {
      success: true,
      message: data?.message || 'Print job cancelled successfully',
    };
  } catch (error) {
    console.error('[Print Service] Exception in cancelPrintJob:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to cancel print job',
    };
  }
}

/**
 * Get current printer status from CUPS
 * @param printerName - Name of the printer (default: LQ1310_RAW)
 * @returns Printer status and details
 */
export async function getPrinterStatus(
  printerName: string = 'LQ1310_RAW'
): Promise<GetPrinterStatusResponse> {
  try {
    console.log('[Print Service] getPrinterStatus called:', { printerName });

    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Print Service] ✗ No auth token, returning error');
      return {
        success: false,
        error: 'Authentication required. Please log in again.',
      };
    }

    console.log(
      '[Print Service] ✓ Auth token obtained, checking printer status...'
    );

    // Get Supabase URL from configuration
    const config = getCurrentConfig();
    const url = `${config.url}/functions/v1/get-printer-status`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        printer_name: printerName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('[Print Service] ✗ Printer status check failed:', {
        status: response.status,
        error: data.error || data.message,
      });
      return {
        success: false,
        error:
          data.error ||
          data.message ||
          `HTTP error! status: ${response.status}`,
      };
    }

    console.log('[Print Service] ✓ Printer status retrieved:', {
      status: data.status,
      message: data.message,
    });

    return {
      success: true,
      status: data.status,
      message: data.message,
      printer_name: data.printer_name,
      printer_state: data.printer_state,
      printer_state_message: data.printer_state_message,
      printer_state_reasons: data.printer_state_reasons,
      printer_is_accepting_jobs: data.printer_is_accepting_jobs,
      queued_job_count: data.queued_job_count,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error('[Print Service] Exception in getPrinterStatus:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to check printer status',
    };
  }
}
