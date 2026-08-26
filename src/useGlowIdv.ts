import { useGlowIdvContext } from './GlowIdvProvider';
import type { PresentVerificationOptions, VerificationResult } from './types';

export interface GlowIdv {
  /**
   * Presents verification as a modal sheet and resolves with the outcome.
   *
   * ```tsx
   * const { presentVerification } = useGlowIdv();
   * const result = await presentVerification({ subject: 'customer@example.com' });
   * if (result.status === 'verified') {
   *   await captureConsent(result.token);
   * }
   * ```
   *
   * Never rejects — a failure resolves with `status: 'failed'`, and dismissing
   * resolves with `status: 'cancelled'`.
   */
  presentVerification: (
    options: PresentVerificationOptions,
  ) => Promise<VerificationResult>;
}

/** Access the Glow IDV flow from anywhere inside a `GlowIdvProvider`. */
export function useGlowIdv(): GlowIdv {
  const { presentVerification } = useGlowIdvContext();
  return { presentVerification };
}
