const PRIVACY_CONSENT_VERIFICATION_KEY = 'privacy_consent_verification';

interface PrivacyConsentVerification {
  userId: string;
  policyVersion: string;
}

const readVerification = (): PrivacyConsentVerification | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(PRIVACY_CONSENT_VERIFICATION_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<PrivacyConsentVerification>;
    if (typeof parsed.userId !== 'string' || typeof parsed.policyVersion !== 'string') {
      window.localStorage.removeItem(PRIVACY_CONSENT_VERIFICATION_KEY);
      return null;
    }

    return {
      userId: parsed.userId,
      policyVersion: parsed.policyVersion,
    };
  } catch {
    return null;
  }
};

export const hasPrivacyConsentVerification = (
  userId: string,
  policyVersion: string,
): boolean => {
  const verification = readVerification();
  return verification?.userId === userId && verification.policyVersion === policyVersion;
};

export const savePrivacyConsentVerification = (
  userId: string,
  policyVersion: string,
): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      PRIVACY_CONSENT_VERIFICATION_KEY,
      JSON.stringify({ userId, policyVersion } satisfies PrivacyConsentVerification),
    );
  } catch {
    return;
  }
};

export const clearPrivacyConsentVerification = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(PRIVACY_CONSENT_VERIFICATION_KEY);
  } catch {
    return;
  }
};
