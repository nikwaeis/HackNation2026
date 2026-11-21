using WodoPlon.Api.Common.Interface;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Available water capacity of the topsoil by texture class (api.md §4, step 1.3) </summary>
public static class SoilAwc
{
    public const decimal SandyThresholdPct = 65m;
    public const decimal ClayThresholdPct = 30m;
    public const decimal LowOrganicCarbonGKg = 15m;
    public const decimal LowOrganicCarbonFactor = 0.85m;

    // middles of the api.md ranges: sand 70–90, clay 160–190; loam is between them
    public const decimal SandyAwcMmPerM = 80m;
    public const decimal LoamAwcMmPerM = 130m;
    public const decimal ClayAwcMmPerM = 175m;

    /// <summary> Soil profile from SoilGrids sample; null sample keeps fractions empty and assumes loam </summary>
    public static SoilData From(SoilSample? sample)
    {
        // shortcut: one Poland-wide loam fallback instead of regional averages, upgrade if many parcels miss SoilGrids data
        if (sample is null)
            return new SoilData(null, null, null, null, LoamAwcMmPerM, SoilDroughtVulnerability.Medium);

        var (awc, vulnerability) = sample switch
        {
            { SandPct: > SandyThresholdPct } => (SandyAwcMmPerM, SoilDroughtVulnerability.High),
            { ClayPct: > ClayThresholdPct } => (ClayAwcMmPerM, SoilDroughtVulnerability.Low),
            _ => (LoamAwcMmPerM, SoilDroughtVulnerability.Medium)
        };

        // humus holds water: poor soil keeps 15% less
        if (sample.SocGKg < LowOrganicCarbonGKg)
            awc *= LowOrganicCarbonFactor;

        return new SoilData(sample.SandPct, sample.ClayPct, sample.SiltPct, sample.SocGKg, awc, vulnerability);
    }
}
