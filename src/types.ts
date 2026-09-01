/** Public types for the Glow IDV React Native SDK. */

/** Verification methods the SDK can offer. */
export type IdvMethod = 'mpxn-eui-last4' | 'document-upload';

/** Stable error codes, so apps can branch on something other than prose. */
export type GlowIdvErrorCode =
  /** The SDK script could not be loaded or initialised. */
  | 'SDK_LOAD_FAILED'
  /** The consumer's details did not verify. */
  | 'VERIFICATION_FAILED'
  /** Verification reported success but carried no readable credential. */
  | 'INVALID_CREDENTIAL'
  /** The device could not reach the verification service. */
  | 'NETWORK_ERROR'
  /** Required configuration was missing. */
  | 'CONFIGURATION_ERROR';

export interface GlowIdvError {
  code: GlowIdvErrorCode;
  message: string;
}

/**
 * Outcome of a verification attempt.
 *
 * Discriminated on `status`, so there is no way to read a token from a failed
 * attempt.
 */
export type VerificationResult =
  | {
      status: 'verified';
      /**
       * The verifiable credential, as a signed JWT.
       *
       * Sensitive: the payload carries whatever was supplied as `subject`.
       * Do not log it, persist it in storage you do not control, or put it in
       * a URL. Send it to your server to capture consent.
       */
      token: string;
      /** The meter point that was verified against. */
      mpan: string;
      /** The method the consumer chose. */
      method: IdvMethod | string;
      /** Reference for the verification event. */
      verificationId: string;
      /** ISO 8601 time the credential was issued. */
      timestamp: string;
    }
  | { status: 'failed'; error: GlowIdvError }
  | { status: 'cancelled' };

/** Visual customisation of the embedded flow. */
export interface GlowIdvTheme {
  /** Publicly reachable image URL. */
  logoUrl?: string;
  /** A CSS font-family value. */
  font?: string;
  /** Primary brand colour, as a CSS colour. */
  primaryColor?: string;
  /** Secondary colour, as a CSS colour. */
  secondaryColor?: string;
  /** Corner rounding, as a CSS length. */
  borderRadius?: string;
  /** Base spacing unit, as a CSS length. */
  spacing?: string;
}

/** Configuration supplied once, to `GlowIdvProvider`. */
export interface GlowIdvConfig {
  /** Issued by the Glow team; authorises your organisation to use the SDK. */
  publicGlowIdvClientKey: string;
  /** Your Glow application identifier. */
  applicationId: string;
  /** Methods to offer. Defaults to both. */
  allowedMethods?: IdvMethod[];
  theme?: GlowIdvTheme;
  /** Shown by the SDK after a successful verification. */
  customisedMessage?: string;
  /**
   * Serve the host page from your own HTTPS origin instead of the built-in
   * inline page. Preferred where you have somewhere to host it: a real origin
   * keeps the SDK's origin handling and any CORS behaving as they do on the
   * web.
   */
  hostUrl?: string;
  /** Overrides the hosted iframe URL. Rarely needed. */
  iframeUrl?: string;
  /** Overrides the origin messages must come from. Rarely needed. */
  origin?: string;
}

/** Per-verification options. */
export interface PresentVerificationOptions {
  /**
   * Identifier for this energy consumer — an email address or a unique
   * reference. Becomes their username in the Glow Platform.
   */
  subject: string;
  /** Overrides the methods configured on the provider. */
  allowedMethods?: IdvMethod[];
  /** Overrides the message shown after a successful verification. */
  customisedMessage?: string;
}
