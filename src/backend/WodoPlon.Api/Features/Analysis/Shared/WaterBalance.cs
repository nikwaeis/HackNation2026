using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Step 1: crop water need by FAO-56 (ETc = ET0 × Kc), 90-day balance, drought history and risk level </summary>
public static class WaterBalance
{
    // Hybrid scale (KOWR: tell current drought apart from a locally dry climate):
    // CRITICAL is absolute, HIGH / MODERATE and drought years are measured against the parcel's own 10-year median
    public const decimal CriticalBalanceMm = -180m;
    public const int CriticalDrySpellDays = 21;
    public const decimal HighAnomalyMm = -50m;
    public const decimal HighSandyAnomalyMm = -35m;
    public const decimal ModerateAnomalyMm = -20m;
    /// <summary> Past year counts as a drought year when its balance is this much below the median </summary>
    public const decimal DroughtYearAnomalyMm = -50m;
    public const int ModerateDroughtYears = 5;

    // used only when the weather archive has no past years for the window
    public const decimal FallbackHighBalanceMm = -110m;
    public const decimal FallbackHighSandyBalanceMm = -90m;
    public const decimal FallbackModerateBalanceMm = -40m;

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

    /// <summary> Median 90-day balance of the 10 past years; null when the archive has none </summary>
    public static decimal? MedianBalanceMm(IEnumerable<WeatherMonth> windowMonths, Crop crop)
    {
        var balances = PastBalances(windowMonths, crop);
        if (balances.Length == 0)
            return null;

        int mid = balances.Length / 2;
        return balances.Length % 2 == 1 ? balances[mid] : Math.Round((balances[mid - 1] + balances[mid]) / 2, 1);
    }

    /// <summary> Past years (of 10) whose same 90-day window was at least 50 mm drier than the median </summary>
    public static int DroughtYears(IEnumerable<WeatherMonth> windowMonths, Crop crop)
    {
        var months = windowMonths as WeatherMonth[] ?? windowMonths.ToArray();
        if (MedianBalanceMm(months, crop) is not { } median)
            return 0;

        return PastBalances(months, crop).Count(b => b - median < DroughtYearAnomalyMm);
    }

    /// <summary> Polish vegetation season (mean daily temperature above ~5 °C): April to October </summary>
    public const int GrowingSeasonFirstMonth = 4;
    public const int GrowingSeasonLastMonth = 10;

    public static bool InGrowingSeason(int month) => month is >= GrowingSeasonFirstMonth and <= GrowingSeasonLastMonth;

    /// <summary>
    /// Outside the vegetation season crops do not draw water, so a drier-than-usual window means a smaller
    /// soil water reserve for spring, not plant stress: the level is capped at MODERATE
    /// </summary>
    public static WaterDeficitLevel ForSeason(WaterDeficitLevel level, int month) =>
        InGrowingSeason(month) || level <= WaterDeficitLevel.Moderate ? level : WaterDeficitLevel.Moderate;

    /// <param name="medianMm"> 10-year median balance; null falls back to absolute thresholds </param>
    public static WaterDeficitLevel Classify(decimal balanceMm, decimal? medianMm, int drySpellDays, decimal? ndwi,
        decimal? sandPct, int droughtYears)
    {
        // rain covered the crop's need: a surplus is never a drought, even if it is smaller than usual here
        if (balanceMm >= 0)
            return WaterDeficitLevel.Low;

        if (balanceMm < CriticalBalanceMm && (drySpellDays >= CriticalDrySpellDays || ndwi < SevereStressNdwi))
            return WaterDeficitLevel.Critical;

        bool sandy = sandPct > SandyPct;
        bool high, moderate;
        if (medianMm is { } median)
        {
            decimal anomaly = balanceMm - median;
            high = anomaly < HighAnomalyMm || (sandy && anomaly < HighSandyAnomalyMm);
            moderate = anomaly < ModerateAnomalyMm;
        }
        else
        {
            high = balanceMm < FallbackHighBalanceMm || (sandy && balanceMm < FallbackHighSandyBalanceMm);
            moderate = balanceMm < FallbackModerateBalanceMm;
        }

        // an absolute deficit beyond the critical line is never below HIGH, even in a dry region
        if (high || balanceMm < CriticalBalanceMm)
            return WaterDeficitLevel.High;
        if (moderate || droughtYears >= ModerateDroughtYears || ndwi < StressNdwi)
            return WaterDeficitLevel.Moderate;

        return WaterDeficitLevel.Low;
    }

    private static decimal[] PastBalances(IEnumerable<WeatherMonth> windowMonths, Crop crop) =>
        windowMonths
            .Where(m => m.YearsBack > 0)
            .GroupBy(m => m.YearsBack)
            .Select(year => BalanceMm(year, crop))
            .Order()
            .ToArray();
}
