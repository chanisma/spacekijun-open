import React from 'react';
import { PluginComponentProps } from '@/types/plugin';
import { PollPlugin } from './PollPlugin';
import { StudentDisplayPlugin } from './StudentDisplayPlugin';
import { RandomPickerPlugin } from './RandomPickerPlugin';
import { ChecklistPlugin } from './ChecklistPlugin';
import { TablePlugin } from './TablePlugin';
import { CsvViewerPlugin } from './CsvViewerPlugin';

// 플러그인 타입별 컴포넌트 매핑
const pluginComponents: Record<string, React.FC<PluginComponentProps>> = {
  poll: PollPlugin,
  student_display: StudentDisplayPlugin,
  random_picker: RandomPickerPlugin,
  checklist: ChecklistPlugin,
  table: TablePlugin,
  csv_viewer: CsvViewerPlugin,
};

interface PluginRendererProps extends PluginComponentProps {
  pluginType: string;
}

export const PluginRenderer: React.FC<PluginRendererProps> = ({
  pluginType,
  ...props
}) => {
  const PluginComponent = pluginComponents[pluginType];

  if (!PluginComponent) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        알 수 없는 플러그인 타입: {pluginType}
      </div>
    );
  }

  return <PluginComponent {...props} />;
};