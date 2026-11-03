import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './src/contexts/ThemeContext';

// 顶层错误兜底：渲染期异常时给出可恢复的提示，避免白屏
// 说明：项目未安装 @types/react，React 在类型层面是 any，因此这里用 any 断言实现类组件
const AppErrorBoundary: any = class extends (React.Component as any) {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[AppErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 24, background: '#1a1410', color: '#e8cf94',
          fontFamily: 'system-ui, "Microsoft YaHei", sans-serif', textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 28, letterSpacing: '0.2em', margin: 0 }}>对局异常中断</h1>
          <p style={{ color: '#b8a78e', fontSize: 14, margin: 0 }}>
            页面遇到未处理的错误。可以重新载入继续；若仍无法进入，清除本地存档后重开。
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #c8a45c', background: '#8d1f1a', color: '#f3d9a4', cursor: 'pointer' }}
            >
              重新载入
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem('sgs-save-v1'); } catch { /* ignore */ }
                window.location.reload();
              }}
              style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #8b7355', background: 'transparent', color: '#d9c49a', cursor: 'pointer' }}
            >
              清除存档并重开
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
