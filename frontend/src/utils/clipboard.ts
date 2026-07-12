/**
 * Focused clipboard helper with safe failure handling.
 */

export type ClipboardResult = 'success' | 'unsupported' | 'failed';

export async function copyTextToClipboard(text: string): Promise<ClipboardResult> {
  if (!text) return 'failed';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'success';
    }
    return 'unsupported';
  } catch {
    return 'failed';
  }
}
