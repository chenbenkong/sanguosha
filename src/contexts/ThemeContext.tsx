import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const THEME_STORAGE_KEY = 'sgs-theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const readSavedTheme = (): Theme => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* 隐私模式下 localStorage 可能不可用，回退默认值 */
  }
  return 'dark';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readSavedTheme);

  useEffect(() => {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('theme-light', isLight);
    // color-scheme 让滚动条、原生控件跟随主题，而不是始终按浅色渲染
    document.documentElement.style.colorScheme = isLight ? 'light' : 'dark';
    document.body.style.backgroundColor = isLight ? '#faf8f5' : '#1a1512';
    document.body.style.color = isLight ? '#2d2a26' : '#e5e5e5';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* 忽略写入失败 */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
