import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { translations, type Language } from './i18n/translations';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { ReportPage } from './pages/ReportPage';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode / blocked storage: the preference just isn't remembered
  }
}

export function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = window.localStorage.getItem('wodoplon-lang');
    return saved === 'en' ? 'en' : 'pl';
  });
  // "Kontrast" = dark theme with high contrast. Older versions stored 'wodoplon-contrast=high'.
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = readStorage('wodoplon-theme');
    return saved ? saved === 'dark' : readStorage('wodoplon-contrast') === 'high';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem('wodoplon-lang', lang);
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = darkMode ? 'dark' : 'light';
    // native controls (date picker, scrollbars) follow the theme
    root.style.colorScheme = darkMode ? 'dark' : 'light';
    writeStorage('wodoplon-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const t = translations[lang];

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header
          t={t}
          lang={lang}
          onChangeLang={setLang}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((v) => !v)}
        />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage t={t} lang={lang} />} />
            <Route path="/report/:reportUuid" element={<ReportPage t={t} lang={lang} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
