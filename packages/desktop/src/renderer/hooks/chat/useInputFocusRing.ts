import { useThemeContext } from '@/renderer/hooks/context/ThemeContext';

export const useInputFocusRing = () => {
  const { theme } = useThemeContext();
  const isDarkTheme = theme === 'dark';

  return {
    // Built-in Ember / Dusk define the --wm-input-* tokens; other themes keep the legacy values.
    activeBorderColor: `var(--wm-input-border-focus, ${isDarkTheme ? '#4D4B87' : '#E1E0FF'})`,
    inactiveBorderColor: `var(--wm-input-border, ${isDarkTheme ? '#3a3a4a' : '#c9cacf'})`,
    activeShadow: `var(--wm-input-focus-shadow, ${
      isDarkTheme ? '0px 2px 20px rgba(77, 75, 135, 0.45)' : '0px 2px 20px rgba(225, 224, 255, 0.6)'
    })`,
  };
};
