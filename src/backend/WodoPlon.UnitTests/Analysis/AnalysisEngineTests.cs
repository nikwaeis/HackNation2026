using FluentAssertions;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Analysis;

public class AnalysisEngineTests
{
    private static readonly ParcelIdVo ParcelId = ParcelIdVo.Create("040101_1.0001.123/4").Value;
    private static readonly DateOnly Target = new(2026, 7, 15);
    private static readonly DateTimeOffset FetchedAt = new(2026, 11, 21, 12, 0, 0, TimeSpan.Zero);

    private static readonly Crop Wheat = Crop.Create("winter_wheat", "Pszenica ozima", 0.40m, 1.15m, 0.30m, [5, 6], 120).Value!;

    // P 98.4 mm, ETc = 40·0.40 + 110·1.15 + 130·1.15 + 60·0.30 = 310 mm → balance −211.6 mm
    private static readonly WeatherMonth[] CurrentWindow =
        [new(0, 4, 10m, 40m), new(0, 5, 30m, 110m), new(0, 6, 40m, 130m), new(0, 7, 18.4m, 60m)];

    // years 1–6: balance −180 mm (drought), years 7–10: −10 mm
    private static readonly WeatherMonth[] History = Enumerable.Range(1, 10)
        .SelectMany(y => y <= 6
            ? new WeatherMonth[] { new(y, 4, 10m, 40m), new(y, 5, 40m, 110m), new(y, 6, 50m, 130m), new(y, 7, 30m, 60m) }
            : [new(y, 4, 60m, 40m), new(y, 5, 90m, 110m), new(y, 6, 100m, 130m), new(y, 7, 50m, 60m)])
        .ToArray();

    private static ParcelStaticProfile SandyDitchSlope() =>
        ParcelStaticProfile.Create(ParcelId, new ReliefData(4.2m, 7.8m, 38m),
            SoilAwc.From(new SoilSample(74m, 5m, 21m, 11.2m)), new WaterData(85m, HydroFeatureType.Ditch), FetchedAt).Value!;

    private static DynamicObservation Observation(SatelliteData satellite, int drySpell = 24, DateTimeOffset? fetchedAt = null) =>
        DynamicObservation.Create(ParcelId, Target,
            new MeteoData(40m, 98.4m, 182m, 340m, drySpell, [.. CurrentWindow, .. History]),
            satellite, fetchedAt ?? FetchedAt).Value!;

    private static readonly SatelliteData StressedScene = new(SatelliteStatus.Ok, 0.41m, -0.18m, new DateOnly(2026, 7, 12), 5m);

    [Theory]
    [InlineData(4, 0.40)]
    [InlineData(5, 1.15)]
    [InlineData(6, 1.15)]
    [InlineData(8, 0.30)]
    public void Kc_Follows_Crop_Stage_By_Month(int month, double kc) =>
        WaterBalance.Kc(Wheat, month).Should().Be((decimal)kc);

    [Fact]
    public void Balance_And_Drought_Years_Use_Crop_Kc()
    {
        WaterBalance.CropNeedMm(CurrentWindow, Wheat).Should().Be(310m);
        WaterBalance.BalanceMm(CurrentWindow, Wheat).Should().Be(-211.6m);
        WaterBalance.DroughtYears([.. CurrentWindow, .. History], Wheat).Should().Be(6);
    }

    [Theory]
    [InlineData(-200, 24, null, null, 0, WaterDeficitLevel.Critical)]
    [InlineData(-200, 10, -0.2, null, 0, WaterDeficitLevel.Critical)]
    [InlineData(-200, 10, null, null, 0, WaterDeficitLevel.High)] // gap in api.md rules
    [InlineData(-120, 0, null, null, 0, WaterDeficitLevel.High)]
    [InlineData(-95, 0, null, 74.0, 0, WaterDeficitLevel.High)]
    [InlineData(-95, 0, null, 40.0, 0, WaterDeficitLevel.Moderate)]
    [InlineData(-10, 0, null, null, 5, WaterDeficitLevel.Moderate)]
    [InlineData(-10, 0, -0.12, null, 0, WaterDeficitLevel.Moderate)]
    [InlineData(-10, 0, 0.1, null, 0, WaterDeficitLevel.Low)]
    public void Classify_Follows_Api_Thresholds(double balance, int drySpell, double? ndwi, double? sand, int droughtYears,
        WaterDeficitLevel expected) =>
        WaterBalance.Classify((decimal)balance, drySpell, (decimal?)ndwi, (decimal?)sand, droughtYears).Should().Be(expected);

