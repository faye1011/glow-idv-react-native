/**
 * Parsing and normalisation of the SDK's postMessage protocol.
 *
 * Everything the iframe sends passes through here, so integrators never deal
 * with a raw message. This is also the single place the credential's location
 * is decided — if the wire format changes, only this file moves.
 */

import type { GlowIdvError, GlowIdvErrorCode, VerificationResult } from './types';

export type IdvMessageType =
  | 'GLOW_IDV_READY'
  | 'GLOW_IDV_RESIZE'
  | 'GLOW_IDV_METHOD_SELECT'
  | 'GLOW_IDV_CHANGE'
  | 'GLOW_IDV_FILE_UPLOAD'
  | 'GLOW_IDV_SUBMIT'
  | 'GLOW_IDV_SUCCESS'
  | 'GLOW_IDV_ERROR'
  | 'GLOW_IDV_EXIT';

/** Emitted by the host page itself rather than relayed from the iframe. */
export type HostMessageType = 'HOST_ERROR';

const MESSAGE_TYPES = new Set<string>([
  'GLOW_IDV_READY',
  'GLOW_IDV_RESIZE',
  'GLOW_IDV_METHOD_SELECT',
  'GLOW_IDV_CHANGE',
  'GLOW_IDV_FILE_UPLOAD',
  'GLOW_IDV_SUBMIT',
  'GLOW_IDV_SUCCESS',
  'GLOW_IDV_ERROR',
  'GLOW_IDV_EXIT',
  'HOST_ERROR',
]);

export interface IdvMessage {
  type: IdvMessageType | HostMessageType;
  [key: string]: unknown;
}

/** How deep to search a message before giving up. */
const MAX_DEPTH = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parseMessage(raw: string): IdvMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return undefined;
  }
  return MESSAGE_TYPES.has(parsed.type) ? (parsed as IdvMessage) : undefined;
}

/**
 * Finds the signed JWT in a success message.
 *
 * The SDK sends `token` as the JWT string; some documentation describes it as
 * an object wrapping one under `token.jwt`. Rather than depend on either, walk
 * the message and find the node that actually carries a JWT. That survives both
 * shapes and any future re-nesting.
 */
export function extractToken(message: unknown, depth = 0): string | undefined {
  if (depth > MAX_DEPTH || !isRecord(message)) {
    return undefined;
  }

  const token = message.token;

  // What the SDK sends: the JWT itself.
  if (typeof token === 'string' && token) {
    return token;
  }
  // The wrapper shape described in earlier documentation.
  if (isRecord(token) && typeof token.jwt === 'string' && token.jwt) {
    return token.jwt;
  }
  // A flattened variant, with the JWT directly on the node.
  if (typeof message.jwt === 'string' && message.jwt) {
    return message.jwt;
  }

  for (const value of Object.values(message)) {
    const found = extractToken(value, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** Finds the node carrying the verification metadata, for fields beside the token. */
function findDetails(message: unknown, depth = 0): Record<string, unknown> {
  if (depth > MAX_DEPTH || !isRecord(message)) {
    return {};
  }
  if (message.mpan !== undefined || message.method !== undefined) {
    return message;
  }
  for (const value of Object.values(message)) {
    const found = findDetails(value, depth + 1);
    if (Object.keys(found).length > 0) {
      return found;
    }
  }
  return {};
}

/**
 * Turns a GLOW_IDV_SUCCESS message into a result.
 *
 * A success carrying no readable token is reported as a failure: consent
 * captured without a credential is invalid, so letting the consumer through
 * would produce an onboarding that is rejected later with no obvious cause.
 */
export function toVerificationResult(message: IdvMessage): VerificationResult {
  const token = extractToken(message);
  if (!token) {
    return {
      status: 'failed',
      error: {
        code: 'INVALID_CREDENTIAL',
        message: 'Verification succeeded but returned no readable credential.',
      },
    };
  }
  const details = findDetails(message);
  return {
    status: 'verified',
    token,
    mpan: str(details.mpan),
    method: str(details.method),
    verificationId: str(details.verificationId),
    timestamp: str(details.timestamp),
  };
}

/**
 * Best-effort error text.
 *
 * Documentation has shown `reason`, `details.message` and a payload nested
 * one level deeper under `message`. Try each before falling back.
 */
export function toError(message: IdvMessage, code: GlowIdvErrorCode): GlowIdvError {
  const nested = isRecord(message.message) ? message.message : message;
  const details = isRecord(nested.details) ? nested.details : undefined;

  const candidates = [
    message.reason,
    details?.message,
    nested.message,
    message.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return { code, message: candidate };
    }
  }
  return {
    code,
    message: 'Verification failed. Please check the details and try again.',
  };
}

/** Pixel height from a resize message. */
export function extractHeight(message: IdvMessage): number | undefined {
  const candidates = [message.height, isRecord(message.data) ? message.data.height : undefined];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate > 0) {
      return candidate;
    }
  }
  return undefined;
}
