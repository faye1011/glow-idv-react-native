/**
 * Glow IDV for React Native.
 *
 * Configure once at the root, then present verification as a modal or embed it
 * in a screen you lay out yourself.
 *
 * ```tsx
 * <GlowIdvProvider publicGlowIdvClientKey={KEY} applicationId={APP_ID}>
 *   <App />
 * </GlowIdvProvider>
 * ```
 */

export { GlowIdvProvider, type GlowIdvProviderProps } from './GlowIdvProvider';
export { GlowIdvView, type GlowIdvViewProps } from './GlowIdvView';
export { useGlowIdv, type GlowIdv } from './useGlowIdv';

export type {
  GlowIdvConfig,
  GlowIdvError,
  GlowIdvErrorCode,
  GlowIdvTheme,
  IdvMethod,
  PresentVerificationOptions,
  VerificationResult,
} from './types';
