import type { GlowIdvConfig, IdvMethod, GlowIdvTheme } from './types';

export const DEFAULT_ORIGIN = 'https://register.glownetzero.com';
export const DEFAULT_IFRAME_URL = `${DEFAULT_ORIGIN}/iframe.html`;
export const DEFAULT_METHODS: IdvMethod[] = ['mpxn-eui-last4', 'energy-bill-upload'];

export interface HostPageOptions {
  config: GlowIdvConfig;
  subject: string;
  allowedMethods: IdvMethod[];
  customisedMessage?: string;
  theme?: GlowIdvTheme;
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
    <script src="${origin}/glowidv.umd.cjs"></script>
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #idv-container { width: 100%; }
      #idv-container iframe { width: 100%; border: 0; display: block; }
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
