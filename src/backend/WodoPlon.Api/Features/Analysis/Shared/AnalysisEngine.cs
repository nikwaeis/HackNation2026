using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using static WodoPlon.Api.Features.Analysis.Shared.Recommendations;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Numbers behind the diagnosis, as shown in step1_diagnosis.metrics </summary>
public sealed record DiagnosisMetrics
(
    decimal Precip90dMm,
    decimal? Precip10yrAvg90dMm,
    decimal WaterBalanceMm,
    int DrySpellDays,
    int HistoricalDroughtYears,
    decimal? NdviMean,
    decimal? NdwiMean,
    decimal? SlopeDeg,
    decimal? SandPct,
    decimal? NearestWaterDistM,
    /// <summary> Median 90-day balance of the 10 past years, the norm the risk level is measured against </summary>
    decimal? WaterBalance10yrMedianMm
);

/// <summary> Full KOWR assessment in the mandatory order: diagnosis → causes and retention → irrigation → sources </summary>
public sealed record Assessment
(
    WaterDeficitLevel RiskLevel,
    string SummaryPl,
    string HistoricalContextPl,
    DiagnosisMetrics Metrics,
    string[] CausesPl,
    RetentionMeasure[] Retention,
    IrrigationAdvice Irrigation,
    string[] Sources,
    string[] LimitationsPl,
    SatelliteStatus SatelliteStatus
);

/// <summary> Deterministic decision engine over cached parcel data; no I/O. Texts in the language of <paramref name="text"/> </summary>
public static class AnalysisEngine
{
    public static Assessment Assess(ParcelStaticProfile profile, DynamicObservation observation, Crop crop, ReportText text)
    {
        var currentWindow = observation.WindowMonths.Where(m => m.YearsBack == 0).ToArray();
        decimal balance = WaterBalance.BalanceMm(currentWindow, crop);
        decimal cropNeed = WaterBalance.CropNeedMm(currentWindow, crop);
        decimal? median = WaterBalance.MedianBalanceMm(observation.WindowMonths, crop);
        int droughtYears = WaterBalance.DroughtYears(observation.WindowMonths, crop);
        int drySpell = observation.DrySpellDays ?? 0;
        decimal precip = observation.Precip90dMm ?? 0;

        var level = WaterBalance.ForSeason(
            WaterBalance.Classify(balance, median, drySpell, observation.NdwiMean, profile.SandPct?.Value, droughtYears),
            observation.TargetDate.Month);
        var (causes, retention) = Retention(profile, observation, text);
        string levelText = text[$"Report.Level.{level}"];

        return new Assessment(
            level,
            median is null
                ? text["Report.Summary", levelText, balance, precip, cropNeed, text.CropName(crop)]
                : text["Report.SummaryWithNorm", levelText, balance, precip, cropNeed, text.CropName(crop), median],
            droughtYears switch
            {
                0 => text["Report.History.None"],
                1 => text["Report.History.One"],
                _ => text["Report.History.Many", droughtYears]
            },
            new DiagnosisMetrics(precip, observation.Precip10yrAvg90dMm, balance, drySpell, droughtYears,
                observation.NdviMean, observation.NdwiMean, profile.MeanSlopeDeg, profile.SandPct?.Value,
                profile.NearestWaterDistM, median),
            causes,
            retention,
            Irrigation(level, crop, observation.TargetDate, observation.NdwiMean, profile.AwcMmPerM, text),
            ReportSources.Sources(profile, observation, text),
            ReportSources.Limitations(profile, observation, text),
            observation.SatelliteStatus);
    }
}
