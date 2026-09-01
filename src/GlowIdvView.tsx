import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useGlowIdvConfig } from './GlowIdvProvider';
import {
  DEFAULT_METHODS,
  DEFAULT_ORIGIN,
  buildHostPage,
  buildHostUrl,
} from './hostPage';
import { extractHeight, parseMessage, toError, toVerificationResult } from './messages';
import type { GlowIdvError, IdvMethod, VerificationResult } from './types';

/**
 * Height before the SDK reports its own.
 *
 * Matches the floor the host page puts on the iframe, so the WebView never
 * clips it while waiting for a resize message.
 */
const INITIAL_HEIGHT = 600;

/** How long to wait for the SDK to report itself ready before giving up. */
const READY_TIMEOUT_MS = 15000;

export interface GlowIdvViewProps {
  /** Identifier for this consumer — becomes their Glow Platform username. */
  subject: string;
  allowedMethods?: IdvMethod[];
  customisedMessage?: string;
  /** Called once, with a credential, when verification succeeds. */
  onVerified?: (result: Extract<VerificationResult, { status: 'verified' }>) => void;
  onError?: (error: GlowIdvError) => void;
  /** The consumer finished and chose to leave the flow. */
  onExit?: () => void;
  onMethodSelect?: (method: string) => void;
  /** Fires for both outcomes, if you would rather handle one callback. */
  onResult?: (result: VerificationResult) => void;
  style?: StyleProp<ViewStyle>;
  /** Grow to fit the SDK's reported height. Defaults to true. */
  autoHeight?: boolean;
}

/**
 * Embeds the Glow IDV flow inline, for a screen you lay out yourself.
 *
 * For a modal presentation, use `presentVerification` from `useGlowIdv`.
 */
export function GlowIdvView({
  subject,
  allowedMethods,
  customisedMessage,
  onVerified,
  onError,
  onExit,
  onMethodSelect,
  onResult,
  style,
  autoHeight = true,
}: GlowIdvViewProps) {
  const config = useGlowIdvConfig();
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const [sdkSource, setSdkSource] = useState<string>();
  // The SDK can emit a success more than once; only the first should count.
  const settled = useRef(false);
  const ready = useRef(false);
  /**
   * The latest reporter, so the effects below can raise an error without
   * taking it as a dependency and re-running the fetch on every render.
   */
  const reportRef = useRef<((result: VerificationResult) => void) | undefined>();

  const origin = config.origin ?? DEFAULT_ORIGIN;
  const methods = allowedMethods ?? config.allowedMethods ?? DEFAULT_METHODS;

  /*
   * Fetch the SDK so it can be inlined into the page. A remote script tag does
   * not execute inside an HTML string on iOS, which leaves the page inert with
   * nothing to report.
   */
  useEffect(() => {
    let cancelled = false;
    if (__DEV__) {
      console.log('[GlowIDV] fetching sdk from', `${origin}/glowidv.umd.cjs`);
    }
    fetch(`${origin}/glowidv.umd.cjs`)
      .then(response =>
        response.ok
          ? response.text()
          : Promise.reject(new Error(`status ${response.status}`)),
      )
      .then(text => {
        if (__DEV__) {
          console.log('[GlowIDV] sdk fetched,', text.length, 'bytes');
        }
        if (!cancelled) {
          setSdkSource(text);
        }
      })
      .catch(e => {
        if (__DEV__) {
          console.log('[GlowIDV] sdk fetch FAILED', String(e));
        }
        if (!cancelled) {
          reportRef.current?.({
            status: 'failed',
            error: {
              code: 'SDK_LOAD_FAILED',
              message: 'Could not load the verification step. Check your connection.',
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  /*
   * A flow that never reports itself ready would otherwise sit blank
   * indefinitely, which is far harder to diagnose than an error.
   */
  useEffect(() => {
    if (!sdkSource) {
      return;
    }
    const timer = setTimeout(() => {
      if (!ready.current) {
        reportRef.current?.({
          status: 'failed',
          error: {
            code: 'SDK_LOAD_FAILED',
            message: 'The verification step did not load. Please try again.',
          },
        });
      }
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [sdkSource]);

  const source = useMemo(() => {
    const options = {
      config,
      subject,
      allowedMethods: methods,
      customisedMessage: customisedMessage ?? config.customisedMessage,
      theme: config.theme,
      sdkSource,
    };
    if (config.hostUrl) {
      return { uri: buildHostUrl(options) };
    }
    return {
      html: buildHostPage(options),
      // Gives the inline page the IDV origin, so the SDK's own origin handling
      // and any CORS behave as they would on a hosted page.
      baseUrl: origin,
    };
  }, [config, customisedMessage, methods, origin, sdkSource, subject]);

  const report = useCallback(
    (result: VerificationResult) => {
      onResult?.(result);
      if (result.status === 'verified') {
        onVerified?.(result);
      } else if (result.status === 'failed') {
        onError?.(result.error);
      }
    },
    [onError, onResult, onVerified],
  );
  reportRef.current = report;

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseMessage(event.nativeEvent.data);
      if (!message) {
        if (__DEV__) {
          console.log('[GlowIDV] unrecognised message', event.nativeEvent.data.slice(0, 200));
        }
        return;
      }
      if (__DEV__) {
        console.log('[GlowIDV] message', message.type);
      }

      switch (message.type) {
        case 'GLOW_IDV_READY':
          ready.current = true;
          break;

        case 'GLOW_IDV_RESIZE': {
          const next = autoHeight ? extractHeight(message) : undefined;
          if (next) {
            setHeight(next);
          }
          break;
        }

        case 'GLOW_IDV_METHOD_SELECT':
          if (typeof message.method === 'string') {
            onMethodSelect?.(message.method);
          }
          break;

        case 'GLOW_IDV_SUCCESS': {
          if (settled.current) {
            break;
          }
          settled.current = true;
          report(toVerificationResult(message));
          break;
        }

        case 'GLOW_IDV_ERROR':
          report({ status: 'failed', error: toError(message, 'VERIFICATION_FAILED') });
          break;

        case 'HOST_ERROR':
          report({ status: 'failed', error: toError(message, 'SDK_LOAD_FAILED') });
          break;

        case 'GLOW_IDV_EXIT':
          onExit?.();
          break;

        default:
          break;
      }
    },
    [autoHeight, onExit, onMethodSelect, report],
  );

  const handleNetworkError = useCallback(
    (message: string) => () =>
      report({ status: 'failed', error: { code: 'NETWORK_ERROR', message } }),
    [report],
  );

  return (
    <View style={[styles.wrapper, style]}>
      <WebView
        source={source}
        style={[styles.webView, { height }]}
        onMessage={handleMessage}
        onError={handleNetworkError(
          'Could not load the verification step. Check your connection.',
        )}
        onHttpError={handleNetworkError('The verification service is unavailable right now.')}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        /*
         * Must stay permissive. A URL outside `originWhitelist` is not blocked —
         * react-native-webview hands it to the OS, which opens it in the system
         * browser, ejecting the flow out of the app. Navigation is gated by
         * onShouldStartLoadWithRequest below, which genuinely cancels, and the
         * boundary that matters is the origin check inside the host page.
         */
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={request =>
          request.url.startsWith('http') ||
          request.url.startsWith('about:') ||
          request.url.startsWith('data:')
        }
        /*
         * Document upload renders a file input, which opens the camera or photo
         * picker. setSupportMultipleWindows must be false on Android or the
         * chooser never appears. The matching usage strings must be declared by
         * the host app — see the README.
         */
        setSupportMultipleWindows={false}
        allowFileAccess
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  webView: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});
