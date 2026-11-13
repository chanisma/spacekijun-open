// ========================================
// Department Select Component
// Reusable component for department selection with custom input support
// ========================================

import React, { useState, useEffect, useRef } from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PickerContent,
  PickerRoot,
  PickerTrigger,
} from '@/components/ui/responsive-picker';
import { useIsMobileModal } from '@/hooks/useIsMobileModal';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  useDepartments,
  DepartmentSource,
  DEFAULT_DEPARTMENTS,
  SIMPLE_DEPARTMENTS,
} from '@/hooks/useDepartments';

// ----------------------------------------
// Types
// ----------------------------------------

export interface DepartmentSelectProps {
  /** Current selected value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Label for the field */
  label?: string;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Whether to show the Building2 icon */
  showIcon?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Placeholder for custom input */
  customInputPlaceholder?: string;
  /** Whether to allow custom input */
  allowCustom?: boolean;
  /** Whether to use searchable combobox mode */
  useCombobox?: boolean;
  /** Data source for departments */
  source?: DepartmentSource;
  /** Category filter (school, simple, custom, all) */
  category?: 'school' | 'simple' | 'custom' | 'all';
  /** Use simple department list (교무, 행정, etc.) */
  useSimpleList?: boolean;
  /** Additional departments to include */
  additionalDepartments?: string[];
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback when selection changes (for side effects) */
  onSelectionChange?: (value: string) => void;
}

// ----------------------------------------
// Component
// ----------------------------------------

