"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Send, Calendar, Clock, CheckSquare, FileText, ListTodo, Users, MessageSquare, Settings, Home, Plus, Upload, User, GraduationCap, Video, ExternalLink, LayoutDashboard, Lightbulb, BarChart3, ArrowLeft, ShieldAlert } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { useAuth } from "@/components/auth/AuthProvider"
import { supabase } from "@/integrations/supabase/client"
import { useNotificationMutations } from "@/hooks/useNotifications"
import { useToast } from "@/hooks/use-toast"
import { useVisibleIframeMenus } from "@/hooks/useIframeMenus"

interface Action {
  id: string
  label: string
  icon: React.ReactNode
  description?: string
  shortcut?: string
  category?: string
  href?: string
  action?: () => void | Promise<void>
  params?: Record<string, any>
  type?: 'navigation' | 'dialog' | 'search' | 'filter'
  // true면 실행 후 검색창을 닫지 않음 (2단계 선택용 — 예: 학생 선택 → 열람 메뉴)
  keepOpen?: boolean
}

interface StudentHit {
  id: string
  name: string
  grade: number | null
  class_num: number | null
}

interface SearchResult {
  actions: Action[]
}

const allActions = [
  {
    id: "search",
    label: "검색",
    icon: <Search className="h-4 w-4 text-purple-500" />,
    description: "검색어로 모든 데이터 검색",
    category: "페이지",
    href: "/search",
    type: "navigation" as const,
  },
  {
    id: "home",
    label: "홈",
    icon: <Home className="h-4 w-4 text-blue-500" />,
    description: "오늘의 일정, 업무, 시간표 한눈에 보기",
    category: "페이지",
    href: "/",
    type: "navigation" as const,
  },
  {
    id: "timetable",
    label: "시간표",
    icon: <Calendar className="h-4 w-4 text-green-500" />,
    description: "시간표 + 선생님 이름으로 개별 시간표 조회",
    category: "페이지",
    href: "/timetable",
    type: "navigation" as const,
  },
  {
    id: "schedule",
    label: "스케줄",
    icon: <Clock className="h-4 w-4 text-purple-500" />,
    description: "스케줄 추가로 새 일정 생성, 구글 캘린더 내보내기",
    category: "페이지",
    href: "/schedule",
    type: "navigation" as const,
  },
  {
    id: "tasks",
    label: "업무",
    icon: <ListTodo className="h-4 w-4 text-emerald-500" />,
    description: "업무 생성으로 새 이벤트 및 업무 생성",
    category: "페이지",
    href: "/tasks/mine",
    type: "navigation" as const,
  },
  {
    id: "documents",
    label: "서류",
    icon: <FileText className="h-4 w-4 text-indigo-500" />,
    description: "문서 업로드, 구글 드라이브 연동, 벡터 검색",
    category: "페이지",
    href: "/documents",
    type: "navigation" as const,
  },
  {
    id: "videos",
    label: "동영상",
    icon: <Video className="h-4 w-4 text-red-600" />,
    description: "교육 동영상 시청 및 관리",
    category: "페이지",
    href: "/videos",
    type: "navigation" as const,
  },
  {
    id: "notifications",
    label: "알림",
    icon: <MessageSquare className="h-4 w-4 text-pink-500" />,
    description: "시스템 알림 및 업무 관련 메시지 확인",
    category: "페이지",
    href: "/notifications",
    type: "navigation" as const,
  },
  {
    id: "admin",
    label: "관리자",
    icon: <Settings className="h-4 w-4 text-gray-500" />,
    description: "사용자 관리, 권한 설정, 시스템 설정",
    category: "페이지",
    href: "/admin",
    type: "navigation" as const,
  },
]

interface ActionSearchBarProps {
  actions?: Action[]
  compact?: boolean
  autoFocus?: boolean
  onClose?: () => void
  onScheduleCreate?: () => void
  onWorkCreate?: () => void
  onDocumentUpload?: () => void
}

