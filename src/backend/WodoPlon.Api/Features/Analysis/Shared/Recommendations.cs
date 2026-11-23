using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

public enum RetentionType
{
    Landscape,
    Soil
}

public sealed record RetentionMeasure(RetentionType Type, string Title, string Description);

public sealed record IrrigationAdvice(bool IsRecommended, string AdvicePl, decimal? DoseMm);

/// <summary> Step 2 (causes → retention measures, priority) and step 3 (irrigation, last resort) </summary>
public static class Recommendations
{
    public const decimal LowRainShareOfNorm = 0.75m;
    public const int LongDrySpellDays = 14;
    public const decimal SteepSlopeDeg = 3.0m;
    public const decimal SteepAreaPct = 25m;
    public const decimal DitchInfluenceM = 300m;

    public const decimal MinDoseMm = 15m;
    public const decimal MaxDoseMm = 35m;
    /// <summary> One dose refills this share of the root zone capacity </summary>
    public const decimal DoseShareOfAwc = 0.3m;

    public static (string[] CausesPl, RetentionMeasure[] Measures) Retention(ParcelStaticProfile profile,
        DynamicObservation observation, ReportText text)
    {
        var causes = new List<string>();
        var measures = new List<RetentionMeasure>();

        // trigger 1: weather deficit
        decimal precip = observation.Precip90dMm ?? 0;
        decimal? norm = observation.Precip10yrAvg90dMm;
        int drySpell = observation.DrySpellDays ?? 0;
        bool lowRain = precip < LowRainShareOfNorm * norm;
        bool longDrySpell = drySpell >= LongDrySpellDays;
        if (lowRain || longDrySpell)
        {
            causes.Add((lowRain, longDrySpell) switch
            {
                (true, true) => text["Report.Cause.LowRainAndDrySpell", precip, norm, drySpell],
                (true, false) => text["Report.Cause.LowRain", precip, norm],
                _ => text["Report.Cause.DrySpell", drySpell]
            });
            measures.Add(Measure(text, RetentionType.Soil, "Mulch"));
        }

        // trigger 2: soil holds little water
        decimal? sand = profile.SandPct?.Value;
        decimal? soc = profile.OrganicCarbonGKg;
        bool sandy = sand > SoilAwc.SandyThresholdPct;
        bool lowHumus = soc < SoilAwc.LowOrganicCarbonGKg;
        if (sandy)
            causes.Add(text["Report.Cause.Sandy", sand]);
        if (lowHumus)
            causes.Add(text["Report.Cause.LowHumus", soc]);
        if (sandy || lowHumus)
            measures.Add(new(RetentionType.Soil, text["Report.Measure.CoverCrops.Title"],
                lowHumus
                    ? text["Report.Measure.CoverCrops.DescriptionLowHumus", soc]
                    : text["Report.Measure.CoverCrops.Description"]));

        // trigger 3: surface runoff from the slope
        decimal? slope = profile.MeanSlopeDeg;
        decimal? steep = profile.SteepAreaPct?.Value;
        if (slope > SteepSlopeDeg || steep > SteepAreaPct)
        {
            causes.Add(slope > SteepSlopeDeg
                ? text["Report.Cause.Slope", slope]
                : text["Report.Cause.SteepArea", steep]);
            measures.Add(Measure(text, RetentionType.Landscape, "Contour"));
        }

        // trigger 4: drainage ditch takes groundwater away
        decimal? distance = profile.NearestWaterDistM;
        if (profile.NearestWaterType == HydroFeatureType.Ditch && distance <= DitchInfluenceM)
        {
            causes.Add(text["Report.Cause.Ditch", distance]);
            measures.Add(new(RetentionType.Landscape, text["Report.Measure.DitchDam.Title", distance],
                text["Report.Measure.DitchDam.Description"]));
        }

        if (measures.Count == 0)
        {
            causes.Add(text["Report.Cause.None"]);
            measures.Add(Measure(text, RetentionType.Soil, "KeepCover"));
        }

        // landscape measures first: they hold the water before it leaves the field
        return (causes.ToArray(), measures.OrderBy(m => m.Type).ToArray());
    }

    // api.md condition 3 ("retention cannot compensate the deficit now") always holds: retention measures work over seasons
    public static IrrigationAdvice Irrigation(WaterDeficitLevel level, Crop crop, DateOnly targetDate, decimal? ndwi,
        decimal? awcMmPerM, ReportText text)
    {
        if (level is not (WaterDeficitLevel.High or WaterDeficitLevel.Critical))
            return new(false, text["Report.Irrigation.NotNeeded"], null);

        // severe canopy stress justifies irrigation outside the critical months, but only while the crop grows:
        // a low NDWI over a dormant winter field or bare soil is not water stress
        bool severeStressInSeason = WaterBalance.InGrowingSeason(targetDate.Month) && ndwi < WaterBalance.SevereStressNdwi;
        if (!crop.IsCriticalMonth(targetDate.Month) && !severeStressInSeason)
        {
            string months = string.Join(", ", crop.CriticalMonths.Select(text.Month));
            return new(false, text["Report.Irrigation.OutsideCriticalMonths", months], null);
        }

        decimal awcRoot = (awcMmPerM ?? SoilAwc.LoamAwcMmPerM) * crop.RootDepthCm / 100m;
        decimal dose = Math.Round(Math.Clamp(DoseShareOfAwc * awcRoot, MinDoseMm, MaxDoseMm));

        return new(true, text["Report.Irrigation.Recommended", dose, dose * 10], dose);
    }

    private static RetentionMeasure Measure(ReportText text, RetentionType type, string key) =>
        new(type, text[$"Report.Measure.{key}.Title"], text[$"Report.Measure.{key}.Description"]);
}
