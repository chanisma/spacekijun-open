import { useState, useEffect, useCallback } from 'react';

type ActivePanel = 'left' | 'center' | 'right';

const PANELS: ActivePanel[] = ['left', 'center', 'right'];
const FOCUS_CLASSES = ['ring-2', 'ring-primary'];

interface AppUIState {
    showKeyboardHelp: boolean;
    setShowKeyboardHelp: (show: boolean) => void;
    showPDFUpload: boolean;
    setShowPDFUpload: (show: boolean) => void;
    activePanel: ActivePanel;
    setActivePanel: (panel: ActivePanel) => void;
    cycleActivePanel: () => void;
}

export function useAppUI(): AppUIState {
    const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
    const [showPDFUpload, setShowPDFUpload] = useState(false);
    const [activePanel, setActivePanel] = useState<ActivePanel>('left');

    useEffect(() => {
        const panels = document.querySelectorAll('[data-panel]');
        panels.forEach(panel => {
            const panelName = panel.getAttribute('data-panel');
            const isActive = panelName === activePanel;
            panel.classList.toggle(FOCUS_CLASSES[0], isActive);
            panel.classList.toggle(FOCUS_CLASSES[1], isActive);
        });
    }, [activePanel]);

    const cycleActivePanel = useCallback(() => {
        setActivePanel(current => {
            const currentIndex = PANELS.indexOf(current);
            const nextIndex = (currentIndex + 1) % PANELS.length;
            return PANELS[nextIndex];
        });
    }, []);

    return {
        showKeyboardHelp,
        setShowKeyboardHelp,
        showPDFUpload,
        setShowPDFUpload,
        activePanel,
        setActivePanel,
        cycleActivePanel
    };
}
