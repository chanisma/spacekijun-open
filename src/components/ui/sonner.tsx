import { Toaster as Sonner } from "sonner"
import { createPortal } from "react-dom"

import { toastPaletteStyle } from "@/lib/toastPalette"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * 앱의 **유일한** 토스트 표시기. `App.tsx` 에 한 번만 마운트한다.
 *
 * 종전엔 이 컴포넌트와 Radix `<Toaster />`(`ui/toaster.tsx`)가 **둘 다** 마운트돼
 * 있어서, 같은 앱에서 토스트가 두 가지 모양으로 나왔다(Radix 쪽은 `p-6` 카드에
 * 아이콘이 없고 한 번에 하나만 떴다). Radix 쪽은 제거됐고 구 API 는
 * `@/hooks/use-toast` 어댑터를 통해 이리로 들어온다.
 *
 * 정해진 것들(새로 고민하지 말 것):
 * - **위치는 우측 하단**(2026-09-12 사용자 결정). 모바일 여백은 `index.css` 가
 *   하단 네비 5칸(`--mobile-nav-height`) 위로 올린다 — sonner 기본값은 `bottom: 20px`
 *   라 네비에 가린다.
 * - **닫기 버튼은 모든 토스트에 상시 표시**. 구 Radix 토스트의 닫기 버튼은
 *   `opacity-0 … group-hover:opacity-100` 이라 **hover 가 없는 휴대폰에서는 닫을
 *   수단이 아예 없었다**(이 앱은 휴대폰이 정상 경로다). sonner 1.5 의 닫기 버튼은
 *   hover 게이트가 없으므로 `closeButton` 만 켜면 되고, 터치 표적으로 쓰려면
 *   기본 20px 는 작아서 키운다.
 * - **테마는 라이트 고정.** 종전엔 `next-themes` 의 `useTheme()` 로 `theme="system"` 을
 *   넘기고 있었는데, 이 앱엔 ThemeProvider 가 없고 `dark` 클래스를 붙이는 코드도
 *   0곳이라(CLAUDE.md) 화면은 항상 밝다. 그런데 sonner 만 OS 의
 *   `prefers-color-scheme` 을 따라 **다크 모드 기기에서 토스트만 어둡게** 떴다.
 *   (`next-themes` 는 이 앱의 유일한 소비처였어서 의존성째 제거했다.)
 * - 색은 `richColors` + **인라인 팔레트**(`@/lib/toastPalette`). CSS 파일로 덮어쓰면
 *   sonner 가 런타임에 주입하는 `[data-sonner-toaster][data-theme=light]`(특이도 0-2-0)
 *   에 져서 **조용히 무시된다** — 자세한 경위는 그 파일 주석에.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  if (typeof document === "undefined") return null

  return createPortal(
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      richColors
      visibleToasts={3}
      className="toaster group"
      style={toastPaletteStyle() as React.CSSProperties}
      toastOptions={{
        classNames: {
          // pr-10 은 닫기 버튼 자리다 — 없으면 긴 문장이 버튼 밑으로 흘러 들어간다.
          toast:
            "group toast gap-3 rounded-xl border py-3 pl-4 pr-10 shadow-lg items-start",
          title: "text-sm font-semibold leading-snug",
          description: "text-xs leading-relaxed opacity-90",
          // sonner 기본값은 카드 **바깥** 좌측 상단에 걸친 20px 원이다. 이 앱의 모달은
          // 닫기 버튼을 카드 안 우측 상단에 두므로 거기에 맞추고, 터치 표적으로
          // 쓰도록 24px 로 키운다. 색은 sonner 가 tone 별로 칠해 준다.
          closeButton:
            "!h-6 !w-6 !left-auto !right-1.5 !top-1.5 !transform-none",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />,
    document.body
  )
}

export { Toaster }