export function DepartmentSelect({
  value,
  onChange,
  label = '주관 부서',
  showLabel = true,
  showIcon = true,
  placeholder = '부서를 선택하세요',
  customInputPlaceholder = '또는 새 부서명을 직접 입력하세요',
  allowCustom = false,
  useCombobox = false,
  source = 'database',
  category = 'school',
  useSimpleList = false,
  additionalDepartments = [],
  disabled = false,
  className,
  onSelectionChange,
}: DepartmentSelectProps) {
  // Internal state for custom input mode
  const [isUsingCustomInput, setIsUsingCustomInput] = useState(false);
  const [customDepartmentInput, setCustomDepartmentInput] = useState('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  // 휴대폰: 팝오버 대신 아래에서 올라오는 시트(`responsive-picker`).
  const isMobilePicker = useIsMobileModal();
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch departments based on source
  const { departments: dynamicDepartments, isLoading } = useDepartments({
    source: useSimpleList ? 'database' : source,
    category: useSimpleList ? 'simple' : category,
    additionalDepartments,
    enabled: true,
  });

  // Use dynamic list from database (maintains display_order)
  const departments = dynamicDepartments;

  // 직접 입력을 허용하지 않으면 목록에 없는 저장값도 선택 항목으로 표시한다.
  // 부서 목록 로딩 중이거나 기존 부서가 삭제된 경우에도 초기값을 유지한다.
  const selectDepartments =
    !allowCustom && value && value !== 'none' && !departments.includes(value)
      ? [...departments, value]
      : departments;

  // Synchronize custom input only when the input is available and the list is loaded.
  useEffect(() => {
    if (!allowCustom) {
      setIsUsingCustomInput(false);
      setCustomDepartmentInput('');
      return;
    }
    if (isLoading) return;
    if (value && value !== 'none' && !departments.includes(value)) {
      setIsUsingCustomInput(true);
      setCustomDepartmentInput(value);
    } else {
      setIsUsingCustomInput(false);
      setCustomDepartmentInput('');
    }
  }, [value, departments, isLoading, allowCustom]);

  // Handle select change
  const handleSelectChange = (newValue: string) => {
    setIsUsingCustomInput(false);
    setCustomDepartmentInput('');
    onChange(newValue);
    onSelectionChange?.(newValue);
  };

  // Handle combobox select
  const handleComboboxSelect = (selectedValue: string) => {
    if (selectedValue === value) {
      onChange('');
    } else {
      onChange(selectedValue);
    }
    setComboboxOpen(false);
    setIsUsingCustomInput(false);
    setCustomDepartmentInput('');
    onSelectionChange?.(selectedValue);
  };

  // Handle custom input change
  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setCustomDepartmentInput(inputValue);
    setIsUsingCustomInput(true);
    onChange(inputValue);
  };

  // Render label
  const renderLabel = () => {
    if (!showLabel) return null;

    return (
      <Label className="text-sm font-medium flex items-center">
        {showIcon && <Building2 className="mr-2 h-4 w-4" />}
        {label}
      </Label>
    );
  };

  // Combobox mode
  if (useCombobox) {
    return (
      <div className={cn('space-y-2', className)}>
        {renderLabel()}
        <PickerRoot open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PickerTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              disabled={disabled}
              className="w-full justify-between bg-white border-gray-300 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200 h-12"
            >
              <span className={value && value !== 'none' ? 'text-gray-900' : 'text-gray-500'}>
                {value && value !== 'none' ? value : placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PickerTrigger>
          <PickerContent title={label || '부서 선택'} className="w-full p-0" align="start">
            <Command>
              <CommandInput
                ref={inputRef}
                placeholder="부서 검색..."
                /* 시트에서는 자동 포커스하지 않는다 — 키보드가 목록을 덮는다 */
                autoFocus={!isMobilePicker}
              />
              <CommandList>
                <CommandEmpty>검색된 부서가 없습니다.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="none"
                    onSelect={() => handleComboboxSelect('none')}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === 'none' ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span>선택 안함</span>
                  </CommandItem>
                  {departments.map((dept) => (
                    <CommandItem
                      key={dept}
                      value={dept}
                      onSelect={() => handleComboboxSelect(dept)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === dept ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span>{dept}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PickerContent>
        </PickerRoot>

        {/* Custom input for combobox mode */}
        {allowCustom && (
          <Input
            placeholder={customInputPlaceholder}
            value={isUsingCustomInput ? customDepartmentInput : ''}
            onChange={handleCustomInputChange}
            disabled={disabled}
            className="text-sm"
          />
        )}
      </div>
    );
  }

  // Standard Select mode
  return (
    <div className={cn('space-y-2', className)}>
      {renderLabel()}
      <Select
        value={allowCustom && isUsingCustomInput ? '' : value}
        onValueChange={handleSelectChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">선택 안함</SelectItem>
          {selectDepartments.map((dept) => (
            <SelectItem key={dept} value={dept}>
              {dept}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Custom input */}
      {allowCustom && (
        <Input
          placeholder={customInputPlaceholder}
          value={isUsingCustomInput ? customDepartmentInput : (value === 'none' ? '' : '')}
          onChange={handleCustomInputChange}
          disabled={disabled}
          className="text-sm"
        />
      )}
    </div>
  );
}

// ----------------------------------------
// Simplified Variants
// ----------------------------------------

/**
 * Simple department select using simple category list (교무, 행정, etc.)
 * Used for document categorization
 */
export function SimpleDepartmentSelect(
  props: Omit<DepartmentSelectProps, 'useSimpleList' | 'source' | 'category'>
) {
  return (
    <DepartmentSelect
      {...props}
      source="database"
      category="simple"
      useSimpleList={true}
      allowCustom={false}
    />
  );
}

/**
 * Document department select with school departments from DB
 * Respects display_order set in admin panel
 */
export function DocumentDepartmentSelect(
  props: Omit<DepartmentSelectProps, 'source' | 'category'>
) {
  return <DepartmentSelect {...props} source="database" category="school" />;
}

/**
 * Task/Event department select with school departments from DB
 * Respects display_order set in admin panel
 */
export function TaskDepartmentSelect(
  props: Omit<DepartmentSelectProps, 'source' | 'category'>
) {
  return <DepartmentSelect {...props} source="database" category="school" />;
}

/**
 * Searchable department select with combobox
 * Uses school departments from DB
 */
export function SearchableDepartmentSelect(
  props: Omit<DepartmentSelectProps, 'useCombobox'>
) {
  return <DepartmentSelect {...props} useCombobox={true} source="database" category="school" />;
}
