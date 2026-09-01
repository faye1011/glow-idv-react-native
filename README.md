# @glow/idv-react-native

Glow IDV identity and address verification for React Native apps.

Confirms that an energy consumer lives at a given property, producing a
verifiable credential you use to capture their consent for smart meter data
access.

## Installation

```bash
npm install @glow/idv-react-native react-native-webview
cd ios && pod install
```

`react-native-webview` is a peer dependency and contains native code, so a
rebuild is required — a JavaScript reload will not pick it up.

## Setup

Wrap your app once with the credentials issued by Glow:

```tsx
import { GlowIdvProvider } from '@glow/idv-react-native';

export default function App() {
  return (
    <GlowIdvProvider
      publicGlowIdvClientKey={PUBLIC_GLOW_IDV_CLIENT_KEY}
      applicationId={APPLICATION_ID}
      theme={{ primaryColor: '#ff7300', borderRadius: '20px' }}>
      <YourApp />
    </GlowIdvProvider>
  );
}
```

## Presenting verification

```tsx
import { useGlowIdv } from '@glow/idv-react-native';

function ConnectMeter({ email }: { email: string }) {
  const { presentVerification } = useGlowIdv();

  const verify = async () => {
    const result = await presentVerification({ subject: email });

    if (result.status === 'verified') {
      // Send the credential to your server to capture consent.
      await api.captureConsent(result.token);
    } else if (result.status === 'failed') {
      showError(result.error.message);
    }
    // 'cancelled' — the consumer dismissed the sheet.
  };

  return <Button title="Connect my meter" onPress={verify} />;
}
```

`presentVerification` never rejects. Every outcome resolves as a
`VerificationResult`.

## Embedding it in your own screen

```tsx
import { GlowIdvView } from '@glow/idv-react-native';

<GlowIdvView
  subject={email}
  onVerified={result => captureConsent(result.token)}
  onError={error => showError(error.message)}
/>
```

The view sizes itself to the flow's content. Pass `autoHeight={false}` and a
`style` height to control it yourself.

## Verification methods

| Value | Method |
| --- | --- |
| `mpxn-eui-last4` | Meter point number plus the last four digits of the IHD identifier |
| `document-upload` | Upload of a supporting document |

Both are offered by default. To offer only one:

```tsx
<GlowIdvProvider allowedMethods={['mpxn-eui-last4']} …>
```

### Permissions for document upload

`document-upload` opens a camera or photo picker, which the host app must
declare. **On iOS a missing usage string crashes the app** when the picker
opens, so treat these as required.

`ios/YourApp/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Used to photograph a document when verifying your address.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Used to choose a document when verifying your address.</string>
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:targetApi="33" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

Offering only `mpxn-eui-last4` avoids this entirely.

## Handling the credential

`result.token` is a signed JWT, valid for three months.

- **Send it to your server.** Consent capture uses organisation-level
  credentials and must not run from the client.
- **Do not log it**, including to crash reporters. The payload carries whatever
  you supplied as `subject`, often an email address.
- **Do not persist it** in storage you do not control. Keep it in memory and
  clear it on sign-out.

## Testing

A Jest mock is included, so tests never touch the network or a WebView:

```js
jest.mock('@glow/idv-react-native', () =>
  require('@glow/idv-react-native/jest/mock'));
```

It resolves as verified by default. To exercise other paths:

```js
const { __setNextResult } = require('@glow/idv-react-native');
__setNextResult({ status: 'cancelled' });
```

## API

### `GlowIdvProvider`

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `publicGlowIdvClientKey` | `string` | Yes | Issued by the Glow team |
| `applicationId` | `string` | Yes | Your Glow application identifier |
| `allowedMethods` | `IdvMethod[]` | No | Defaults to both methods |
| `theme` | `GlowIdvTheme` | No | Visual customisation |
| `customisedMessage` | `string` | No | Shown after a successful verification |
| `hostUrl` | `string` | No | Serve the host page from your own origin |

### `VerificationResult`

```ts
type VerificationResult =
  | { status: 'verified'; token: string; mpan: string; method: string;
      verificationId: string; timestamp: string }
  | { status: 'failed'; error: { code: GlowIdvErrorCode; message: string } }
  | { status: 'cancelled' };
```

### Error codes

| Code | Meaning |
| --- | --- |
| `SDK_LOAD_FAILED` | The verification SDK could not be loaded |
| `VERIFICATION_FAILED` | The consumer's details did not verify |
| `INVALID_CREDENTIAL` | Success reported, but no readable credential |
| `NETWORK_ERROR` | The service could not be reached |
| `CONFIGURATION_ERROR` | Required configuration was missing |

## How it works

The Glow IDV SDK is a browser component. This package hosts it in a WebView on
a generated page that performs the origin check the protocol requires, then
relays results back as typed callbacks. Integrators never handle a raw
`postMessage`.

One consequence worth knowing: because the flow renders web content, its screens
are styled through `theme` rather than native styling.
