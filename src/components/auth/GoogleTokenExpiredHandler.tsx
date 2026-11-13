import { useEffect, useState } from 'react';
import { GoogleReauthDialog } from './GoogleReauthDialog';

/**
 * Global handler for Google token expiration
 * Listens for 'google-auth-expired' custom events and shows popup re-authentication dialog
 */
export function GoogleTokenExpiredHandler() {
  const [showReauthDialog, setShowReauthDialog] = useState(false);

  useEffect(() => {
    const handleGoogleAuthExpired = () => {
      setShowReauthDialog(true);
    };

    window.addEventListener('google-auth-expired', handleGoogleAuthExpired);
    return () => {
      window.removeEventListener('google-auth-expired', handleGoogleAuthExpired);
    };
  }, []);

  return (
    <GoogleReauthDialog
      open={showReauthDialog}
      onOpenChange={setShowReauthDialog}
    />
  );
}
