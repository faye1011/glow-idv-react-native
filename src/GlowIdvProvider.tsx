import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlowIdvView } from './GlowIdvView';
import type {
  GlowIdvConfig,
  PresentVerificationOptions,
  VerificationResult,
} from './types';

interface ContextValue {
  config: GlowIdvConfig;
  presentVerification: (
    options: PresentVerificationOptions,
  ) => Promise<VerificationResult>;
}

const GlowIdvContext = createContext<ContextValue | undefined>(undefined);

export interface GlowIdvProviderProps extends GlowIdvConfig {
  children: React.ReactNode;
  /** Label for the modal's dismiss control. */
  closeLabel?: string;
}

/**
 * Supplies Glow IDV configuration to the tree and hosts the modal presentation.
 *
 * Wrap your app once:
 *
 * ```tsx
 * <GlowIdvProvider publicGlowIdvClientKey={KEY} applicationId={APP_ID}>
 *   <App />
 * </GlowIdvProvider>
 * ```
 */
export function GlowIdvProvider({
  children,
  closeLabel = 'Cancel',
  ...config
}: GlowIdvProviderProps) {
  const [pending, setPending] = useState<PresentVerificationOptions | undefined>();
  // Held so the modal's outcome can settle the promise handed to the caller.
  const resolver = useRef<((result: VerificationResult) => void) | undefined>();
  /**
   * The most recent failure, held rather than settled.
   *
   * A failed verification is recoverable — the SDK shows its own error and lets
   * the consumer correct their details. Closing the sheet on failure would
   * destroy that and force them to start again, so the flow stays open and the
   * reason is kept here in case they give up and dismiss it.
   */
  const lastError = useRef<VerificationResult | undefined>();

  const settle = useCallback((result: VerificationResult) => {
    setPending(undefined);
    lastError.current = undefined;
    const resolve = resolver.current;
    resolver.current = undefined;
    resolve?.(result);
  }, []);

  /**
   * A result from the embedded view.
   *
   * Success closes the sheet immediately, handing the credential back so the
   * host can show its own confirmation. Failure keeps it open for another
   * attempt.
   */
  const handleResult = useCallback(
    (result: VerificationResult) => {
      if (result.status === 'verified') {
        settle(result);
        return;
      }
      lastError.current = result;
    },
    [settle],
  );

  /**
   * The consumer left the sheet without a credential — dismissed it, or used
   * the SDK's own exit control. Report the last failure if there was one, so
   * the caller knows why they left rather than only that they did.
   */
  const close = useCallback(() => {
    settle(lastError.current ?? { status: 'cancelled' });
  }, [settle]);

  const presentVerification = useCallback(
    (options: PresentVerificationOptions) => {
      // A second call while one is open would strand the first promise.
      if (resolver.current) {
        return Promise.resolve<VerificationResult>({
          status: 'failed',
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'A verification is already in progress.',
          },
        });
      }
      if (!config.publicGlowIdvClientKey || !config.applicationId) {
        return Promise.resolve<VerificationResult>({
          status: 'failed',
          error: {
            code: 'CONFIGURATION_ERROR',
            message:
              'Missing publicGlowIdvClientKey or applicationId on GlowIdvProvider.',
          },
        });
      }
      setPending(options);
      return new Promise<VerificationResult>(resolve => {
        resolver.current = resolve;
      });
    },
    [config.applicationId, config.publicGlowIdvClientKey],
  );

  const value = useMemo<ContextValue>(
    () => ({ config, presentVerification }),
    // `config` is spread from props, so compare the fields that matter rather
    // than the object identity, which changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.applicationId,
      config.publicGlowIdvClientKey,
      config.hostUrl,
      config.iframeUrl,
      config.origin,
      config.customisedMessage,
      JSON.stringify(config.allowedMethods),
      JSON.stringify(config.theme),
      presentVerification,
    ],
  );

  return (
    <GlowIdvContext.Provider value={value}>
      {children}
      <Modal
        visible={!!pending}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={close}
              hitSlop={12}>
              <Text style={styles.close}>{closeLabel}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {pending ? (
              <GlowIdvView
                subject={pending.subject}
                allowedMethods={pending.allowedMethods}
                customisedMessage={pending.customisedMessage}
                onResult={handleResult}
                onExit={close}
              />
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </GlowIdvContext.Provider>
  );
}

export function useGlowIdvContext(): ContextValue {
  const value = useContext(GlowIdvContext);
  if (!value) {
    throw new Error(
      'Glow IDV components must be rendered inside a <GlowIdvProvider>.',
    );
  }
  return value;
}

export function useGlowIdvConfig(): GlowIdvConfig {
  return useGlowIdvContext().config;
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  close: {
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
});
