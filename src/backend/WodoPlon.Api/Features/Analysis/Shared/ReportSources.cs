using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using static WodoPlon.Api.Features.Analysis.Shared.Recommendations;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Step 4: which data the report stands on and what it cannot see </summary>
public static class ReportSources
{
    /// <summary> Open-Meteo archive fills the last days with a delay </summary>
    public const int ArchiveLagDays = 5;

    public static string[] Sources(ParcelStaticProfile profile, DynamicObservation observation)
    {
        var sources = new List<string>
        {
            "ULDK GUGiK (granice działki ewidencyjnej)",
            Text($"Open-Meteo Archive API (dane meteorologiczne {observation.TargetDate.Year - DynamicObservation.HistoryYears}–{observation.TargetDate.Year})"),
            "FAO-56 (zapotrzebowanie uprawy na wodę ETc = ET0 × Kc)"
        };

        if (observation.SatelliteStatus != SatelliteStatus.NoData)
            sources.Add(observation.CloudCoverPct is { } cloud
                ? Text($"Sentinel-2 L2A Earth Search (zdjęcie z dnia {observation.SatelliteSceneDate:yyyy-MM-dd}, zachmurzenie {cloud.Value:0}%)")
                : Text($"Sentinel-2 L2A Earth Search (zdjęcie z dnia {observation.SatelliteSceneDate:yyyy-MM-dd})"));
        if (profile.SandPct is not null)
            sources.Add("ISRIC SoilGrids v2.0 (skład granulometryczny gleby, rozdzielczość 250 m)");
        if (profile.MeanSlopeDeg is not null)
            sources.Add("Geoportal NMT WCS (numeryczny model terenu)");
        sources.Add("OpenStreetMap / Overpass API (cieki, rowy i zbiorniki wodne)");

        return sources.ToArray();
    }

    public static string[] Limitations(ParcelStaticProfile profile, DynamicObservation observation)
    {
        var limitations = new List<string>();

        if (observation.SatelliteStatus == SatelliteStatus.NoData)
            limitations.Add("Brak bezchmurnego zdjęcia Sentinel-2 w oknie ±15 dni: ocenę wykonano na podstawie danych meteorologicznych i glebowych, bez korekty satelitarnej.");
        if (observation.SatelliteStatus == SatelliteStatus.CloudyFallback)
            limitations.Add("Zdjęcie Sentinel-2 było częściowo zachmurzone, wskaźniki NDVI i NDWI mogą być mniej dokładne.");

        limitations.Add(profile.SandPct is null
            ? Text($"Brak danych SoilGrids dla działki: przyjęto przeciętne parametry gleby średniej (retencja {SoilAwc.LoamAwcMmPerM:0} mm/m).")
            : "Dane glebowe SoilGrids mają rozdzielczość 250 m i mogą nie uwzględniać lokalnych zabiegów agrotechnicznych.");

        if (profile.MeanSlopeDeg is null)
            limitations.Add("Brak danych o ukształtowaniu terenu: nie oceniono ryzyka spływu powierzchniowego.");
        if (profile.NearestWaterType is null)
            limitations.Add(Text($"W promieniu {ParcelProfileService.HydroSearchRadiusM} m nie znaleziono cieków ani zbiorników wodnych (lub dane OpenStreetMap były niedostępne)."));

        var fetchedOn = DateOnly.FromDateTime(observation.FetchedAt.UtcDateTime);
        if (observation.TargetDate > fetchedOn.AddDays(-ArchiveLagDays))
            limitations.Add("Dane meteorologiczne z ostatnich dni przed datą analizy mogą być niepełne (opóźnienie archiwum Open-Meteo).");

        limitations.Add("Analiza nie uwzględnia aktualnego poziomu wód gruntowych w studniach lokalnych.");
        return limitations.ToArray();
    }
}
