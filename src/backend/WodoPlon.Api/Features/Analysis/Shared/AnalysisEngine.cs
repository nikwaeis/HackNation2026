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
    decimal? NearestWaterDistM
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

/// <summary> Deterministic decision engine over cached parcel data; no I/O </summary>
public static class AnalysisEngine
{
    public static Assessment Assess(ParcelStaticProfile profile, DynamicObservation observation, Crop crop)
    {
        var currentWindow = observation.WindowMonths.Where(m => m.YearsBack == 0).ToArray();
        decimal balance = WaterBalance.BalanceMm(currentWindow, crop);
        decimal cropNeed = WaterBalance.CropNeedMm(currentWindow, crop);
        int droughtYears = WaterBalance.DroughtYears(observation.WindowMonths, crop);
        int drySpell = observation.DrySpellDays ?? 0;
        decimal precip = observation.Precip90dMm ?? 0;

        var level = WaterBalance.Classify(balance, drySpell, observation.NdwiMean, profile.SandPct?.Value, droughtYears);
        var (causes, retention) = Retention(profile, observation);

        return new Assessment(
            level,
            Text($"{LevelPl(level)}. Bilans wodny uprawy za ostatnie 90 dni wynosi {balance:+0.0;-0.0;0.0} mm: opady {precip:0.0} mm wobec potrzeb uprawy {cropNeed:0.0} mm ({crop.NamePl})."),
            HistoryPl(droughtYears),
            new DiagnosisMetrics(precip, observation.Precip10yrAvg90dMm, balance, drySpell, droughtYears,
                observation.NdviMean, observation.NdwiMean, profile.MeanSlopeDeg, profile.SandPct?.Value,
                profile.NearestWaterDistM),
            causes,
            retention,
            Irrigation(level, crop, observation.TargetDate, observation.NdwiMean, profile.AwcMmPerM),
            ReportSources.Sources(profile, observation),
            ReportSources.Limitations(profile, observation),
            observation.SatelliteStatus);
    }

    private static string LevelPl(WaterDeficitLevel level) => level switch
    {
        WaterDeficitLevel.Critical => "Krytyczne ryzyko suszy rolniczej",
        WaterDeficitLevel.High => "Wysokie ryzyko suszy rolniczej",
        WaterDeficitLevel.Moderate => "Umiarkowane ryzyko suszy rolniczej",
        _ => "Niskie ryzyko suszy rolniczej"
    };

    private static string HistoryPl(int droughtYears) => droughtYears switch
    {
        0 => "W ciągu ostatnich 10 lat w tym okresie nie występowały poważne niedobory wody (bilans poniżej −100 mm).",
        1 => "W ciągu ostatnich 10 lat poważny niedobór wody (bilans poniżej −100 mm) wystąpił w tym okresie w 1 sezonie.",
        _ => $"W ciągu ostatnich 10 lat poważne niedobory wody (bilans poniżej −100 mm) wystąpiły w tym okresie w {droughtYears} sezonach."
    };
}
