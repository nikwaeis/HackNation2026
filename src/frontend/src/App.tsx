import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { translations, type Language } from './i18n/translations';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { ReportPage } from './pages/ReportPage';

export function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = window.localStorage.getItem('wodoplon-lang');
    return saved === 'en' ? 'en' : 'pl';
  });
  const [largeText, setLargeText] = useState<boolean>(
    () => window.localStorage.getItem('wodoplon-text-scale') === 'large',
  );
  const [highContrast, setHighContrast] = useState<boolean>(
    () => window.localStorage.getItem('wodoplon-contrast') === 'high',
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem('wodoplon-lang', lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.textScale = largeText ? 'large' : 'normal';
    window.localStorage.setItem('wodoplon-text-scale', largeText ? 'large' : 'normal');
  }, [largeText]);

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
    window.localStorage.setItem('wodoplon-contrast', highContrast ? 'high' : 'normal');
  }, [highContrast]);

  const t = translations[lang];

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header
          t={t}
          lang={lang}
          onChangeLang={setLang}
          largeText={largeText}
          onToggleLargeText={() => setLargeText((v) => !v)}
          highContrast={highContrast}
          onToggleHighContrast={() => setHighContrast((v) => !v)}
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
