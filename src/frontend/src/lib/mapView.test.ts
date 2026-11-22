import { afterEach, describe, expect, it } from 'vitest';
import { clearMapView, loadMapView, saveMapView } from './mapView';

afterEach(() => clearMapView());

describe('map view memory', () => {
  it('has no view until the map has moved', () => {
    expect(loadMapView()).toBeNull();
  });

  it('returns the last saved view, rounded to 6 decimals', () => {
    saveMapView({ center: [53.06054321987, 18.44101234567], zoom: 17 });
    expect(loadMapView()).toEqual({ center: [53.060543, 18.441012], zoom: 17 });
  });

  it('reads the view back from sessionStorage after a reload', () => {
    window.sessionStorage.setItem('wodoplon-map-view', JSON.stringify({ center: [52.2, 21.0], zoom: 15 }));
    expect(loadMapView()).toEqual({ center: [52.2, 21.0], zoom: 15 });
  });

  it('ignores malformed stored values', () => {
    window.sessionStorage.setItem('wodoplon-map-view', '{"center":[999,0],"zoom":17}');
    expect(loadMapView()).toBeNull();
    window.sessionStorage.setItem('wodoplon-map-view', 'not json');
    expect(loadMapView()).toBeNull();
  });

  it('does not save an invalid view', () => {
    saveMapView({ center: [Number.NaN, 18], zoom: 17 });
    expect(loadMapView()).toBeNull();
  });
});