    [Fact]
    public void Dry_Sandy_Sloped_Parcel_By_A_Ditch_Gets_Full_Report()
    {
        var assessment = AnalysisEngine.Assess(SandyDitchSlope(), Observation(StressedScene), Wheat);

        assessment.RiskLevel.Should().Be(WaterDeficitLevel.Critical);
        assessment.SummaryPl.Should().StartWith("Krytyczne ryzyko").And.Contain("-211.6 mm").And.Contain("310.0 mm");
        assessment.HistoricalContextPl.Should().Contain("w 6 sezonach");
        assessment.Metrics.Should().Be(new DiagnosisMetrics(98.4m, 182m, -211.6m, 24, 6, 0.41m, -0.18m, 4.2m, 74m, 85m));

        // rain + dry spell, sand, humus, slope, ditch
        assessment.CausesPl.Should().HaveCount(5);
        assessment.CausesPl[0].Should().Be("Niskie opady (98.4 mm wobec normy 182.0 mm) oraz 24 dni bez opadów.");
        assessment.Retention.Select(m => m.Type).Should().Equal(
            RetentionType.Landscape, RetentionType.Landscape, RetentionType.Soil, RetentionType.Soil);
        assessment.Retention.Should().Contain(m => m.Title == "Zastawki na rowie melioracyjnym (85 m od działki)");

        // July is past wheat's critical months, but NDWI −0.18 shows severe stress; dose 0.3 · 68 mm/m · 1.2 m ≈ 24 mm
        assessment.Irrigation.IsRecommended.Should().BeTrue();
        assessment.Irrigation.DoseMm.Should().Be(24m);
        assessment.Irrigation.AdvicePl.Should().Contain("24 mm (240 m³/ha)");

        assessment.Sources.Should().Contain("Sentinel-2 L2A Earth Search (zdjęcie z dnia 2026-07-12, zachmurzenie 5%)");
        assessment.SatelliteStatus.Should().Be(SatelliteStatus.Ok);
    }

    [Fact]
    public void Irrigation_Waits_Outside_Critical_Months_Without_Severe_Stress()
    {
        var advice = Recommendations.Irrigation(WaterDeficitLevel.High, Wheat, Target, -0.05m, 130m);

        advice.IsRecommended.Should().BeFalse();
        advice.AdvicePl.Should().Contain("maj, czerwiec");
    }

    [Theory]
    [InlineData(30, 15)] // 0.3 · 30 · 1.2 = 10.8 → min 15
    [InlineData(175, 35)] // 0.3 · 175 · 1.2 = 63 → max 35
    public void Irrigation_Dose_Is_Clamped(double awc, double dose) =>
        Recommendations.Irrigation(WaterDeficitLevel.Critical, Wheat, new DateOnly(2026, 6, 1), null, (decimal)awc)
            .DoseMm.Should().Be((decimal)dose);

    [Fact]
    public void Missing_Data_Becomes_Honest_Limitations()
    {
        var bareProfile = ParcelStaticProfile.Create(ParcelId, new ReliefData(null, null, null), SoilAwc.From(null),
            new WaterData(null, null), FetchedAt).Value!;
        var observation = Observation(new SatelliteData(SatelliteStatus.NoData), fetchedAt: new DateTimeOffset(2026, 7, 16, 0, 0, 0, TimeSpan.Zero));

        var assessment = AnalysisEngine.Assess(bareProfile, observation, Wheat);

        assessment.LimitationsPl.Should().HaveCount(6)
            .And.Contain(l => l.StartsWith("Brak bezchmurnego zdjęcia Sentinel-2"))
            .And.Contain(l => l.StartsWith("Brak danych SoilGrids"))
            .And.Contain(l => l.StartsWith("Brak danych o ukształtowaniu terenu"))
            .And.Contain(l => l.Contains("nie znaleziono cieków"))
            .And.Contain(l => l.Contains("opóźnienie archiwum Open-Meteo"));
        assessment.Sources.Should().NotContain(s => s.StartsWith("Sentinel-2") || s.StartsWith("ISRIC") || s.StartsWith("Geoportal"));
    }

    [Fact]
    public void Healthy_Parcel_Still_Gets_A_Retention_Measure()
    {
        var loamProfile = ParcelStaticProfile.Create(ParcelId, new ReliefData(1m, 2m, 0m),
            SoilAwc.From(new SoilSample(40m, 20m, 40m, 25m)), new WaterData(900m, HydroFeatureType.River), FetchedAt).Value!;

        var wetObservation = DynamicObservation.Create(ParcelId, Target,
            new MeteoData(60m, 200m, 182m, 300m, 3, CurrentWindow), StressedScene, FetchedAt).Value!;

        var (causes, measures) = Recommendations.Retention(loamProfile, wetObservation);

        causes.Should().ContainSingle();
        measures.Should().ContainSingle(m => m.Title == "Utrzymanie okrywy roślinnej");
    }
}
