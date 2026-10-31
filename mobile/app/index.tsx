import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useConnection } from '../src/context/ConnectionContext';
import { postPairingHref } from '../src/services/deepLink';

export default function IndexScreen() {
  const { isConfigured, isRestoring } = useConnection();

  useEffect(() => {
    if (!isRestoring) {
      SplashScreen.hideAsync();
    }
  }, [isRestoring]);

  // Keep splash screen visible while restoring saved connection
  if (isRestoring) {
    return null;
  }

  // A revoked/expired device token is forgotten by ConnectionContext, which
  // makes the phone unconfigured and lands here -> pairing screen.
  if (!isConfigured) {
    return <Redirect href='/connect' />;
  }

  return <Redirect href={postPairingHref() as never} />;
}
