import {
  extractHeight,
  extractToken,
  parseMessage,
  toError,
  toVerificationResult,
} from '../src/messages';

const JWT = 'eyJhbGc.SIGNED.PAYLOAD';

describe('parseMessage', () => {
  it('accepts a known message type', () => {
    expect(parseMessage(JSON.stringify({ type: 'GLOW_IDV_READY' }))?.type).toBe(
      'GLOW_IDV_READY',
    );
  });

  it('rejects unknown types, so unrelated postMessage traffic is ignored', () => {
    expect(parseMessage(JSON.stringify({ type: 'SOMETHING_ELSE' }))).toBeUndefined();
  });

  it('rejects malformed JSON rather than throwing', () => {
    expect(parseMessage('not json')).toBeUndefined();
  });
});

describe('extractToken', () => {
  it('reads the bare JWT string the SDK sends', () => {
    expect(extractToken({ data: { token: JWT } })).toBe(JWT);
  });

  it('reads the documented wrapper shape', () => {
    expect(extractToken({ data: { token: { jwt: JWT } } })).toBe(JWT);
  });

  it('reads a flattened token', () => {
    expect(extractToken({ data: { jwt: JWT } })).toBe(JWT);
  });

  it('finds it under unexpected nesting', () => {
    expect(extractToken({ message: { payload: { result: { token: JWT } } } })).toBe(JWT);
  });

  it('ignores an empty token', () => {
    expect(extractToken({ data: { token: '' } })).toBeUndefined();
  });

  it('does not loop forever on a cycle', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => extractToken(cyclic)).not.toThrow();
  });
});

describe('toVerificationResult', () => {
  it('returns a verified result with the metadata beside the token', () => {
    const result = toVerificationResult({
      type: 'GLOW_IDV_SUCCESS',
      data: {
        token: JWT,
        mpan: '1200000000000',
        method: 'energy-bill-upload',
        verificationId: 'v1',
        timestamp: '2026-07-06T08:20:43.676Z',
      },
    });
    expect(result).toEqual({
      status: 'verified',
      token: JWT,
      mpan: '1200000000000',
      method: 'energy-bill-upload',
      verificationId: 'v1',
      timestamp: '2026-07-06T08:20:43.676Z',
    });
  });

  it('treats a success with no readable token as a failure', () => {
    const result = toVerificationResult({
      type: 'GLOW_IDV_SUCCESS',
      data: { status: 'ok' },
    });
    expect(result).toEqual({
      status: 'failed',
      error: {
        code: 'INVALID_CREDENTIAL',
        message: 'Verification succeeded but returned no readable credential.',
      },
    });
  });
});

describe('toError', () => {
  it('reads details.message, as the documented payload nests it', () => {
    const error = toError(
      {
        type: 'GLOW_IDV_ERROR',
        message: { status: 'error', message: 'Cannot POST /sd', details: { message: 'Not Found' } },
      },
      'VERIFICATION_FAILED',
    );
    expect(error).toEqual({ code: 'VERIFICATION_FAILED', message: 'Not Found' });
  });

  it('falls back to reason, as older examples show', () => {
    const error = toError(
      { type: 'GLOW_IDV_ERROR', reason: 'Details did not match' },
      'VERIFICATION_FAILED',
    );
    expect(error.message).toBe('Details did not match');
  });

  it('falls back to readable text when no field is recognised', () => {
    const error = toError({ type: 'GLOW_IDV_ERROR' }, 'VERIFICATION_FAILED');
    expect(error.message).toMatch(/try again/i);
    expect(error.code).toBe('VERIFICATION_FAILED');
  });
});

describe('extractHeight', () => {
  it('reads the shape the SDK actually sends', () => {
    // Captured from the live SDK: nested under `data`, and fractional.
    const message = parseMessage(
      JSON.stringify({ type: 'GLOW_IDV_RESIZE', data: { height: 913.671875 } }),
    )!;
    expect(extractHeight(message)).toBe(913.671875);
  });

  it('reads a height at the root', () => {
    expect(extractHeight({ type: 'GLOW_IDV_RESIZE', height: 720 })).toBe(720);
  });

  it('ignores a zero or missing height', () => {
    expect(extractHeight({ type: 'GLOW_IDV_RESIZE', height: 0 })).toBeUndefined();
    expect(extractHeight({ type: 'GLOW_IDV_RESIZE' })).toBeUndefined();
  });
});
