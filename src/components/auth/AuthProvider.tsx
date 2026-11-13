import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { unifiedAuth } from '@/services/unifiedAuth';
import { clearGoogleTokens } from '@/lib/googleTokenUtils';
import { clearPrivacyConsentVerification } from '@/utils/privacyConsentVerification';
import { findLinkableResourceByName, fetchMyAccountLinkStatus, type AccountLinkStatus } from '@/lib/resourceLink';
import { AUTH_TIMESTAMP_KEY, PERSONAL_DEVICE_KEY, PERSONAL_DEVICE_CHANGED, readPersonalDeviceUser, setPersonalDevice, shouldExpireSession, syncPersonalDeviceSession } from '@/lib/personalDevice';

import type { Profile } from '@/types/domain';
import type { AppRole } from '@/lib/roles';
import { forgetWebPushOnSignOut } from '@/lib/webPush';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  /** 프로필 조회가 실패했을 때의 원인. null 이면 실패한 적 없음(로딩 중이거나 정상). */
  profileError: Error | null;
  session: Session | null;
  loading: boolean;
  /**
   * **미리보기를 반영한** admin 여부. 화면·기능 게이트는 이걸 쓴다.
   * 미리보기 중에는 false가 되며, 권한은 줄어들기만 하므로 안전하다.
   */
  isAdmin: boolean;
  /** `isAdmin`의 별칭(하위 호환). 새 코드는 isAdmin을 쓸 것. */
  isAdminUI: boolean;
  /**
   * 미리보기와 무관한 **실제** role === 'admin'.
   * 미리보기 컨트롤 자신(헤더 토글·나가기 칩)처럼 미리보기 중에도 살아 있어야
   * 하는 곳에서만 쓴다. 여기에 일반 기능을 걸면 미리보기가 다시 얕아진다.
   */
  isRealAdmin: boolean;
  /** 미리보기를 반영한 실효 역할. 라우트·컴포넌트 게이트의 기준값. */
  effectiveRole: AppRole | null;
  isStudentView: boolean;
  /** admin이 일반 교사 시점으로 미리보기 중인지 (admin 전용 UI를 숨김). */
  isTeacherView: boolean;
  /**
   * admin이 행정 직원(staff) 시점으로 미리보기 중인지.
   * admin·교사 전용 UI를 숨기고, `ProtectedRoute`도 staff 기준으로 판정한다
   * (학생·교사 미리보기와 달리 라우트를 실제로 막는다 — 직원 미리보기의 요점이
   * "직원에게 어디까지 열리는가"이기 때문).
   */
  isStaffView: boolean;
  /** 관리자 교사 대시보드 미리보기에만 적용하는 가상 resource_tag 이름 목록. */
  teacherPreviewTags: string[];
  viewAsStudentId: string | null;
  setViewAsStudent: (value: boolean) => void;
  setViewAsStudentId: (id: string | null) => void;
  setViewAsTeacher: (value: boolean) => void;
  setViewAsStaff: (value: boolean) => void;
  setTeacherPreviewTags: (tags: string[]) => void;
  hasNameRegistered: boolean | null; // null = not checked yet, true/false = checked
  hasResourceConnection: boolean | null; // null = not checked yet, true/false = checked
  /**
   * 명단(resource) 연결 상태 — 서버 `my_account_link_status()`. null = 아직 모름(또는 조회 실패).
   * 'unlinked' 면 RequireAuth 가 기능 대신 연결 안내만 그린다(서버도 같은 판정으로 막는다).
   */
  accountLinkStatus: AccountLinkStatus | null;
  showProfileDialog: boolean;
  setShowProfileDialog: (show: boolean) => void;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isPersonalDevice: boolean;
  setPersonalDeviceEnabled: (enabled: boolean) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshNameStatus: () => Promise<void>;
  checkResourceConnection: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Provider 밖에서도 깨지지 않는 조회 — 없으면 undefined.
 * 공용 UI 부품(`SearchableMultiSelect`)처럼 Provider 없이 렌더되는 하네스(스크린샷·SSR 회귀)가
 * 있는 곳에서만 쓴다. 화면 코드는 `useAuth` 를 쓸 것.
 */
