import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, fetchReport } from '../api/client';
import { SAMPLE_DEMO_REPORT } from '../api/mockData';
import type { AnalysisResponse } from '../types/api';
import type { Language, TranslationDict } from '../i18n/translations';
import { labelPoint } from '../lib/geo';
import { loadMapView, saveMapView } from '../lib/mapView';
import { ReportView } from '../components/ReportView';
import { LoadingState } from '../components/LoadingState';
import { ErrorBanner } from '../components/ErrorBanner';

interface ReportPageProps {
  t: TranslationDict;
  lang: Language;
}

interface ReportLocationState {
  report?: AnalysisResponse;
  isDemo?: boolean;
}

export function ReportPage({ t, lang }: ReportPageProps) {
  const { reportUuid } = useParams<{ reportUuid: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const navState = (location.state as ReportLocationState | null) ?? null;
  const isDemoRoute = reportUuid === 'demo-preview' || Boolean(navState?.isDemo);

  const [report, setReport] = useState<AnalysisResponse | null>(() => {
    if (navState?.report) return navState.report;
    if (reportUuid === 'demo-preview') return SAMPLE_DEMO_REPORT;
    return null;
  });
  const [loading, setLoading] = useState(!report);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportUuid || reportUuid === 'demo-preview') return;
    if (navState?.report && navState.report.reportUuid === reportUuid) {
      setReport(navState.report);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchReport(reportUuid, lang)
      .then((data) => {
        if (!active) return;
        setReport(data);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setError(t.errorReportNotFound);
        } else if (err instanceof ApiError && err.isNetwork) {
          setError(t.errorNetwork);
        } else if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(t.errorReportNotFound);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reportUuid, lang, navState?.report, t.errorNetwork, t.errorReportNotFound]);

  return (
    <main id="main-content">
      {loading && (
        <div className="px-4 py-12">
          <LoadingState t={t} />
        </div>
      )}

      {!loading && error && (
        <div className="mx-auto max-w-xl px-4 py-12">
          <ErrorBanner t={t} message={error} onRetry={() => navigate('/')} />
        </div>
      )}

      {!loading && report && (
        <ReportView
          t={t}
          lang={lang}
          report={report}
          isDemo={isDemoRoute}
          onBack={() => {
            // opened from a shared link: nothing remembered yet, so start the new check at this parcel
            if (!loadMapView() && report.parcelInfo?.polygonGeoJson) {
              try {
                saveMapView({ center: labelPoint(report.parcelInfo.polygonGeoJson), zoom: 17 });
              } catch {
                // malformed geometry: the home page falls back to its default view
              }
            }
            navigate('/');
          }}
        />
      )}
    </main>
  );
}
