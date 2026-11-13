import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  PickerContent,
  PickerRoot,
  PickerTrigger,
} from "@/components/ui/responsive-picker";
import { useIsMobileModal } from "@/hooks/useIsMobileModal";
import {
  useResourceSelect,
  filterItems,
  type SelectItem,
} from "@/hooks/useResourceSelect";

// 기존 인터페이스 호환성을 위해 re-export
export type SearchableSelectItem = SelectItem;

interface SearchableSelectProps {
  items?: SearchableSelectItem[];
  selectedValue?: string;
  onValueChange: (value: string | undefined) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  filterByTeacher?: boolean; // teacher 타입 리소스만 필터링
  includeAllOption?: boolean; // "전체" 옵션 포함 여부
  allOptionLabel?: string; // "전체" 옵션의 라벨
  allOptionValue?: string; // "전체" 옵션의 값
  onOpenChange?: (open: boolean) => void; // 드롭다운 열림/닫힘 콜백
  /**
   * 포털 대상을 직접 지정한다. **Dialog 안에서는 넘기지 말 것** — 지정하지 않으면
   * `usePortalContainer`가 DialogContent로 자동 포털한다. `document.body`를 주면
   * 드롭다운이 열리기만 하고 클릭이 먹지 않는다(dialog.tsx 주석 참고).
   * 잘림이 문제라면 컨테이너를 바꾸지 말고 DialogContent 쪽 overflow를 조정한다.
   */
  container?: HTMLElement | null;
  /** 휴대폰 선택 시트의 머리글 (2026-09-20). 생략하면 `placeholder`. */
  pickerTitle?: string;
}

export function SearchableSelect({
  items,
  selectedValue,
  onValueChange,
  placeholder = "선택하세요...",
  searchPlaceholder = "검색...",
  emptyText = "검색 결과가 없습니다.",
  className,
  disabled = false,
  filterByTeacher = false,
  includeAllOption = false,
  allOptionLabel = "전체",
  allOptionValue = "ALL",
  onOpenChange,
  container,
  pickerTitle,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchValue, setSearchValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  // 휴대폰: 팝오버 대신 아래에서 올라오는 시트(`responsive-picker`).
  const isMobilePicker = useIsMobileModal();

  // 내부 상태 변경 시 외부 콜백 호출
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  // 리소스 데이터 훅 사용
  const { items: resourceItems, isLoading } = useResourceSelect({
    resourceType: filterByTeacher ? ["teacher", "staff"] : undefined,
    enabled: filterByTeacher,
  });

  // 사용할 아이템 목록 결정 (리소스 훅 사용 시 name을 value로 변환)
  const activeItems = React.useMemo(() => {
    if (filterByTeacher) {
      // 기존 호환성: value로 name 사용
      return resourceItems.map(item => ({
        ...item,
        value: item.label, // name을 value로 사용
      }));
    }
    return items || [];
  }, [filterByTeacher, resourceItems, items]);

  // 선택된 아이템
  const selectedItem = activeItems.find(item => item.value === selectedValue);

  // 검색 필터링된 아이템들 (초성 검색 포함)
  const filteredItems = React.useMemo(() => {
    return filterItems(activeItems, searchValue);
  }, [activeItems, searchValue]);

  // 아이템 선택
  const selectItem = (value: string) => {
    if (selectedValue === value) {
      // 이미 선택된 아이템을 다시 클릭하면 선택 해제
      onValueChange(undefined);
    } else {
      onValueChange(value);
    }
    handleOpenChange(false);
  };

  // 검색값 변경 처리
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
  };

  // 선택된 아이템 표시 텍스트
  const getDisplayText = () => {
    if (!selectedItem) {
      return placeholder;
    }
    return selectedItem.label;
  };

  // 열릴 때 검색 입력창에 포커스 — 단, 휴대폰 시트에서는 하지 않는다.
  // 키보드가 즉시 올라오면 목록이 두세 줄로 줄어 고를 수가 없다.
  React.useEffect(() => {
    if (open && !isMobilePicker && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, isMobilePicker]);

  // 로딩 상태 처리
  if (filterByTeacher && isLoading) {
    return (
      <div className={cn("relative", className)}>
        <Button
          variant="outline"
          className="w-full justify-between text-left font-normal"
          disabled
        >
          <span className="truncate">로딩 중...</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <PickerRoot open={open} onOpenChange={handleOpenChange}>
        <PickerTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-left font-normal"
            disabled={disabled || (filterByTeacher && isLoading)}
          >
            <span className="truncate">{getDisplayText()}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PickerTrigger>
        <PickerContent
          title={pickerTitle ?? (placeholder === "선택하세요..." ? "선택" : placeholder)}
          className="w-full p-0"
          align="start"
          container={container}
        >
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder={searchPlaceholder}
              value={searchValue}
              onValueChange={handleSearchChange}
              className="h-9"
            />
            <CommandList className="max-h-[200px] overflow-auto touch-pan-y">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {filteredItems.map((item) => {
                  const isSelected = selectedValue === item.value;
                  return (
                    <CommandItem
                      key={item.value}
                      value={item.label}
                      onSelect={() => selectItem(item.value)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{item.label}</span>
                        {item.description && (
                          <span className="text-sm text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PickerContent>
      </PickerRoot>
    </div>
  );
}