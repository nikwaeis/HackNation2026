using FluentAssertions;
using NetTopologySuite.Geometries;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Domain;

public class EntityTests
{
    private const string ValidParcelId = "040101_1.0001.123/4";
    private static readonly DateOnly Target = new(2026, 6, 15);

    private static MultiPolygon Square(int srid = Parcel.Srid)
    {
        var polygon = new GeometryFactory(new PrecisionModel(), srid).CreatePolygon(
        [
            new Coordinate(18.0, 53.0), new Coordinate(18.01, 53.0), new Coordinate(18.01, 53.01),
            new Coordinate(18.0, 53.01), new Coordinate(18.0, 53.0)
        ]);
        return new MultiPolygon([polygon], polygon.Factory);
    }

    private static readonly MeteoData Meteo = new(20m, 90m, 150m, 300m, 12, [new WeatherMonth(0, 6, 90m, 300m)]);

    [Theory]
    [InlineData("040101_1.0001.123/4", true)]
    [InlineData("  040101_1.0001.123/4 ", true)]
    [InlineData("123/4", false)]
    [InlineData("", false)]
    public void ParcelId_Validates_Teryt_Format(string value, bool ok)
    {
        ParcelIdVo.Create(value).IsSuccess.Should().Be(ok);
    }

    [Fact]
    public void Parcel_Create_Computes_Centroid_With_Srid()
    {
        var result = Parcel.Create(ValidParcelId, "kujawsko-pomorskie", 1.2m, Square(), DateTimeOffset.UtcNow);

        result.IsSuccess.Should().BeTrue();
        result.Value!.Centroid.SRID.Should().Be(Parcel.Srid);
        result.Value.Centroid.X.Should().BeApproximately(18.005, 1e-9);
    }

    [Fact]
    public void Parcel_Rejects_Wrong_Srid()
    {
        var result = Parcel.Create(ValidParcelId, null, 1m, Square(srid: 2180), DateTimeOffset.UtcNow);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.Parcel.InvalidSrid);
    }

    [Fact]
    public void StaticProfile_Rejects_Mean_Slope_Above_Max()
    {
        var result = ParcelStaticProfile.Create(ParcelIdVo.Create(ValidParcelId).Value,
            new ReliefData(5m, 3m, 10m),
            new SoilData(60m, 10m, 30m, 12m, 120m, SoilDroughtVulnerability.High),
            new WaterData(250m, HydroFeatureType.Ditch), DateTimeOffset.UtcNow);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.ParcelStaticProfile.MeanSlopeExceedsMax);
    }

    [Fact]
    public void StaticProfile_Flags_Runoff_Risk()
    {
        var profile = ParcelStaticProfile.Create(ParcelIdVo.Create(ValidParcelId).Value,
            new ReliefData(2m, 8m, 35m), new SoilData(null, null, null, null, null, null),
            new WaterData(null, null), DateTimeOffset.UtcNow).Value!;

        profile.HasRunoffRisk.Should().BeTrue();
    }

    [Fact]
    public void Observation_Ok_Requires_Indices()
    {
        var result = DynamicObservation.Create(ParcelIdVo.Create(ValidParcelId).Value, Target, Meteo,
            new SatelliteData(SatelliteStatus.Ok), DateTimeOffset.UtcNow);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.DynamicObservation.MissingSatelliteData);
    }

    [Fact]
    public void Observation_NoData_Rejects_Indices()
    {
        var result = DynamicObservation.Create(ParcelIdVo.Create(ValidParcelId).Value, Target, Meteo,
            new SatelliteData(SatelliteStatus.NoData, NdviMean: 0.5m), DateTimeOffset.UtcNow);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.DynamicObservation.UnexpectedSatelliteData);
    }

    [Theory]
    [InlineData(1)] // after the target date
    [InlineData(16)]
    [InlineData(-31)] // older than the geo-worker's 30-day search window
    public void Observation_Rejects_Scene_Outside_Window(int shiftDays)
    {
        var result = DynamicObservation.Create(ParcelIdVo.Create(ValidParcelId).Value, Target, Meteo,
            new SatelliteData(SatelliteStatus.Ok, 0.6m, 0.1m, Target.AddDays(shiftDays), 5m), DateTimeOffset.UtcNow);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.DynamicObservation.SceneOutOfWindow);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-16)] // used to be dropped by the old ±15-day check although the geo-worker searches 30 days back
    [InlineData(-30)]
    public void Observation_Accepts_Scene_From_The_30_Days_Before_The_Target(int shiftDays) =>
        DynamicObservation.Create(ParcelIdVo.Create(ValidParcelId).Value, Target, Meteo,
                new SatelliteData(SatelliteStatus.Ok, 0.6m, 0.1m, Target.AddDays(shiftDays), 5m), DateTimeOffset.UtcNow)
            .IsSuccess.Should().BeTrue();

    [Fact]
    public void Observation_Computes_Water_Balance_And_Norm()
    {
        var observation = DynamicObservation.Create(ParcelIdVo.Create(ValidParcelId).Value, Target, Meteo,
            new SatelliteData(SatelliteStatus.Ok, 0.6m, 0.1m, Target.AddDays(-3), 5m), DateTimeOffset.UtcNow).Value!;

        observation.ClimaticWaterBalance90dMm.Should().Be(-210m);
        observation.Precip90dOfNormPct.Should().Be(60m);
    }

    [Fact]
    public void Crop_Rejects_Invalid_Month()
    {
        var result = Crop.Create("maize", "Kukurydza", 0.3m, 1.2m, 0.5m, [6, 13], 130);

        result.Errors.Single().Code.Should().Be(DomainErrorCodes.Entities.Crop.InvalidMonth);
    }
}
