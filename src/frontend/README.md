# WodoPlon — Frontend

Publiczna aplikacja webowa dla rolników (React 19 + TypeScript + Vite + Tailwind CSS + Leaflet).

## Funkcje
- Wskazanie działki przez identyfikator ewidencyjny (TERYT) lub kliknięcie punktu na mapie Polski.
- Warstwy mapowe bez płatnych kluczy: OpenStreetMap, Geoportal Ortofotomapa WMS, granice działek GUGiK KIEG WMS, warstwa suszy Copernicus EDO (`cdiad`).
- 4-etapowy raport zgodny z kolejnością KOWR (`Ocena sytuacji wodnej` → `Przyczyny i retencja` → `Nawadnianie` → `Źródła i ograniczenia`).
- Udostępnianie raportu przez link `/report/{reportUuid}` oraz wydruk / zapis do PDF (`@media print`).
- Ułatwienia dostępności: powiększenie tekstu (`A+`), tryb wysokiego kontrastu (WCAG AAA), przełącznik `PL / EN`.

## Uruchomienie lokalne (Dev)

```bash
npm install
npm run dev
```

Aplikacja działa na `http://localhost:5173` i przekierowuje zapytania `/api` do `http://localhost:5254` (można zmienić przez `VITE_API_PROXY_TARGET`).

## Budowanie produkcyjne

```bash
npm run build
```
