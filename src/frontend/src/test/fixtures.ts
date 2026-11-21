/**
 * Response formats captured from the live services during this review (2026-11-21), trimmed to essentials.
 */

/** ULDK GetParcelByXY / GetParcelById body: status line + "id|voivodeship|SRID=4326;WKT" */
export function uldkBody(id: string, voivodeship: string, wkt: string): string {
  return `0\n${id}|${voivodeship}|SRID=4326;${wkt}\n`;
}

export const ULDK_NOT_FOUND = '-1 brak wyników\n';

/** ~0.08 ha house plot in Lubowidz (143703_4.0001.387), simplified to a rectangle in its real extent */
export const HOUSE_PLOT = {
  id: '143703_4.0001.387',
  voivodeship: 'mazowieckie',
  click: { lat: 53.11922, lon: 19.84957 },
  wkt: 'POLYGON((19.8493411 53.1190259,19.8498077 53.1190259,19.8498077 53.1194199,19.8493411 53.1194199,19.8493411 53.1190259))',
};

/** Arable field near Kruszwica (040706_5.0016.16/10), simplified */
export const FIELD = {
  id: '040706_5.0016.16/10',
  voivodeship: 'kujawsko-pomorskie',
  click: { lat: 52.718, lon: 18.345 },
  wkt: 'POLYGON((18.3400 52.7150,18.3500 52.7150,18.3500 52.7210,18.3400 52.7210,18.3400 52.7150))',
};

/** KIEG WMS GetFeatureInfo (text/xml), as returned by integracja.gugik.gov.pl */
export function kiegXml(attrs: { kontur?: string; uzytek?: string; id?: string }): string {
  const a = (name: string, value: string) => `<Attribute Name="${name}">${value}</Attribute>`;
  return `<?xml version="1.0"?>
<FeatureCollection xmlns="http://www.intergraph.com/geomedia/gml" xmlns:gml="http://www.opengis.net/gml">
<gml:featureMember><Layer Name="integracja">
${a('Identyfikator działki', attrs.id ?? '143703_4.0001.387')}
${a('Województwo', 'mazowieckie')}
${a('Pole pow. w ewidencji gruntów (ha)', '0.0804')}
${a('Grupa rejestrowa', '7')}
${a('Oznaczenie użytku', attrs.uzytek ?? '')}
${a('Oznaczenie konturu', attrs.kontur ?? '')}
${a('Data publikacji danych', '2026-11-21')}
</Layer></gml:featureMember></FeatureCollection>`;
}

/** Fetch mock routing by URL substring; records every call */
export type Route = [
  match: (url: string, init?: RequestInit) => boolean,
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
];

export function routedFetch(routes: Route[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    for (const [match, respond] of routes) {
      if (match(url, init)) return respond(url, init);
    }
    return new Response(`unmocked ${url}`, { status: 599 });
  };
  return { fn, calls };
}

/** A fetch that only settles when aborted (simulates a hanging service) */
export function hangingResponse(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
}
