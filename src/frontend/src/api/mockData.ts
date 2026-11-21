import type { AnalysisResponse, CropResponse } from '../types/api';

/** Matches CropSeeder.cs in backend so crop selection works even if backend is waking up */
export const FALLBACK_CROPS: CropResponse[] = [
  { id: 'winter_wheat', namePl: 'Pszenica ozima', kcMid: 1.15, criticalMonths: [5, 6], rootDepthCm: 120 },
  { id: 'maize', namePl: 'Kukurydza', kcMid: 1.2, criticalMonths: [6, 7, 8], rootDepthCm: 130 },
  { id: 'rapeseed', namePl: 'Rzepak ozimy', kcMid: 1.15, criticalMonths: [4, 5, 6], rootDepthCm: 110 },
  { id: 'sugar_beet', namePl: 'Burak cukrowy', kcMid: 1.2, criticalMonths: [6, 7, 8], rootDepthCm: 100 },
  { id: 'potato', namePl: 'Ziemniak', kcMid: 1.15, criticalMonths: [6, 7], rootDepthCm: 60 },
];

/** Verified real agricultural parcel ID (Zaręby Kościelne, mazowieckie) */
export const SAMPLE_PARCEL_ID = '141611_2.0018.103';

/** Realistic demo report matching docs/api.md §3.2 — ONLY shown when user clicks "Open sample report" */
export const SAMPLE_DEMO_REPORT: AnalysisResponse = {
  reportUuid: 'demo-preview',
  parcelInfo: {
    dzialkaId: SAMPLE_PARCEL_ID,
    voivodeship: 'kujawsko-pomorskie',
    areaHa: 14.52,
    cropId: 'winter_wheat',
    cropNamePl: 'Pszenica ozima',
    targetDate: '2026-06-15',
    polygonGeoJson: {
      type: 'Polygon',
      coordinates: [
        [
          [18.1125, 53.1445],
          [18.1182, 53.1448],
          [18.1179, 53.1412],
          [18.1121, 53.141],
          [18.1125, 53.1445],
        ],
      ],
    },
  },
  step1_diagnosis: {
    riskLevel: 'HIGH',
    summaryPl:
      'Wysokie ryzyko suszy rolniczej. Bilans wodny uprawy za ostatnie 90 dni wynosi -164.2 mm: opady 98.4 mm wobec potrzeb uprawy 262.6 mm (Pszenica ozima).',
    historicalContextPl:
      'W ciągu ostatnich 10 lat poważne niedobory wody (bilans poniżej -100 mm) wystąpiły w tym okresie w 6 sezonach.',
    metrics: {
      precip90dMm: 98.4,
      precip10yrAvg90dMm: 168.5,
      waterBalanceMm: -164.2,
      drySpellDays: 21,
      historicalDroughtYears: 6,
      ndviMean: 0.44,
      ndwiMean: -0.14,
      slopeDeg: 3.6,
      sandPct: 72.0,
      nearestWaterDistM: 120.0,
    },
  },
  step2_causesAndRetention: {
    causesPl: [
      'Niskie opady (98.4 mm wobec normy 168.5 mm) oraz 21 dni bez opadów.',
      'Gleba lekka, piaszczysta (72% piasku) o niskiej pojemności wodnej.',
      'Nachylenie terenu (3.6°) przyspiesza spływ powierzchniowy.',
      'Rów melioracyjny w odległości 120 m przyspiesza odpływ wód gruntowych z działki.',
    ],
    retentionRecommendationsPl: [
      {
        type: 'LANDSCAPE',
        title: 'Zastawki na rowie melioracyjnym (120 m od działki)',
        description:
          'Spowolnienie odpływu wody w pobliskim rowie podniesie poziom wód gruntowych w strefie korzeniowej.',
      },
      {
        type: 'LANDSCAPE',
        title: 'Uprawa poprzeczna do stoku i strefy buforowe',
        description:
          'Uprawa w poprzek stoku, pasy zadarnione oraz małe zbiorniki u podnóża stoku zatrzymają wodę z ulewnych opadów.',
      },
      {
        type: 'SOIL',
        title: 'Międzyplony i pozostawienie resztek pożniwnych',
        description:
          'Zwiększy zawartość próchnicy w glebie, poprawi magazynowanie wody i ograniczy parowanie z powierzchni pola.',
      },
    ],
  },
  step3_irrigation: {
    isRecommended: true,
    doseMm: 25,
    advicePl:
      'Nawadnianie interwencyjne uzasadnione w krytycznym okresie wzrostu: jednorazowa dawka 25 mm (250 m³/ha), podawana rano lub wieczorem, wyłącznie po wdrożeniu zabiegów ograniczających parowanie.',
  },
  step4_sourcesAndLimitations: {
    sources: [
      'ULDK GUGiK (granice działki ewidencyjnej)',
      'Open-Meteo Archive API (dane meteorologiczne za 10 lat)',
      'Sentinel-2 L2A Earth Search (zdjęcie z dnia 2026-06-12, zachmurzenie 6%)',
      'ISRIC SoilGrids v2.0 (skład granulometryczny gleby, rozdzielczość 250 m)',
      'Geoportal NMT WCS (numeryczny model terenu)',
      'OpenStreetMap / Hydroportal (cieki i rowy melioracyjne)',
    ],
    limitationsPl: [
      'Dane glebowe SoilGrids mają rozdzielczość 250 m i mogą nie uwzględniać lokalnych zabiegów agrotechnicznych.',
      'Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach lokalnych ani wcześniejszego nawadniania.',
    ],
    satelliteStatus: 'OK',
  },
};
