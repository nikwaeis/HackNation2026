using System.Globalization;
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

/// <summary> Step 2 (causes → retention measures, priority) and step 3 (irrigation, last resort); texts are Polish </summary>
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

    private static readonly string[] MonthsPl =
        ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

    public static (string[] CausesPl, RetentionMeasure[] Measures) Retention(ParcelStaticProfile profile,
        DynamicObservation observation)
    {
        var causes = new List<string>();
        var measures = new List<RetentionMeasure>();

        // trigger 1: weather deficit
        decimal precip = observation.Precip90dMm ?? 0;
        int drySpell = observation.DrySpellDays ?? 0;
        bool lowRain = precip < LowRainShareOfNorm * observation.Precip10yrAvg90dMm;
        bool longDrySpell = drySpell >= LongDrySpellDays;
        if (lowRain || longDrySpell)
        {
            causes.Add((lowRain, longDrySpell) switch
            {
                (true, true) => Text($"Niskie opady ({precip:0.0} mm wobec normy {observation.Precip10yrAvg90dMm:0.0} mm) oraz {drySpell} dni bez opadów."),
                (true, false) => Text($"Niskie opady w ostatnich 90 dniach ({precip:0.0} mm wobec normy {observation.Precip10yrAvg90dMm:0.0} mm)."),
                _ => Text($"Długi okres bez opadów: {drySpell} dni z rzędu z opadem poniżej 1 mm.")
            });
            measures.Add(new(RetentionType.Soil, "Mulczowanie i pozostawienie resztek pożniwnych",
                "Okrywa z resztek roślinnych ogranicza bezproduktywne parowanie wody z powierzchni gleby."));
        }

        // trigger 2: soil holds little water
        decimal? sand = profile.SandPct?.Value;
        decimal? soc = profile.OrganicCarbonGKg;
        bool sandy = sand > SoilAwc.SandyThresholdPct;
        bool lowHumus = soc < SoilAwc.LowOrganicCarbonGKg;
        if (sandy)
            causes.Add(Text($"Gleba lekka, piaszczysta ({sand:0}% piasku) o niskiej pojemności wodnej."));
        if (lowHumus)
            causes.Add(Text($"Niska zawartość materii organicznej ({soc:0.0} g/kg) ogranicza zatrzymywanie wody w glebie."));
        if (sandy || lowHumus)
            measures.Add(new(RetentionType.Soil, "Międzyplony i uprawa bezorkowa",
                lowHumus
                    ? Text($"Międzyplony i ograniczenie orki zwiększą zawartość próchnicy (obecnie niska: {soc:0.0} g/kg) i pojemność wodną gleby.")
                    : "Międzyplony i ograniczenie orki zwiększą zawartość próchnicy i pojemność wodną lekkiej gleby."));

        // trigger 3: surface runoff from the slope
        decimal? slope = profile.MeanSlopeDeg;
        decimal? steep = profile.SteepAreaPct?.Value;
        if (slope > SteepSlopeDeg || steep > SteepAreaPct)
        {
            causes.Add(slope > SteepSlopeDeg
                ? Text($"Nachylenie terenu ({slope:0.0}°) przyspiesza spływ powierzchniowy.")
                : Text($"{steep:0}% powierzchni działki ma spadek powyżej 3°, co przyspiesza spływ wody opadowej."));
            measures.Add(new(RetentionType.Landscape, "Uprawa poprzeczna do stoku i strefy buforowe",
                "Uprawa w poprzek stoku, pasy zadarnione oraz małe zbiorniki u podnóża stoku zatrzymają wodę z ulewnych opadów."));
        }

        // trigger 4: drainage ditch takes groundwater away
        decimal? distance = profile.NearestWaterDistM;
        if (profile.NearestWaterType == HydroFeatureType.Ditch && distance <= DitchInfluenceM)
        {
            causes.Add(Text($"Rów melioracyjny w odległości {distance:0} m przyspiesza odpływ wód gruntowych z działki."));
            measures.Add(new(RetentionType.Landscape, Text($"Zastawki na rowie melioracyjnym ({distance:0} m od działki)"),
                "Spowolnienie odpływu wody w pobliskim rowie podniesie poziom wód gruntowych w strefie korzeniowej."));
        }

        if (measures.Count == 0)
        {
            causes.Add("Nie stwierdzono czynników pogłębiających niedobór wody na działce.");
            measures.Add(new(RetentionType.Soil, "Utrzymanie okrywy roślinnej",
                "Pozostawianie resztek pożniwnych i unikanie gołej gleby utrzyma obecny stan uwilgotnienia."));
        }

        // landscape measures first: they hold the water before it leaves the field
        return (causes.ToArray(), measures.OrderBy(m => m.Type).ToArray());
    }

    // api.md condition 3 ("retention cannot compensate the deficit now") always holds: retention measures work over seasons
    public static IrrigationAdvice Irrigation(WaterDeficitLevel level, Crop crop, DateOnly targetDate, decimal? ndwi,
        decimal? awcMmPerM)
    {
        if (level is not (WaterDeficitLevel.High or WaterDeficitLevel.Critical))
            return new(false, "Nawadnianie nie jest obecnie potrzebne. Priorytetem pozostaje zatrzymanie wody w glebie i krajobrazie.", null);

        if (!crop.IsCriticalMonth(targetDate.Month) && !(ndwi < WaterBalance.SevereStressNdwi))
        {
            string months = string.Join(", ", crop.CriticalMonths.Select(m => MonthsPl[m - 1]));
            return new(false, $"Mimo niedoboru wody nawadnianie nie jest zalecane poza krytycznym okresem wzrostu uprawy ({months}). Priorytetem są zabiegi zatrzymujące wodę w glebie.", null);
        }

        decimal awcRoot = (awcMmPerM ?? SoilAwc.LoamAwcMmPerM) * crop.RootDepthCm / 100m;
        decimal dose = Math.Round(Math.Clamp(DoseShareOfAwc * awcRoot, MinDoseMm, MaxDoseMm));

        return new(true, Text($"Nawadnianie interwencyjne uzasadnione w krytycznym okresie wzrostu: jednorazowa dawka {dose:0} mm ({dose * 10:0} m³/ha), podawana rano lub wieczorem, wyłącznie po wdrożeniu zabiegów ograniczających parowanie."),
            dose);
    }

    // report numbers use a dot, as in the api.md contract
    internal static string Text(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);
}
