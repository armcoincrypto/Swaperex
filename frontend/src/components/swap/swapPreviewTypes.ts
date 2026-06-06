/** Modal step union — kept separate so SwapInterface does not statically import SwapPreviewModal. */
export type SwapStep =
  | 'preview'
  | 'approving'
  | 'swapping'
  | 'broadcasting'
  | 'success'
  | 'error';
