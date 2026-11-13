import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_PRIVACY_POLICY_VERSION } from '@/components/privacy/PrivacyPolicyContent';
import {
  hasPrivacyConsentVerification,
  savePrivacyConsentVerification,
} from '@/utils/privacyConsentVerification';

interface PrivacyConsentState {
  userId?: string;
  hasCurrentConsent: boolean;
  isLoading: boolean;
  error: string | null;
}

const INITIAL_STATE: PrivacyConsentState = {
  userId: undefined,
  hasCurrentConsent: false,
  isLoading: true,
  error: null,
};

export const usePrivacyConsent = (userId?: string) => {
  const [state, setState] = useState<PrivacyConsentState>(INITIAL_STATE);
  const [isAccepting, setIsAccepting] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!userId) {
      setState({
        userId: undefined,
        hasCurrentConsent: false,
        isLoading: false,
        error: null,
      });
      return;
    }

    if (hasPrivacyConsentVerification(userId, CURRENT_PRIVACY_POLICY_VERSION)) {
      setState({
        userId,
        hasCurrentConsent: true,
        isLoading: false,
        error: null,
      });
      return;
    }

    setState((current) => ({
      userId,
      hasCurrentConsent: current.userId === userId && current.hasCurrentConsent,
      isLoading: true,
      error: null,
    }));

    const { data: activePolicy, error: policyError } = await supabase
      .from('privacy_policy_versions')
      .select('version')
      .eq('is_active', true)
      .maybeSingle();

    if (requestId !== requestIdRef.current) return;

    if (policyError || !activePolicy) {
      setState({
        userId,
        hasCurrentConsent: false,
        isLoading: false,
        error: '현재 개인정보처리방침을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
      return;
    }

    if (activePolicy.version !== CURRENT_PRIVACY_POLICY_VERSION) {
      setState({
        userId,
        hasCurrentConsent: false,
        isLoading: false,
        error: '새 개인정보처리방침이 게시되었습니다. 사이트를 새로고침한 뒤 다시 확인해 주세요.',
      });
      return;
    }

    const { data: consent, error: consentError } = await supabase
      .from('user_privacy_consents')
      .select('id')
      .eq('user_id', userId)
      .eq('policy_version', CURRENT_PRIVACY_POLICY_VERSION)
      .maybeSingle();

    if (requestId !== requestIdRef.current) return;

    if (consentError) {
      setState({
        userId,
        hasCurrentConsent: false,
        isLoading: false,
        error: '개인정보처리방침 동의 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
      return;
    }

    const hasCurrentConsent = Boolean(consent);
    if (hasCurrentConsent) {
      savePrivacyConsentVerification(userId, CURRENT_PRIVACY_POLICY_VERSION);
    }

    setState({
      userId,
      hasCurrentConsent,
      isLoading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refresh]);

  const acceptCurrentPolicy = useCallback(async () => {
    if (!userId) {
      throw new Error('로그인 정보를 확인할 수 없습니다.');
    }

    setIsAccepting(true);
    try {
      const { error } = await supabase
        .from('user_privacy_consents')
        .insert({
          user_id: userId,
          policy_version: CURRENT_PRIVACY_POLICY_VERSION,
          required_policy_accepted: true,
          student_record_notice_confirmed: true,
          age_requirement_confirmed: true,
        });

      // A duplicate means another tab already recorded the same immutable consent.
      if (error && error.code !== '23505') {
        throw error;
      }

      savePrivacyConsentVerification(userId, CURRENT_PRIVACY_POLICY_VERSION);
      setState({
        userId,
        hasCurrentConsent: true,
        isLoading: false,
        error: null,
      });
    } finally {
      setIsAccepting(false);
    }
  }, [userId]);

  const stateBelongsToCurrentUser = state.userId === userId;
  const hasStoredVerification = Boolean(
    userId && hasPrivacyConsentVerification(userId, CURRENT_PRIVACY_POLICY_VERSION),
  );

  return {
    hasCurrentConsent:
      hasStoredVerification || (stateBelongsToCurrentUser && state.hasCurrentConsent),
    isLoading:
      Boolean(userId) &&
      !hasStoredVerification &&
      (!stateBelongsToCurrentUser || state.isLoading),
    error: hasStoredVerification || !stateBelongsToCurrentUser ? null : state.error,
    isAccepting,
    acceptCurrentPolicy,
    refresh,
  };
};
