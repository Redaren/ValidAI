/**
 * File utility functions
 * Phase 1.9: Support direct file uploads without Storage
 */

/**
 * Convert a File to base64 string (without data URL prefix)
 * Used for direct upload to Edge Function
 *
 * @param file - The File object to convert
 * @returns Promise resolving to base64 string (without 'data:...' prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const base64 = reader.result as string
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64Data = base64.split(',')[1]
      resolve(base64Data)
    }

    reader.onerror = reject

    reader.readAsDataURL(file)
  })
}
