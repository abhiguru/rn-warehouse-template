import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface ShareResult {
  success: boolean;
  error?: string;
}

/**
 * Downloads a PDF from a signed URL and opens the native share sheet
 * Uses expo-file-system SDK 54+ API with File class
 * @param pdfUrl - Signed URL to download the PDF from
 * @param filename - Name for the downloaded file (e.g., "GRN_Z0797.pdf")
 * @returns Result indicating success or failure
 */
export async function downloadAndSharePDF(
  pdfUrl: string,
  filename: string
): Promise<ShareResult> {
  const cacheDir = Paths.cache;
  const localPath = `${cacheDir.uri}/${filename}`;

  try {
    console.log('[Share] Starting PDF download:', { pdfUrl: pdfUrl.substring(0, 50) + '...', filename });

    // Check if sharing is available on this device
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      console.log('[Share] ✗ Sharing not available on this device');
      return {
        success: false,
        error: 'Sharing is not available on this device',
      };
    }

    // Download the PDF using fetch and save with File API
    console.log('[Share] Downloading PDF to:', localPath);
    const response = await fetch(pdfUrl);

    if (!response.ok) {
      console.error('[Share] ✗ Download failed:', response.status);
      return {
        success: false,
        error: `Failed to download PDF (status: ${response.status})`,
      };
    }

    // Get the PDF data as ArrayBuffer
    const pdfData = await response.arrayBuffer();

    // Create file and write the data
    const file = new File(localPath);
    await file.write(new Uint8Array(pdfData));

    console.log('[Share] ✓ PDF downloaded successfully');

    // Open native share sheet
    console.log('[Share] Opening share sheet...');
    await Sharing.shareAsync(localPath, {
      mimeType: 'application/pdf',
      dialogTitle: `Share ${filename}`,
      UTI: 'com.adobe.pdf', // iOS specific
    });

    console.log('[Share] ✓ Share sheet opened');

    // Clean up cached file after a delay
    // (Give time for the share action to complete)
    setTimeout(() => {
      try {
        const cachedFile = new File(localPath);
        if (cachedFile.exists) {
          cachedFile.delete();
          console.log('[Share] Cleaned up cached file');
        }
      } catch (cleanupError) {
        console.log('[Share] Cleanup error (non-critical):', cleanupError);
      }
    }, 60000); // 1 minute delay

    return { success: true };
  } catch (error) {
    console.error('[Share] Exception:', error);

    // Try to clean up on error
    try {
      const cachedFile = new File(localPath);
      if (cachedFile.exists) {
        cachedFile.delete();
      }
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to share PDF',
    };
  }
}

/**
 * Downloads a PDF without sharing (save to device)
 * Note: This saves to app cache directory. For saving to user-accessible
 * location, additional permissions and expo-media-library would be needed.
 * @param pdfUrl - Signed URL to download the PDF from
 * @param filename - Name for the downloaded file
 * @returns Result with local file path on success
 */
export async function downloadPDF(
  pdfUrl: string,
  filename: string
): Promise<ShareResult & { localUri?: string }> {
  const cacheDir = Paths.cache;
  const localPath = `${cacheDir.uri}/${filename}`;

  try {
    console.log('[Download] Starting PDF download:', { filename });

    const response = await fetch(pdfUrl);

    if (!response.ok) {
      console.error('[Download] ✗ Download failed:', response.status);
      return {
        success: false,
        error: `Failed to download PDF (status: ${response.status})`,
      };
    }

    const pdfData = await response.arrayBuffer();
    const file = new File(localPath);
    await file.write(new Uint8Array(pdfData));

    console.log('[Download] ✓ PDF downloaded to:', localPath);
    return {
      success: true,
      localUri: localPath,
    };
  } catch (error) {
    console.error('[Download] Exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download PDF',
    };
  }
}
