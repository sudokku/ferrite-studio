// Bitmask constants matching the Rust backend
export const TAB_ARCHITECT = 0x01   // always
export const TAB_DATASET   = 0x02   // spec saved
export const TAB_TRAIN     = 0x04   // dataset loaded
export const TAB_EVALUATE  = 0x08   // training done/stopped
export const TAB_TEST      = 0x10   // always

export function isTabUnlocked(mask: number, bit: number): boolean {
  return (mask & bit) !== 0
}
