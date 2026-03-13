import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`
        w-10 h-10 rounded-full border-2 hover:scale-110 transition-all 
        flex items-center justify-center shadow-lg
        ${theme === 'dark'
          ? 'bg-gradient-to-b from-[#2a2018] to-[#1a1410] border-[#d4af37]/50 hover:border-[#d4af37]'
          : 'bg-white border-[#e8e3de] hover:border-[#c9a86c] shadow-md'
        }
        ${className}
      `}
      title={theme === 'dark' ? '切换到白天模式' : '切换到黑夜模式'}
    >
      <span className="text-lg">{theme === 'dark' ? '🌙' : '☀️'}</span>
    </button>
  );
};