export const useOptionalAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // 프로필 로드 실패를 값으로 남긴다 — 없으면 화면은 "빈 상태"와 "실패"를 구분할 수 없다.
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Internal ref for profile loading to avoid re-renders and stale closures in effects
  const isProfileLoading = useRef(false);
  const [hasNameRegistered, setHasNameRegistered] = useState<boolean | null>(null);
  const [hasResourceConnection, setHasResourceConnection] = useState<boolean | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [accountLinkStatus, setAccountLinkStatus] = useState<AccountLinkStatus | null>(null);

  const [personalDeviceUser, setPersonalDeviceUser] = useState(readPersonalDeviceUser);
  const isPersonalDevice = !!user && personalDeviceUser === user.id;

  useEffect(() => {
    const sync = () => setPersonalDeviceUser(readPersonalDeviceUser());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PERSONAL_DEVICE_KEY || event.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(PERSONAL_DEVICE_CHANGED, sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(PERSONAL_DEVICE_CHANGED, sync);
    };
  }, []);

  const setPersonalDeviceEnabled = useCallback(async (enabled: boolean) => {
    if (!user) throw new Error('로그인 후 개인기기를 등록해 주세요.');
    if (enabled) {
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== user.id) {
        throw new Error('로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.');
      }
      setPersonalDevice(user.id);
    } else {
      // Resume the daily policy from now, without interrupting ongoing work.
      localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
      setPersonalDevice(null);
    }
  }, [user]);

  const signOut = useCallback(async () => {
    try {
      // 이 기기의 Web Push 구독을 서버에서 지운다 — 로그인이 살아 있는 지금만 할 수 있다(최대 1.5초).
      // 공용 기기에서 로그아웃한 사람의 알림 제목이 잠금 화면에 계속 뜨지 않게.
      await forgetWebPushOnSignOut();
      console.log('🚪 Starting sign out...');
      console.log('🗑️ Clearing Google Drive/Calendar tokens...');
      clearGoogleTokens();
      clearPrivacyConsentVerification();
      localStorage.removeItem(AUTH_TIMESTAMP_KEY);
      setPersonalDevice(null);

      // Clear UnifiedAuth cache too
      unifiedAuth.clearCache();

      console.log('✅ Google tokens, session timestamp, and auth cache cleared');

      setUser(null);
      setProfile(null);
      setAccountLinkStatus(null);
      setSession(null);
      setLoading(false);

      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.error('❌ Sign out error:', error);
      } else {
        console.log('✅ Sign out successful');
      }
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
  }, []);

  // Read storage on every check so revocation in another tab takes effect too.
  const checkSessionExpiration = useCallback(async () => {
    if (!user || !profile || profile.id !== user.id) return;
    if (shouldExpireSession(user.id, profile.role)) {
      await signOut();
    }
  }, [signOut, user, profile]);

  const createUserProfile = useCallback(async (userId: string) => {
    try {
      console.log('🆕 Creating new profile for user:', userId);

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser?.email) {
        throw new Error('No user email available');
      }

      // 1. 유효성 검사 (UnifiedAuth 사용)
      unifiedAuth.validateLoginEmail(currentUser.email);
      console.log('✅ Account validation passed');

      // 2. 프로필 생성 (이메일 패턴으로 역할 결정)
      const emailPrefix = currentUser.email.split('@')[0];
      const detectedRole = /^\d{2}-/.test(emailPrefix) ? 'student' : 'teacher';

      const newProfile = {
        id: userId,
        email: currentUser.email,
        nickname: currentUser.user_metadata?.full_name || currentUser.email.split('@')[0],
        role: detectedRole,
        is_first_login: true,
        last_login: new Date().toISOString(),
        problems_registered: 0,
        ranking_points: 0,
        solutions_registered: 0,
        total_likes_received: 0,
        visit_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('📝 Inserting new profile...');
      const { data: createdProfile, error } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        console.error('❌ Profile creation error:', error);
        throw error;
      }

      console.log('✅ Profile created, setting state...');
      setProfile({
        ...createdProfile,
        signature: (createdProfile as unknown as Profile).signature || null,
        stamp: (createdProfile as unknown as Profile).stamp || null,
        visit_count: 1,
        resource_id: null
      });
      console.log('🎉 Profile creation complete:', createdProfile.email);

    } catch (error) {
      console.error('❌ Error creating profile:', error);
      setProfile(null);
      throw error;
    }
  }, []);

  const checkResourceConnectionWithProfileAndUser = useCallback(async (
    profileData: { name?: string | null },
    userId: string,
  ) => {
    if (!userId || !profileData || !profileData.name) {
      console.log('👤 사용자 정보 또는 이름이 없어 리소스 연결 확인 건너뛰기');
      setHasResourceConnection(null);
      return;
    }

    try {
      console.log('🔍 리소스 연결 상태 확인 중...', profileData.name);

      const { resource, error: resourceError } = await findLinkableResourceByName(profileData.name);

      if (resourceError) {
        console.error('❌ 리소스 조회 오류:', resourceError);
        setHasResourceConnection(false);
        return;
      }

      if (!resource) {
        console.log('🚫 해당 이름의 teacher/staff 리소스 없음');
        setHasResourceConnection(false);
        setShowProfileDialog(true);
        return;
      }

      const { data: userResource, error: userResourceError } = await supabase
        .from('user_resource')
        .select('user_id, resource_id')
        .eq('user_id', userId)
        .eq('resource_id', resource.id)
        .maybeSingle();

      if (userResourceError) {
        console.error('❌ user_resource 조회 오류:', userResourceError);
        setHasResourceConnection(false);
        setShowProfileDialog(true);
        return;
      }

      const isConnected = !!userResource;
      console.log('🔗 연결 상태:', isConnected);
      setHasResourceConnection(isConnected);

      if (!isConnected) {
        console.log('🔄 리소스 연결이 없어 프로필 편집 다이얼로그를 자동으로 엽니다');
        setShowProfileDialog(true);
      }

    } catch (error) {
      console.error('❌ 리소스 연결 확인 오류:', error);
      setHasResourceConnection(false);
      setShowProfileDialog(true);
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    if (isProfileLoading.current) {
      console.log('⏳ Profile already loading, skipping...');
      return;
    }

    isProfileLoading.current = true;
    setProfileError(null);
    try {
      console.log('🔍 Loading profile for user:', userId);

      // 1. unifiedAuth를 사용하여 프로필과 리소스 ID 한 번에 조회
      const result = await unifiedAuth.getFullUserProfile(userId);
      const userProfile = result?.profile;

      // 2. 명단 연결 상태 — 서버 판정(`my_account_link_status`)이 단일 출처다.
      //    비활성 교직원·재학 중이 아닌 학생은 로그인 차단, 미연결 계정은 RequireAuth 가
      //    기능 대신 연결 안내만 보여 준다(서버 차단막과 같은 판정).
      //    종전엔 resource 표를 직접 읽어 판정했는데, 비활성·미연결 계정은 이제 서버가 그
      //    조회를 막으므로(2026-10-13) 그 경로로는 판정할 수 없다.
      const linkStatus = userProfile ? await fetchMyAccountLinkStatus() : null;
      if (linkStatus === 'inactive') {
        const isStudentAccount = userProfile?.role === 'student';
        console.log('🚫 비활성 사용자 로그인 차단:', userProfile?.email);
        toast({
          title: '로그인 불가',
          description: isStudentAccount
            ? '재학 중인 학생만 로그인할 수 있습니다.'
            : '비활성 처리된 계정입니다. 관리자에게 문의하세요.',
          variant: 'destructive',
        });
        await signOut();
        return;
      }
      setAccountLinkStatus(linkStatus);

      // 3. Student accounts are now allowed (SPACEKIJUN FOR STUDENT)

      // 4. 프로필이 없으면 생성
      if (!userProfile) {
        console.log('🆕 Profile not found, creating new profile...');
        await createUserProfile(userId);
        console.log('✅ New profile created');
        setAccountLinkStatus(await fetchMyAccountLinkStatus());
        // createUserProfile sets the profile state, so we can return
        return;
      }

      // 5. 프로필 상태 설정
      const profileWithResource = {
        ...userProfile,
        resource_id: result?.resourceId || null,
        visit_count: userProfile.visit_count || 0,
        stamp: userProfile.stamp || null
      };

      console.log('✅ Setting existing profile:', profileWithResource.email, 'with resource_id:', profileWithResource.resource_id);
      setProfile({
        ...profileWithResource,
        signature: profileWithResource.signature || null
      });

      // 6. 이름 등록 여부 확인 & 이름 미등록 시 다이얼로그 자동 오픈
      const hasName = !!(userProfile.name && userProfile.name.trim().length > 0);
      setHasNameRegistered(hasName);

      // 학생 계정은 프로필 편집 프롬프트 및 리소스 연결 확인을 건너뜀
      if (userProfile.role !== 'student') {
        if (!hasName) {
          console.log('🔄 이름이 없어 프로필 편집 다이얼로그를 자동으로 엽니다');
          setShowProfileDialog(true);
        }

        // 7. 리소스 연결 확인 (teacher only)
        try {
          await checkResourceConnectionWithProfileAndUser(profileWithResource, userId);
        } catch (resourceError) {
          console.warn('⚠️ Resource connection check failed:', resourceError);
        }
      }

      // 8. 로그인 통계 업데이트 (background)
      unifiedAuth.updateLoginStats(userId, userProfile.visit_count || 0);

      console.log('🎉 Profile loading complete');
    } catch (error) {
      // 종전엔 여기서 profile 을 null 로만 두고 끝나, 화면은 원인도 재시도 수단도 없는
      // 빈 상태가 됐다(새로고침해도 같은 코드가 같은 결과를 낸다). 실패를 값으로 남겨
      // ProtectedRoute 가 "불러오지 못했다 + 다시 시도"를 그릴 수 있게 한다.
      console.error('❌ Error loading profile:', error);
      setProfile(null);
      setProfileError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isProfileLoading.current = false;
    }
  }, [signOut, createUserProfile, checkResourceConnectionWithProfileAndUser]);

  const checkNameStatus = useCallback(async (userId: string): Promise<boolean> => {
    // This is mainly for UI state update, actual check is part of profile loading now
    // But we keep it as it sets the state `hasNameRegistered`
    try {
      // We can use the cached profile if available to avoid DB call
      if (profile && profile.id === userId) {
        const hasName = !!(profile.name && profile.name.trim().length > 0);
        setHasNameRegistered(hasName);
        return hasName;
      }

      // Fallback to simpler check or unified check
      console.log('🔍 Checking name status for user:', userId);
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();

      const hasName = !!(data?.name && data.name.trim().length > 0);
      setHasNameRegistered(hasName);
      return hasName;
    } catch (error) {
      console.error('❌ Error checking name status:', error);
      setHasNameRegistered(false);
      return false;
    }
  }, [profile]);

  const checkResourceConnectionWithProfile = useCallback(async (
    profileData: { name?: string | null },
  ) => {
    if (!user?.id) {
      console.log('👤 사용자 ID가 없어 리소스 연결 확인 건너뛰기');
      return;
    }
    await checkResourceConnectionWithProfileAndUser(profileData, user.id);
  }, [user, checkResourceConnectionWithProfileAndUser]);

  const checkResourceConnection = useCallback(async () => {
    if (!user || !profile || !profile.name) {
      console.log('👤 사용자 정보 또는 이름이 없어 리소스 연결 확인 건너뛰기');
      setHasResourceConnection(null);
      return;
    }
    await checkResourceConnectionWithProfile(profile);
  }, [user, profile, checkResourceConnectionWithProfile]);

  const signInWithGoogle = useCallback(async (redirectPath?: string) => {
    try {
      setLoading(true);
      clearPrivacyConsentVerification();
      const redirectTo = redirectPath
        ? `${window.location.origin}${redirectPath}`
        : `${window.location.origin}/`;

      console.log('🔐 Google sign-in redirect URL:', redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
            include_granted_scopes: 'true',
            hd: 'myschool.hs.kr',
          },
          scopes: 'openid email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar'
        }
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Google sign in error:', error);
      setLoading(false);
      throw error;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id);
    }
  }, [user, loadProfile]);

  const refreshNameStatus = useCallback(async () => {
    if (user) {
      await checkNameStatus(user.id);
    }
  }, [user, checkNameStatus]);

  useEffect(() => {
    let mounted = true;
    let lastProcessedUserId: string | null = null;

    // 프로필 로드를 인증 잠금 **밖으로** 미룬다.
    //
    // auth-js 는 이 콜백을 `_notifyAllSubscribers` 에서 **인증 잠금(navigator.locks 의
    // `lock:sb-<ref>-auth-token`)을 쥔 채 await** 한다. 그런데 `supabase.from(...)` 은
    // 내부적으로 `_getAccessToken()` → `auth.getSession()` → **같은 잠금을 다시 요구**한다.
    // 그래서 콜백 안에서 supabase 호출을 await 하면 순환 대기가 된다:
    //   잠금 보유자 → 콜백 대기 → 콜백은 잠금 대기.
    // 잠금 대기에는 타임아웃이 없어(`acquireTimeout: -1`) **영구히 매달린다** →
    // `setLoading(false)` 가 영영 실행되지 않고 `RequireAuth` 가 백색 화면을 그린다.
    //
    // **토큰이 유효할 때는 드러나지 않는다.** 그때는 `INITIAL_SESSION` 만 나는데 그 경로는
    // 콜백을 await 하지 않아 잠금이 먼저 풀린다. 액세스 토큰이 만료된 뒤(=자리를 비웠다가
    // 돌아온 뒤) 부팅하면 `_recoverAndRefresh` → `TOKEN_REFRESHED` 가 **잠금 안에서 await**
    // 되면서 걸린다. 만료된 토큰은 localStorage 에 그대로 남으므로 새로고침해도 재현되고,
    // localStorage 를 비우면(=세션 없음) 갱신할 것이 없어 낫는다 — 정확히 관측된 증상이다.
    // 회귀: `npx tsx scripts/auth-lock-test/run.mts`
    const runOutsideAuthLock = (fn: () => void | Promise<void>) => {
      // 매크로태스크여야 한다. 마이크로태스크(Promise.then)는 잠금이 풀리기 전에
      // 실행될 수 있어 같은 교착에 걸린다.
      setTimeout(() => { void fn(); }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      // **동기 콜백이어야 한다.** 여기서 무엇도 await 하지 말 것 (위 설명 참고).
      (event, session) => {
        if (!mounted) return;

        console.log('🔄 Auth state changed:', event);
        syncPersonalDeviceSession(session?.user?.id ?? null);

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const existingTimestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);
          if (!existingTimestamp) {
            localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
            console.log('⏰ 로그인 타임스탬프 저장:', new Date().toLocaleString());
          } else {
            console.log('⏰ 기존 타임스탬프 유지:', new Date(parseInt(existingTimestamp)).toLocaleString());
          }
        } else {
          clearPrivacyConsentVerification();
          localStorage.removeItem(AUTH_TIMESTAMP_KEY);
        }

        if (session?.user) {
          if (lastProcessedUserId !== null && lastProcessedUserId !== session.user.id) {
            console.log('🔄 Account switch detected! Clearing Google tokens...');
            clearGoogleTokens();
            console.log('✅ Google tokens cleared due to account switch');
          }
        }

        if (session?.user) {
          if (lastProcessedUserId === session.user.id) {
            console.log('⏭️ 이미 처리된 사용자, 건너뛰기:', session.user.id);
            setLoading(false);
            return;
          }
          // 이 이벤트가 사용자를 "claim"하면 반드시 프로필도 이 이벤트에서 로드한다.
          // (claim만 하고 loadProfile을 건너뛰면 initializeAuth도 skip하여 profile=null로 남음)
          lastProcessedUserId = session.user.id;
          const userId = session.user.id;
          // OAuth 리다이렉트 로그인/새로고침 시에는 SIGNED_IN이 아니라 INITIAL_SESSION이
          // 발생할 수 있으므로 둘 다 프로필 로드 대상으로 처리한다.
          //
          // `setLoading(false)` 는 **프로필 로드가 끝난 뒤에** 해야 한다. 먼저 내리면
          // `loading=false ∧ profile=null` 이 매 페이지 로드마다 지나가고, ProtectedRoute 의
          // `if (!profile)` 이 그 구간 내내 빈 화면을 그렸다(로드가 실패하면 영구화).
          // 그 순서를 지키되, **잠금 밖에서** 기다린다.
          runOutsideAuthLock(async () => {
            if (!mounted) return;
            try {
              await loadProfile(userId);
            } finally {
              if (mounted) setLoading(false);
            }
          });
          return;
        } else {
          lastProcessedUserId = null;
          setProfile(null);
          setHasNameRegistered(null);
          setHasResourceConnection(null);
          setAccountLinkStatus(null);
          setShowProfileDialog(false);
        }

        setLoading(false);
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          if (lastProcessedUserId === session.user.id) {
            console.log('⏭️ initializeAuth: 이미 처리된 사용자, 건너뛰기:', session.user.id);
            setLoading(false);
            return;
          }
          lastProcessedUserId = session.user.id;
          await loadProfile(session.user.id);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setProfile(null);
          setHasNameRegistered(null);
          setHasResourceConnection(null);
          setAccountLinkStatus(null);
          setShowProfileDialog(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!user) return;

    checkSessionExpiration();

    const expirationCheckInterval = setInterval(() => {
      checkSessionExpiration();
    }, 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSessionExpiration();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(expirationCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, checkSessionExpiration, personalDeviceUser]);

  // 실제 role. 미리보기 컨트롤 자신만 이걸 본다 (미리보기 중에도 나가기 버튼이 살아야 하므로).
  const isRealAdmin = profile?.role === 'admin';

  // Admin can toggle student/teacher view for development/preview purposes.
  // 두 모드는 상호 배제 — 한 쪽을 켜면 다른 쪽을 끈다.
  const [viewAsStudent, _setViewAsStudent] = useState(false);
  const [viewAsStudentId, setViewAsStudentId] = useState<string | null>(null);
  const [viewAsTeacher, _setViewAsTeacher] = useState(false);
  const [viewAsStaff, _setViewAsStaff] = useState(false);
  const [teacherPreviewTags, setTeacherPreviewTags] = useState<string[]>([]);

  const setViewAsStudent = useCallback((value: boolean) => {
    _setViewAsStudent(value);
    if (value) {
      _setViewAsTeacher(false);
      _setViewAsStaff(false);
    }
  }, []);

  const setViewAsTeacher = useCallback((value: boolean) => {
    _setViewAsTeacher(value);
    if (value) {
      _setViewAsStudent(false);
      setViewAsStudentId(null);
      _setViewAsStaff(false);
    }
  }, []);

  const setViewAsStaff = useCallback((value: boolean) => {
    _setViewAsStaff(value);
    if (value) {
      _setViewAsStudent(false);
      setViewAsStudentId(null);
      _setViewAsTeacher(false);
    }
  }, []);

  const isStudentView = profile?.role === 'student' || (isRealAdmin && viewAsStudent);
  const isTeacherView = isRealAdmin && viewAsTeacher && !isStudentView;
  const isStaffView = isRealAdmin && viewAsStaff && !isStudentView;

  // 미리보기 중에는 admin 권한을 내려놓는다.
  // 이 한 줄이 `isAdmin`을 쓰는 모든 화면(148곳)을 한꺼번에 정직하게 만든다 —
  // 미리보기는 능력을 **줄이기만** 하므로 데이터 경로에 걸려 있어도 안전하다.
  const isAdmin = isRealAdmin && !viewAsStudent && !viewAsTeacher && !viewAsStaff;
  const isAdminUI = isAdmin;

  // 미리보기를 반영한 실효 역할. ProtectedRoute·RoleGate의 기준값.
  const effectiveRole: AppRole | null = !profile
    ? null
    : isStudentView
      ? 'student'
      : isStaffView
        ? 'staff'
        : isTeacherView
          ? 'teacher'
          : (profile.role as AppRole);

  const value: AuthContextType = useMemo(() => ({
    user,
    profile,
    profileError,
    session,
    loading,
    isAdmin,
    isAdminUI,
    isRealAdmin,
    effectiveRole,
    isStudentView,
    isTeacherView,
    isStaffView,
    teacherPreviewTags,
    viewAsStudentId,
    setViewAsStudent,
    setViewAsStudentId,
    setViewAsTeacher,
    setViewAsStaff,
    setTeacherPreviewTags,
    hasNameRegistered,
    hasResourceConnection,
    accountLinkStatus,
    showProfileDialog,
    setShowProfileDialog,
    signInWithGoogle,
    signOut,
    isPersonalDevice,
    setPersonalDeviceEnabled,
    refreshProfile,
    refreshNameStatus,
    checkResourceConnection
  }), [
    user,
    profile,
    profileError,
    session,
    loading,
    isAdmin,
    isAdminUI,
    isRealAdmin,
    effectiveRole,
    isStudentView,
    isTeacherView,
    isStaffView,
    teacherPreviewTags,
    viewAsStudentId,
    setViewAsStudent,
    setViewAsTeacher,
    setViewAsStaff,
    hasNameRegistered,
    hasResourceConnection,
    accountLinkStatus,
    showProfileDialog,
    signInWithGoogle,
    signOut,
    isPersonalDevice,
    setPersonalDeviceEnabled,
    refreshProfile,
    refreshNameStatus,
    checkResourceConnection
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