function ActionSearchBar({ actions = allActions, compact = false, autoFocus = false, onClose, onScheduleCreate, onWorkCreate, onDocumentUpload }: ActionSearchBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, isStudentView } = useAuth()
  const { toast } = useToast()
  const { createManualNotification } = useNotificationMutations()
  const { data: iframeMenus = [] } = useVisibleIframeMenus()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<SearchResult | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const [isCommandMode, setIsCommandMode] = useState(false)
  const [manualModeToggle, setManualModeToggle] = useState(false)
  const debouncedQuery = useDebounce(query, 200)

  // Dynamic data states
  const [teachers, setTeachers] = useState<Array<{id: string, name: string}>>([])
  const [sections, setSections] = useState<Array<{id: string, name: string}>>([])
  const [isLoadingData, setIsLoadingData] = useState(false)

  // 학생 검색 (교사/관리자 전용) — 학생 선택 시 2단계 열람 메뉴로 전환
  const canSearchStudents = !isStudentView && (profile?.role === 'teacher' || profile?.role === 'admin')
  const [studentResults, setStudentResults] = useState<StudentHit[]>([])
  const [pendingStudent, setPendingStudent] = useState<StudentHit | null>(null)
  // 위기 노트(rescue-note) 메뉴 노출 여부 — 서버 권한 게이트 can_care_student로
  // 학생별 판정 (담임/학년부장/상담교사/위기관리담당자/admin만 true)
  const [rescueAllowed, setRescueAllowed] = useState(false)

  useEffect(() => {
    setRescueAllowed(false)
    if (!pendingStudent) return

    let cancelled = false
    supabase
      .rpc('can_care_student', { p_student_code: pendingStudent.id })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Error checking rescue-note permission:', error)
          return
        }
        setRescueAllowed(Boolean(data))
      })

    return () => { cancelled = true }
  }, [pendingStudent])

  // 페이지 이동 시 검색창 초기화
  useEffect(() => {
    setIsFocused(false)
    setQuery("")
    setResult(null)
    setSelectedAction(null)
    setSelectedIndex(-1)
    setIsCommandMode(false)
    setManualModeToggle(false)
    setPendingStudent(null)
    setStudentResults([])
  }, [location.pathname])

  // 모드 자동 감지 (수동 전환하지 않은 경우에만)
  useEffect(() => {
    if (!manualModeToggle && query.trim()) {
      const matchingAction = getMatchingAction(query)
      setIsCommandMode(!!matchingAction)
    }
  }, [query, result, manualModeToggle])

  // autoFocus prop이 true일 때 자동으로 포커스
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // 약간의 딜레이를 주어 모달 애니메이션 후 포커스
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [autoFocus])

  // 선택된 항목으로 스크롤
  useEffect(() => {
    if (scrollContainerRef.current && selectedIndex >= 0) {
      const itemHeight = 40 // py-2 (8px * 2) + content height (약 24px)
      const scrollTop = scrollContainerRef.current.scrollTop
      const containerHeight = scrollContainerRef.current.clientHeight
      const itemTop = selectedIndex * itemHeight
      const itemBottom = itemTop + itemHeight

      // 선택된 항목이 보이는 영역 밖에 있으면 스크롤
      if (itemTop < scrollTop) {
        scrollContainerRef.current.scrollTop = itemTop
      } else if (itemBottom > scrollTop + containerHeight) {
        scrollContainerRef.current.scrollTop = itemBottom - containerHeight
      }
    }
  }, [selectedIndex])

  // Load dynamic data on mount
  useEffect(() => {
    if (user) {
      loadDynamicData()
    }
  }, [user])

  // Global keyboard shortcut (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsFocused(true)
        inputRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown)
    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown)
    }
  }, [])

  const loadDynamicData = async () => {
    setIsLoadingData(true)
    try {
      // Load teachers
      const { data: teachersData } = await supabase
        .from('resource')
        .select('id, name')
        .eq('type', 'teacher')
        .order('name')

      if (teachersData) {
        setTeachers(teachersData)
      }

      // Load sections
      const { data: sectionsData } = await supabase
        .from('section')
        .select('id, name')
        .order('name')

      if (sectionsData) {
        setSections(sectionsData)
      }
    } catch (error) {
      console.error('Error loading dynamic data:', error)
    } finally {
      setIsLoadingData(false)
    }
  }

  // 입력된 텍스트와 정확히 일치하는 액션 찾기
  const getMatchingAction = (query: string): Action | null => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return null

    // 알림 명령어 패턴 체크
    const notificationMatch = trimmedQuery.match(/^알림\s+(.+?)\s+(.+)$/)
    if (notificationMatch) {
      const [, targetName, message] = notificationMatch
      return {
        id: "send-notification",
        label: `알림 전송: ${targetName}`,
        icon: <MessageSquare className="h-4 w-4 text-pink-500" />,
        description: `"${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`,
        category: "알림",
        type: "dialog",
        action: async () => {
          await handleNotificationCommand(trimmedQuery)
        }
      }
    }

    // 현재 결과에서 정확히 일치하는 액션 찾기
    const allAvailableActions = result?.actions || []
    return allAvailableActions.find(action =>
      action.label.toLowerCase() === trimmedQuery.toLowerCase()
    ) || null
  }

  const generateDynamicActions = (query: string): Action[] => {
    const dynamicActions: Action[] = []
    const normalizedQuery = query.toLowerCase().trim()

    // 구체적인 키워드가 있는지 확인
    const hasSpecificKeyword = normalizedQuery.includes("스케줄") || normalizedQuery.includes("일정") ||
                              normalizedQuery.includes("업무") || normalizedQuery.includes("문서") || normalizedQuery.includes("파일") ||
                              normalizedQuery.includes("알림")

    // 알림 명령어 파싱
    if (normalizedQuery.startsWith("알림")) {
      const notificationMatch = query.match(/^알림\s+(.+?)\s+(.+)$/)
      if (notificationMatch) {
        const [, targetName, message] = notificationMatch
        dynamicActions.push({
          id: "send-notification",
          label: `알림 전송: ${targetName}`,
          icon: <MessageSquare className="h-4 w-4 text-pink-500" />,
          description: `"${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`,
          category: "알림",
          type: "dialog",
          action: async () => {
            await handleNotificationCommand(query.trim())
          }
        })
      } else {
        // "알림"만 입력했거나 형식이 맞지 않을 때 가이드 표시
        dynamicActions.push({
          id: "notification-guide",
          label: "알림 전송",
          icon: <MessageSquare className="h-4 w-4 text-pink-500" />,
          description: "형식: 알림 [사용자 이름] [메시지 내용]",
          category: "알림",
          type: "dialog",
          action: () => {
            toast({
              title: "알림 전송 형식",
              description: "알림 [사용자 이름] [메시지 내용] 형식으로 입력해주세요.",
            })
          }
        })
      }
    }

    // Dialog actions - 항상 표시되는 빠른 액션들
    if (normalizedQuery.includes("스케줄") || normalizedQuery.includes("일정") ||
        (!hasSpecificKeyword && (normalizedQuery.includes("추가") || normalizedQuery.includes("생성")))) {
      dynamicActions.push({
        id: "create-schedule",
        label: "스케줄 추가",
        icon: <Plus className="h-4 w-4 text-green-500" />,
        description: "새로운 스케줄 이벤트 생성",
        category: "빠른 실행",
        type: "dialog",
        action: () => onScheduleCreate?.()
      })
    }

    if (normalizedQuery.includes("업무") ||
        (!hasSpecificKeyword && (normalizedQuery.includes("추가") || normalizedQuery.includes("생성")))) {
      dynamicActions.push({
        id: "create-task-event",
        label: "업무 이벤트 추가",
        icon: <Plus className="h-4 w-4 text-blue-500" />,
        description: "새로운 업무 이벤트 추가",
        category: "빠른 실행",
        type: "dialog",
        action: () => onWorkCreate?.()
      })
    }

    if (normalizedQuery.includes("문서") || normalizedQuery.includes("파일") ||
        (!hasSpecificKeyword && normalizedQuery.includes("추가"))) {
      dynamicActions.push({
        id: "upload-document",
        label: "문서 추가",
        icon: <Upload className="h-4 w-4 text-purple-500" />,
        description: "새 문서 업로드",
        category: "빠른 실행",
        type: "dialog",
        action: () => onDocumentUpload?.()
      })
    }

    // Teacher-specific actions
    if (normalizedQuery.includes("시간표")) {
      teachers.forEach(teacher => {
        if (teacher.name.toLowerCase().includes(normalizedQuery.replace("시간표", "").trim())) {
          dynamicActions.push({
            id: `timetable-${teacher.id}`,
            label: `시간표 ${teacher.name}`,
            icon: <User className="h-4 w-4 text-indigo-500" />,
            description: `${teacher.name} 선생님의 시간표 보기`,
            category: "시간표",
            type: "filter",
            href: "/timetable",
            params: { teacher: teacher.name }
          })
        }
      })
    }

    return dynamicActions
  }

  // 학생 이름/학번 검색 (debounced query 기준)
  useEffect(() => {
    if (!canSearchStudents || !isFocused || !debouncedQuery.trim() || pendingStudent) {
      setStudentResults([])
      return
    }

    let cancelled = false
    const term = debouncedQuery.trim()
    supabase
      .from('student_basic_info' as any)
      .select('id, name, grade, class_num')
      .or(`name.ilike.%${term}%,id.ilike.%${term}%`)
      .order('grade')
      .order('class_num')
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Error searching students:', error)
          setStudentResults([])
          return
        }
        setStudentResults((data as unknown as StudentHit[]) || [])
      })

    return () => { cancelled = true }
  }, [debouncedQuery, isFocused, canSearchStudents, pendingStudent])

  // 학생 검색 결과 → 액션 변환 (클릭 시 열람 메뉴 2단계로 전환)
  const generateStudentActions = (): Action[] => {
    return studentResults.map((s) => ({
      id: `student-${s.id}`,
      label: s.name,
      icon: <GraduationCap className="h-4 w-4 text-sky-500" />,
      description: `${s.grade ?? '-'}-${s.class_num ?? '-'} · ${s.id} · 학생 데이터 열람`,
      category: "학생",
      type: "search" as const,
      keepOpen: true,
      action: () => {
        setPendingStudent(s)
        setSelectedIndex(-1)
      },
    }))
  }

  // 선택된 학생의 열람 메뉴 (생기부 분석 / 모의고사 분석 / 학생 대시보드 / 탐구 설계)
  const generateStudentDestinationActions = (student: StudentHit): Action[] => {
    const label = `${student.name} (${student.grade ?? '-'}-${student.class_num ?? '-'})`
    return [
      {
        id: `student-dest-evalog-${student.id}`,
        label: `생기부 분석 · ${student.name}`,
        icon: <FileText className="h-4 w-4 text-amber-500" />,
        description: "학생 목록에 추가하여 열람",
        category: label,
        type: "navigation" as const,
        href: "/evalog",
        params: { student: student.id },
      },
      {
        id: `student-dest-evalearn-${student.id}`,
        label: `시험 결과 분석 · ${student.name}`,
        icon: <BarChart3 className="h-4 w-4 text-violet-500" />,
        description: "모의고사·지필평가 결과 분석 열람",
        category: label,
        type: "navigation" as const,
        href: "/evalearn",
        params: { student: student.id },
      },
      {
        id: `student-dest-dashboard-${student.id}`,
        label: `학생 대시보드 · ${student.name}`,
        icon: <LayoutDashboard className="h-4 w-4 text-emerald-500" />,
        description: "종합 대시보드 열람",
        category: label,
        type: "navigation" as const,
        href: "/student-dashboard",
        params: { student: student.id },
      },
      {
        id: `student-dest-inquiry-${student.id}`,
        label: `탐구 설계 · ${student.name}`,
        icon: <Lightbulb className="h-4 w-4 text-orange-500" />,
        description: "지식그래프 기반 탐구 설계",
        category: label,
        type: "navigation" as const,
        href: "/inquiry-design",
        params: { student: student.id },
      },
      {
        id: `student-dest-wishlist-${student.id}`,
        label: `수시 지원 · ${student.name}`,
        icon: <GraduationCap className="h-4 w-4 text-red-500" />,
        description: "수시 지원 학교 목록 열람",
        category: label,
        type: "navigation" as const,
        href: "/admission-wishlist",
        params: { student: student.id },
      },
      // 위기 노트: can_care_student 통과한 사용자에게만 노출 (RPC 응답 후 표시)
      ...(rescueAllowed ? [{
        id: `student-dest-rescue-${student.id}`,
        label: `위기 노트 · ${student.name}`,
        icon: <ShieldAlert className="h-4 w-4 text-red-600" />,
        description: "위기 상태·상담일지 열람",
        category: label,
        type: "navigation" as const,
        href: "/rescue-note",
        params: { student: student.id },
      }] : []),
      {
        id: `student-dest-back`,
        label: "다른 학생 선택",
        icon: <ArrowLeft className="h-4 w-4 text-gray-400" />,
        description: "학생 검색으로 돌아가기",
        category: label,
        type: "search" as const,
        keepOpen: true,
        action: () => {
          setPendingStudent(null)
          setSelectedIndex(-1)
        },
      },
    ]
  }

  const generateIframeMenuActions = (query: string): Action[] => {
    const normalizedQuery = query.toLowerCase().trim()
    const iframeActions: Action[] = []

    // 학생에게는 `showStudent === true` 인 메뉴만 노출한다 — 사이드바(useNavSections)가
    // 쓰는 것과 **같은 기준**이다. 종전엔 이 검색만 필터가 없어, 관리 화면에 "학생 숨김"으로
    // 표시된 메뉴(라이브 15건 중 8건 — 업무포털·성과상여금 평가 등 교직원 전용)가 학생의
    // 명령 검색 결과에 그대로 나왔다. 관리자가 공개 범위를 통제했다고 믿게 만드는 상태였다.
    const visibleMenus = isStudentView
      ? iframeMenus.filter((menu) => menu.meta?.showStudent === true)
      : iframeMenus;

    visibleMenus.forEach(menu => {
      // Filter by menu name matching query
      if (!normalizedQuery || menu.name.toLowerCase().includes(normalizedQuery)) {
        const menuUrl = menu.meta?.url || ''

        iframeActions.push({
          id: `iframe-${menu.id}`,
          label: menu.name,
          icon: <ExternalLink className="h-4 w-4 text-orange-500" />,
          description: menu.type === 'iframe' ? 'Iframe으로 열기' : '새창으로 열기',
          category: "외부 메뉴",
          type: menu.type === 'iframe' ? 'navigation' : 'dialog',
          href: menu.type === 'iframe' ? `/iframe/${menu.id}` : undefined,
          action: menu.type === 'link' ? () => {
            if (menuUrl) {
              window.open(menuUrl, '_blank', 'noopener,noreferrer')
            }
          } : undefined
        })
      }
    })

    return iframeActions
  }

  useEffect(() => {
    if (!isFocused) {
      setResult(null)
      return
    }

    // 학생이 선택된 상태면 열람 메뉴만 표시 (2단계)
    if (pendingStudent) {
      setResult({ actions: generateStudentDestinationActions(pendingStudent) })
      setSelectedIndex(-1)
      return
    }

    if (!debouncedQuery) {
      // Show basic actions + some quick actions when no query
      const quickActions = generateDynamicActions("")
      const iframeActions = generateIframeMenuActions("")
      setResult({ actions: [...allActions, ...quickActions, ...iframeActions] })
      return
    }

    const normalizedQuery = debouncedQuery.toLowerCase().trim()

    // Filter static actions
    const filteredStaticActions = allActions.filter((action) => {
      const searchableText = action.label.toLowerCase()
      return searchableText.includes(normalizedQuery)
    })

    // Generate dynamic actions based on query
    const dynamicActions = generateDynamicActions(normalizedQuery)

    // Generate iframe menu actions based on query
    const iframeActions = generateIframeMenuActions(normalizedQuery)

    // 학생 검색 결과 액션 (교사/관리자 전용)
    const studentActions = generateStudentActions()

    // Combine and deduplicate actions
    const combinedActions = [...filteredStaticActions, ...studentActions, ...dynamicActions, ...iframeActions]
    const uniqueActions = combinedActions.filter((action, index, self) =>
      index === self.findIndex(a => a.id === action.id)
    )

    setResult({ actions: uniqueActions })
    setSelectedIndex(-1) // 검색 결과가 변경되면 선택 인덱스 초기화
  }, [debouncedQuery, isFocused, teachers, sections, iframeMenus, studentResults, pendingStudent, rescueAllowed])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    // 검색어를 수정하면 학생 선택 상태 해제 (1단계로 복귀)
    setPendingStudent(null)
  }

  const handleActionClick = async (action: Action) => {
    // keepOpen 액션 (학생 선택/뒤로가기): 검색창을 닫지 않고 상태만 전환
    if (action.keepOpen) {
      try {
        await action.action?.()
      } catch (error) {
        console.error('Error executing action:', error)
      }
      return
    }

    // Execute action callback if present
    if (action.action) {
      try {
        await action.action()

        // 액션 실행 성공 시 검색창 초기화 (알림 전송 등)
        if (action.id === 'send-notification') {
          setIsFocused(false)
          setQuery("")
          setSelectedAction(null)
          setSelectedIndex(-1)
          setResult(null)
          setIsCommandMode(false)
          setManualModeToggle(false)
          if (inputRef.current) {
            inputRef.current.blur()
          }
          onClose?.()
          return
        }
      } catch (error) {
        console.error('Error executing action:', error)
      }
    }

    // Navigate with params if href is present
    if (action.href) {
      let targetUrl = action.href

      // Add query params if present
      if (action.params) {
        const searchParams = new URLSearchParams()
        Object.entries(action.params).forEach(([key, value]) => {
          searchParams.append(key, value)
        })
        targetUrl += `?${searchParams.toString()}`
      }

      navigate(targetUrl)
    }

    // 검색창 완전히 초기화
    setIsFocused(false)
    setQuery("")
    setSelectedAction(null)
    setSelectedIndex(-1)
    setResult(null)
    setPendingStudent(null)
    setStudentResults([])

    // 검색창에서 포커스 제거
    const searchInput = document.querySelector('input[placeholder*="명령어"]') as HTMLInputElement
    if (searchInput) {
      searchInput.blur()
    }
  }

  // 알림 전송 처리
  const handleNotificationCommand = async (query: string) => {
    // "알림 [사용자 이름] [메시지]" 형식 파싱
    const notificationMatch = query.match(/^알림\s+(.+?)\s+(.+)$/)

    if (!notificationMatch) {
      toast({
        title: "형식 오류",
        description: "올바른 형식: 알림 [사용자 이름] [메시지 내용]",
        variant: "destructive"
      })
      return false
    }

    const [, targetName, message] = notificationMatch

    try {
      // 1. resource에서 사용자 이름으로 조회
      const { data: resourceData, error: resourceError } = await supabase
        .from('resource')
        .select('id, name')
        .eq('type', 'teacher')
        .ilike('name', `%${targetName.trim()}%`)
        .limit(1)
        .single()

      if (resourceError || !resourceData) {
        toast({
          title: "사용자를 찾을 수 없습니다",
          description: `"${targetName}" 이름의 선생님을 찾을 수 없습니다.`,
          variant: "destructive"
        })
        return false
      }

      // 2. profiles에서 해당 이름의 user ID 조회
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('name', resourceData.name)
        .single()

      if (profileError || !profileData) {
        toast({
          title: "프로필을 찾을 수 없습니다",
          description: `${resourceData.name}의 프로필을 찾을 수 없습니다.`,
          variant: "destructive"
        })
        return false
      }

      // 3. 알림 생성
      // 알림 수신자는 profiles.id 가 아니라 resource.id 다
      // (notification_events.resource_id 가 resource 를 가리킨다).
      // 위 profiles 조회는 "계정이 있는 교사인가" 확인용으로만 남긴다.
      await createManualNotification.mutateAsync({
        title: "알림",
        message: message.trim(),
        targetResourceIds: [resourceData.id]
      })

      toast({
        title: "알림 전송 완료",
        description: `${resourceData.name}에게 알림을 전송했습니다.`
      })

      return true
    } catch (error) {
      console.error('알림 전송 오류:', error)
      toast({
        title: "전송 실패",
        description: "알림 전송 중 오류가 발생했습니다.",
        variant: "destructive"
      })
      return false
    }
  }

  // Enter/Submit 처리 로직 (키보드와 form submit 모두 사용)
  const handleSearch = async () => {
    if (selectedIndex >= 0 && result && selectedIndex < result.actions.length) {
      const selectedAction = result.actions[selectedIndex]
      handleActionClick(selectedAction)
      // keepOpen 액션(학생 선택 등)은 모달을 유지
      if (!selectedAction.keepOpen) {
        onClose?.()
      }
    } else {
      // 명령어 모드이고 정확히 일치하는 액션이 있으면 실행
      if (isCommandMode && query.trim()) {
        const matchingAction = getMatchingAction(query)
        if (matchingAction) {
          handleActionClick(matchingAction)
          // 모달 닫기
          onClose?.()
          return
        }
      }

      // 그 외의 경우 검색 실행
      if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`)
        // 검색창 초기화
        setIsFocused(false)
        setQuery("")
        setSelectedAction(null)
        setSelectedIndex(-1)
        setResult(null)
        setIsCommandMode(false)
        setManualModeToggle(false)
        // 검색창에서 포커스 제거
        if (inputRef.current) {
          inputRef.current.blur()
        }
        // 모달 닫기
        onClose?.()
      }
    }
  }

  // Form submit 핸들러 (모바일 키보드 지원)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab 키로 모드 전환
    if (e.key === 'Tab') {
      e.preventDefault()
      setManualModeToggle(true)
      setIsCommandMode(prev => !prev)
      return
    }

    if (!result || result.actions.length === 0) {
      if (e.key === 'Escape') {
        setIsFocused(false)
        setQuery("")
        setSelectedAction(null)
        setSelectedIndex(-1)
        setIsCommandMode(false)
        setManualModeToggle(false)
        setPendingStudent(null)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < result.actions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : result.actions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        handleSearch()
        break
      case 'Escape':
        // 학생 열람 메뉴 상태면 먼저 학생 검색으로 복귀, 아니면 닫기
        if (pendingStudent) {
          setPendingStudent(null)
          setSelectedIndex(-1)
          break
        }
        setIsFocused(false)
        setQuery("")
        setSelectedAction(null)
        setSelectedIndex(-1)
        setIsCommandMode(false)
        setManualModeToggle(false)
        break
    }
  }

  const container = {
    hidden: { opacity: 0, height: 0 },
    show: {
      opacity: 1,
      height: "auto",
      transition: {
        height: {
          duration: 0.4,
        },
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      height: 0,
      transition: {
        height: {
          duration: 0.3,
        },
        opacity: {
          duration: 0.2,
        },
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
      },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: {
        duration: 0.2,
      },
    },
  }

  // Reset selectedAction when focusing the input
  const handleFocus = () => {
    setSelectedAction(null)
    setSelectedIndex(-1)
    setIsFocused(true)

    // Calculate dropdown position relative to viewport
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap
        left: rect.left,
        width: rect.width
      })
    }
  }

  return (
    <>
      <div className="w-full max-w-xl mx-auto">
        <div className="relative flex flex-col justify-start items-center">
          <div ref={containerRef} className={`w-full relative bg-background z-[9999] ${compact ? 'max-w-full' : 'max-w-sm'}`}>
            {!compact && (
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block" htmlFor="search">
                명령어 검색
              </label>
            )}
            <form onSubmit={handleSubmit}>
              <div className="relative">
                <Input
                  ref={inputRef}
                  type="search"
                  enterKeyHint="search"
                  placeholder="명령어나 찾고 싶은 내용 검색 (Ctrl+K)"
                  value={query}
                  onChange={handleInputChange}
                  onFocus={handleFocus}
                  onBlur={() => setTimeout(() => {
                    setIsFocused(false)
                    setResult(null)
                  }, 150)}
                  onKeyDown={handleKeyDown}
                  className={`pl-3 pr-16 text-sm rounded-lg focus-visible:ring-offset-0 ${compact ? 'py-1.5 h-8' : 'py-1.5 h-9'}`}
                />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                <AnimatePresence mode="popLayout">
                  {query.length > 0 ? (
                    <motion.div
                      key={isCommandMode ? "command" : "search"}
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {isCommandMode ? "명령어" : "검색"}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="search-icon"
                      initial={{ y: -20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Portal을 통해 body에 드롭다운 렌더링 */}
      {isFocused && result && !selectedAction && typeof window !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] pointer-events-none">
            <AnimatePresence>
              <motion.div
                className="pointer-events-auto border rounded-md shadow-lg overflow-hidden dark:border-gray-800 bg-white dark:bg-black"
                style={{
                  position: 'absolute',
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                }}
                variants={container}
                initial="hidden"
                animate="show"
                exit="exit"
              >
              <div ref={scrollContainerRef} className="max-h-80 overflow-y-auto overflow-x-hidden overscroll-contain">
                <motion.ul>
                  {result.actions.map((action, index) => (
                    <motion.li
                      key={action.id}
                      className={`px-3 py-2 flex items-center justify-between cursor-pointer rounded-md ${
                        index === selectedIndex
                          ? 'bg-blue-100 dark:bg-blue-900/50'
                          : 'hover:bg-gray-200 dark:hover:bg-zinc-900'
                      }`}
                      variants={item}
                      layout
                      // mousedown 시 input blur를 막아 2단계 메뉴(keepOpen)에서도 드롭다운 유지
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleActionClick(action)}
                    >
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{action.icon}</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{action.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 text-right">{action.description}</span>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </div>
              <div className="mt-2 px-3 py-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>↑↓ 선택, Enter 실행, Tab 모드전환</span>
                  <span>ESC로 취소</span>
                </div>
              </div>
              </motion.div>
            </AnimatePresence>
          </div>,
          document.body
        )
      }
    </>
  )
}

export default ActionSearchBar