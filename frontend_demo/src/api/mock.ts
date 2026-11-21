import type { Crop } from './types';

/** Fallback used when GET /api/crops is unavailable (identical to the contract example). */
export const FALLBACK_CROPS: Crop[] = [
  { id: 'winter_wheat', namePl: 'Pszenica ozima', criticalMonths: [5, 6] },
  { id: 'maize', namePl: 'Kukurydza', criticalMonths: [6, 7, 8] },
  { id: 'rapeseed', namePl: 'Rzepak ozimy', criticalMonths: [4, 5, 6] },
];

export const DEMO_INPUT = {
  dzialkaId: '040101_1.0001.123/4',
  cropId: 'winter_wheat',
  targetDate: '2026-06-15',
} as const;

export const DEMO_REPORT_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Exact response example from api_asp_net_core_python_fastapi.md, section 1.2 (raw wire format).
 * It goes through normalizeReport() like a real API response.
 */
export const DEMO_REPORT_RAW = {
  reportUuid: '550e8400-e29b-41d4-a716-446655440000',
  meta: {
    dzialkaId: '040101_1.0001.123/4',
    voivodeship: 'kujawsko-pomorskie',
    areaHa: 4.85,
    cropId: 'winter_wheat',
    cropNamePl: 'Pszenica ozima',
    targetDate: '2026-06-15',
    generatedAt: '2026-11-21T14:15:00Z',
    fromCache: false,
  },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [[[[18.001, 53.121], [18.005, 53.121], [18.005, 53.124], [18.001, 53.124], [18.001, 53.121]]]],
  },
  step1_WaterAssessment: {
    deficitLevel: 'HIGH',
    summaryPl:
      'Na analizowanej działce występuje wysokie ryzyko suszy rolniczej wynikające z deficytu opadów w ostatnich 30 dniach oraz niskiej retencji glebowej.',
    historicalRiskPl:
      'Największe ryzyko niedoboru wody na tej działce (w ujęciu 10-letnim) występuje w okresie od maja do lipca (deficyt w 7 z 10 ostatnich lat).',
    metrics: {
      precip30dMm: 18.4,
      precip90dMm: 82.0,
      precip10yrAvg90dMm: 145.5,
      et0_90dMm: 230.2,
      waterBalanceMm: -148.2,
      drySpellDays: 19,
      historicalDroughtYears: 7,
      ndviMean: 0.54,
      ndwiMean: -0.12,
    },
  },
  step2_CausesAndRetention: {
    identifiedCauses: [
      {
        code: 'LOW_SOIL_RETENTION',
        titlePl: 'Niska pojemność wodna gleby (gleba lekka)',
        descriptionPl:
          'Udział frakcji piaskowej wynosi 68%, a zawartość węgla organicznego jest niska (11.2 g/kg), przez co woda szybko przesiąka poza strefę korzeniową.',
      },
      {
        code: 'SURFACE_RUNOFF',
        titlePl: 'Ryzyko spływu powierzchniowego',
        descriptionPl:
          'Średnie nachylenie terenu wynosi 3.8°, co przy nawalnych opadach powoduje szybki odpływ wody z pola.',
      },
    ],
    landscapeRetentionRecommendations: [
      {
        actionPl: 'Spowolnienie odpływu w rowach melioracyjnych',
        justificationPl:
          'W odległości 85 m od granicy działki znajduje się rów melioracyjny. Zastosowanie zastawek piętrzących pozwoli podnieść poziom wód gruntowych.',
        priority: 'HIGH',
      },
      {
        actionPl: 'Zadrzewienia śródpolne i strefy buforowe',
        justificationPl: 'Ograniczą parowanie wywołane wiatrem oraz zatrzymają spływ powierzchniowy na stoku.',
        priority: 'MEDIUM',
      },
    ],
    soilAndAgroRecommendations: [
      {
        actionPl: 'Stosowanie międzyplonów (poplonów) oraz pozostawianie resztek pożniwnych',
        justificationPl:
          'Zwiększy zawartość próchnicy i poprawi zdolność gleby piaszczystej do magazynowania wody opadowej.',
        priority: 'HIGH',
      },
    ],
  },
  step3_Irrigation: {
    isRecommended: true,
    urgency: 'MODERATE',
    advicePl:
      'Nawadnianie jest uzasadnione interwencyjnie w najbliższych 5–7 dniach ze względu na krytyczną fazę nalewania ziarna pszenicy ozimej i ujemny bilans wodny (-148 mm). Zalecana dawka: 20–25 mm.',
    waterSourceNotePl:
      'Najbliższy ciek wodny znajduje się w odległości 85 m (wymagane sprawdzenie pozwoleń wodnoprawnych).',
  },
  step4_SourcesAndLimitations: {
    sources: [
      { name: 'ULDK GUGiK (Granice działek)', date: '2026-11-21', mode: 'CACHED' },
      { name: 'Geoportal NMT (Model terenu)', date: '2026-11-21', mode: 'CACHED' },
      { name: 'ISRIC SoilGrids (Gleba 0-30 cm)', date: '2026-11-21', mode: 'CACHED' },
      { name: 'Open-Meteo (Archiwum 10 lat)', date: '2026-06-15', mode: 'LIVE' },
      { name: 'Sentinel-2 L2A (Earth Search)', date: '2026-06-12', mode: 'LIVE' },
    ],
    limitationsPl: [
      'Dane glebowe SoilGrids mają rozdzielczość przestrzenną 250 m i mogą nie uwzględniać lokalnej zmienności w obrębie małej działki.',
      'Wskaźnik satelitarny NDVI pochodzi ze zdjęcia z dnia 2026-06-12 (3 dni przed wybraną datą analizy, zachmurzenie 4%).',
      'Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach piezometrycznych.',
    ],
  },
};
