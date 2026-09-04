/**
 * Jest mock, so apps can test flows that involve verification without a
 * network or a WebView.
 *
 *   jest.mock('@hildebrandtech/idv-react-native', () =>
 *     require('@hildebrandtech/idv-react-native/jest/mock'));
 *
 * By default `presentVerification` resolves as verified. Override per test:
 *
 *   const { __setNextResult } = require('@hildebrandtech/idv-react-native');
 *   __setNextResult({ status: 'cancelled' });
 */

const VERIFIED = {
  status: 'verified',
  token: 'test.jwt.token',
  mpan: '1200000000000',
  method: 'mpxn-eui-last4',
  verificationId: 'test-verification',
  timestamp: '2026-01-01T00:00:00.000Z',
};

let nextResult = VERIFIED;

module.exports = {
  GlowIdvProvider: ({ children }) => children,
  GlowIdvView: () => null,
  useGlowIdv: () => ({
    presentVerification: () => Promise.resolve(nextResult),
  }),
  /** Sets what the next `presentVerification` resolves with. */
  __setNextResult: result => {
    nextResult = result;
  },
  /** Restores the default verified result. */
  __resetResult: () => {
    nextResult = VERIFIED;
  },
};
