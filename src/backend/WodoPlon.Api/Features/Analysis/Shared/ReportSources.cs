using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Step 4: which data the report stands on and what it cannot see </summary>
public static class ReportSources
{
    /// <summary> Open-Meteo archive fills the last days with a delay </summary>
    public const int ArchiveLagDays = 5;

    public static string[] Sources(ParcelStaticProfile profile, DynamicObservation observation, ReportText text)
    {
        var sources = new List<string>
        {
            text["Report.Source.Uldk"],
            text["Report.Source.OpenMeteo", observation.TargetDate.Year - DynamicObservation.HistoryYears, observation.TargetDate.Year],
            text["Report.Source.Fao"]
        };

        if (observation.SatelliteStatus is SatelliteStatus.Ok or SatelliteStatus.CloudyFallback)
            sources.Add(observation.CloudCoverPct is { } cloud
                ? text["Report.Source.SentinelWithCloud", observation.SatelliteSceneDate, cloud.Value]
                : text["Report.Source.Sentinel", observation.SatelliteSceneDate]);
        if (profile.SandPct is not null)
            sources.Add(text["Report.Source.SoilGrids"]);
        if (profile.MeanSlopeDeg is not null)
            sources.Add(text["Report.Source.Nmt"]);
        if (profile.WaterCheckedAt is not null)
            sources.Add(profile.WaterDataDate is { } waterDate
                ? text["Report.Source.OsmDated", waterDate]
                : text["Report.Source.Osm"]);

        return sources.ToArray();
    }

    public static string[] Limitations(ParcelStaticProfile profile, DynamicObservation observation, ReportText text)
    {
        var limitations = new List<string>();

        switch (observation.SatelliteStatus)
        {
            case SatelliteStatus.NoData:
                limitations.Add(text["Report.Limitation.SatelliteNoData"]);
                break;
            case SatelliteStatus.Error:
                limitations.Add(text["Report.Limitation.SatelliteError"]);
                break;
            case SatelliteStatus.CloudyFallback:
                limitations.Add(text["Report.Limitation.SatelliteCloudy"]);
                break;
        }

        limitations.Add(profile.SandPct is null
            ? text["Report.Limitation.SoilMissing", SoilAwc.LoamAwcMmPerM]
            : text["Report.Limitation.SoilResolution"]);

        if (profile.MeanSlopeDeg is null)
            limitations.Add(text["Report.Limitation.ReliefMissing"]);
        if (profile.WaterCheckedAt is null)
            limitations.Add(text["Report.Limitation.WaterPending"]);
        else if (profile.NearestWaterType is null)
            limitations.Add(text["Report.Limitation.WaterNone", WaterLookupService.HydroSearchRadiusM]);

        var fetchedOn = DateOnly.FromDateTime(observation.FetchedAt.UtcDateTime);
        if (observation.TargetDate > fetchedOn.AddDays(-ArchiveLagDays))
            limitations.Add(text["Report.Limitation.MeteoLag"]);

        limitations.Add(text["Report.Limitation.Groundwater"]);
        return limitations.ToArray();
    }
}
