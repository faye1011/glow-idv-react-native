import type { GlowIdvConfig, IdvMethod, GlowIdvTheme } from './types';

export const DEFAULT_ORIGIN = 'https://register.glownetzero.com';
export const DEFAULT_IFRAME_URL = `${DEFAULT_ORIGIN}/iframe.html`;
export const DEFAULT_METHODS: IdvMethod[] = ['mpxn-eui-last4', 'document-upload'];

export interface HostPageOptions {
  config: GlowIdvConfig;
  subject: string;
  allowedMethods: IdvMethod[];
  customisedMessage?: string;
  theme?: GlowIdvTheme;
  /**
   * The SDK's source, inlined into the page.
   *
   * WKWebView will not load a remote <script src> into a page supplied as an
   * HTML string, whatever base URL it is given, so referencing the SDK by URL
   * leaves the page inert with no error to report. Fetching it in React Native
   * and inlining it here keeps the page self-contained. The iframe still loads
   * from its own origin, which is a navigation rather than a subresource and
   * is unaffected.
   *
   * Falls back to a script tag when absent, which is correct for a page served
   * from a real origin.
   */
  sdkSource?: string;
}

/**
 * Builds the page that hosts the SDK inside the WebView.
 *
 * The SDK is a browser component, so it needs a document to live in. This page
 * supplies one, performs the origin check the protocol requires, and relays
 * accepted messages to React Native. A message from any other origin is dropped
 * before it reaches the app.
 */
export function buildHostPage({
  config,
  subject,
  allowedMethods,
  customisedMessage,
  theme,
  sdkSource,
}: HostPageOptions): string {
  const origin = config.origin ?? DEFAULT_ORIGIN;

  // Serialised as JSON so a quote in any value cannot break out of the script.
  const options = JSON.stringify({
    publicGlowIdvClientKey: config.publicGlowIdvClientKey,
    applicationId: config.applicationId,
    subject,
    allowedMethods,
    iframeUrl: config.iframeUrl ?? DEFAULT_IFRAME_URL,
    ...(customisedMessage ? { customisedMessage } : {}),
    ...(theme ? { theme } : {}),
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    ${sdkSource ? `<script>${sdkSource}</script>` : `<script src="${origin}/glowidv.umd.cjs"></script>`}
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #idv-container { width: 100%; }
      /*
       * The SDK sets the iframe's height only on receiving a resize message,
       * so without a floor it renders at no height and the flow appears blank.
       * This keeps it visible until the real height arrives, after which the
       * SDK's own inline style takes over.
       */
      #idv-container iframe {
        width: 100%;
        min-height: 600px;
        border: 0;
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="idv-container"></div>
    <script>
      (function () {
        var IDV_ORIGIN = ${JSON.stringify(origin)};

        function send(payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        }

        // Without this a script that fails to load produces silence, which is
        // very hard to diagnose on a device.
        window.onerror = function (message) {
          send({ type: 'HOST_ERROR', reason: String(message) });
        };

        window.addEventListener('message', function (event) {
          if (event.origin !== IDV_ORIGIN) {
            return;
          }
          var message = event.data;
          if (!message || typeof message.type !== 'string') {
            return;
          }
          send(message);
        });

        function start() {
          if (!window.GlowIDV) {
            send({ type: 'HOST_ERROR', reason: 'Could not load the verification SDK.' });
            return;
          }
          try {
            new window.GlowIDV(${options}).mount('#idv-container');
          } catch (error) {
            send({ type: 'HOST_ERROR', reason: String((error && error.message) || error) });
          }
        }

        if (document.readyState === 'complete') {
          start();
        } else {
          window.addEventListener('load', start);
        }
      })();
    </script>
  </body>
</html>`;
}

/**
 * Query string for a self-hosted page.
 *
 * `publicGlowIdvClientKey` is deliberately omitted: URLs reach server logs,
 * proxies and history, so a hosted page should hold its own copy server-side.
 */
export function buildHostUrl(options: HostPageOptions): string {
  const { config, subject, allowedMethods, customisedMessage, theme } = options;
  const params: Record<string, string> = {
    subject,
    applicationId: config.applicationId,
    allowedMethods: allowedMethods.join(','),
  };
  if (customisedMessage) {
    params.customisedMessage = customisedMessage;
  }
  for (const [key, value] of Object.entries(theme ?? {})) {
    if (value) {
      params[key] = value;
    }
  }
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const base = config.hostUrl ?? '';
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

/**
 * Script injected into a page served from the IDV origin, which sets up the
 * SDK in place.
 *
 * Supplying the host page as an HTML string gives it no real origin, and newer
 * iOS refuses to load the SDK's iframe from such a page — the flow initialises
 * and then goes silent, with nothing to report. Loading a real URL on the IDV
 * origin instead gives the page a genuine origin, same-origin with the iframe,
 * which sidesteps that entirely and needs nothing hosted specially.
 *
 * The page's own content is replaced; only its origin is being borrowed.
 */
export function buildInjectedScript({
  config,
  subject,
  allowedMethods,
  customisedMessage,
  theme,
}: HostPageOptions): string {
  const options = JSON.stringify({
    publicGlowIdvClientKey: config.publicGlowIdvClientKey,
    applicationId: config.applicationId,
    subject,
    allowedMethods,
    iframeUrl: config.iframeUrl ?? DEFAULT_IFRAME_URL,
    ...(customisedMessage ? { customisedMessage } : {}),
    ...(theme ? { theme } : {}),
  });

  return `(function () {
  function relay(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  // Deliberately no window.onerror here: the page whose origin we are
  // borrowing runs its own scripts, and their failures are not ours to report.
  // Loading and mounting are covered by script.onerror and the try/catch below.

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) {
      return;
    }
    var message = event.data;
    if (!message || typeof message.type !== 'string') {
      return;
    }
    relay(message);
  });

  var style = document.createElement('style');
  style.textContent =
    'html,body{margin:0;padding:0;background:transparent}' +
    '#idv-container{width:100%}' +
    // The SDK sets a height only once it reports a resize; without a floor the
    // flow renders at no height and appears blank.
    '#idv-container iframe{width:100%;min-height:600px;border:0;display:block}';
  document.head.appendChild(style);

  document.body.innerHTML = '<div id="idv-container"></div>';

  var script = document.createElement('script');
  script.src = '/glowidv.umd.cjs';
  script.onload = function () {
    if (!window.GlowIDV) {
      relay({ type: 'HOST_ERROR', reason: 'Could not load the verification SDK.' });
      return;
    }
    try {
      new window.GlowIDV(${options}).mount('#idv-container');
    } catch (error) {
      relay({
        type: 'HOST_ERROR',
        reason: String((error && error.message) || error),
      });
    }
  };
  script.onerror = function () {
    relay({ type: 'HOST_ERROR', reason: 'Could not load the verification SDK.' });
  };
  document.head.appendChild(script);
})();
true;`;
}
