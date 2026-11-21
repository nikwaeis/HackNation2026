using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Step 1: crop water need by FAO-56 (ETc = ET0 × Kc), 90-day balance, drought history and risk level </summary>
public static class WaterBalance
{
    /// <summary> Past year counts as a drought year below this 90-day balance </summary>
    public const decimal DroughtYearBalanceMm = -100m;

    public const decimal CriticalBalanceMm = -180m;
    public const decimal HighBalanceMm = -110m;
    public const decimal HighSandyBalanceMm = -90m;
    public const decimal ModerateBalanceMm = -40m;
    public const int CriticalDrySpellDays = 21;
    public const int ModerateDroughtYears = 5;
    /// <summary> NDWI below this confirms water stress of the canopy </summary>
    public const decimal StressNdwi = -0.10m;
    public const decimal SevereStressNdwi = -0.15m;
    public const decimal SandyPct = SoilAwc.SandyThresholdPct;

    /// <summary> Kc of the mid stage in critical months, initial before them, late after them </summary>
    public static decimal Kc(Crop crop, int month) =>
        crop.IsCriticalMonth(month) ? crop.KcMid
        : month < crop.CriticalMonths.Min() ? crop.KcInitial
        : crop.KcLate;

    /// <summary> ETc over the given window months, mm </summary>
    public static decimal CropNeedMm(IEnumerable<WeatherMonth> months, Crop crop) =>
        Math.Round(months.Sum(m => m.Et0Mm * Kc(crop, m.Month)), 1);

    /// <summary> P − ETc over the given window months, mm; negative = deficit </summary>
    public static decimal BalanceMm(IEnumerable<WeatherMonth> months, Crop crop) =>
        Math.Round(months.Sum(m => m.PrecipMm - m.Et0Mm * Kc(crop, m.Month)), 1);

    /// <summary> Past years (of 10) whose same 90-day window had a balance below −100 mm </summary>
    public static int DroughtYears(IEnumerable<WeatherMonth> windowMonths, Crop crop) =>
        windowMonths
            .Where(m => m.YearsBack > 0)
            .GroupBy(m => m.YearsBack)
            .Count(year => BalanceMm(year, crop) < DroughtYearBalanceMm);

    // api.md leaves a gap: balance < −180 without long dry spell or NDWI stress fits no level, it is treated as HIGH
    public static WaterDeficitLevel Classify(decimal balanceMm, int drySpellDays, decimal? ndwi, decimal? sandPct,
        int droughtYears)
    {
        if (balanceMm < CriticalBalanceMm && (drySpellDays >= CriticalDrySpellDays || ndwi < SevereStressNdwi))
            return WaterDeficitLevel.Critical;
        if (balanceMm < HighBalanceMm || (balanceMm < HighSandyBalanceMm && sandPct > SandyPct))
            return WaterDeficitLevel.High;
        if (balanceMm < ModerateBalanceMm || droughtYears >= ModerateDroughtYears || ndwi < StressNdwi)
            return WaterDeficitLevel.Moderate;

        return WaterDeficitLevel.Low;
    }
}
