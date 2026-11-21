using System.Text.Json;
using FluentAssertions;
using NetTopologySuite.Geometries;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Extensions;
using WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Analysis;

public class AnalyzeEndpointTests
{
    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private static readonly AnalyzeParcelDtoValidator Validator =
        new(new FixedTime(new DateTimeOffset(2026, 11, 21, 12, 0, 0, TimeSpan.Zero)));

    private static readonly AnalyzeParcelDto Valid = new("040101_1.0001.123/4", null, null, "winter_wheat", new DateOnly(2026, 7, 15));

    private static string[] Errors(AnalyzeParcelDto dto) =>
        Validator.Validate(dto).Errors.Select(e => e.ErrorCode).ToArray();

    [Fact]
    public void Parcel_Id_Or_Click_Is_Enough()
    {
        Errors(Valid).Should().BeEmpty();
        Errors(Valid with { DzialkaId = null, Lat = 53.12, Lon = 18.0 }).Should().BeEmpty();
    }

    [Fact]
    public void Missing_Location_Is_Rejected() =>
        Errors(Valid with { DzialkaId = " ", Lat = 53.12 }).Should().Equal(AnalysisErrorCodes.LocationRequired);

    [Theory]
    [InlineData("2026-11-22")] // tomorrow
    [InlineData("2016-11-20")] // more than 10 years back
    public void Target_Date_Must_Be_Within_Last_10_Years(string date) =>
        Errors(Valid with { TargetDate = DateOnly.Parse(date) }).Should().Equal(AnalysisErrorCodes.TargetDateOutOfRange);

    [Fact]
    public void Missing_Crop_And_Date_Are_Rejected_Once_Each() =>
        Errors(Valid with { CropId = null, TargetDate = null })
            .Should().Equal(AnalysisErrorCodes.CropRequired, AnalysisErrorCodes.TargetDateOutOfRange);

    [Fact]
    public void Coordinates_Must_Be_On_Earth() =>
        Errors(Valid with { Lat = 91, Lon = -181 })
            .Should().Equal(AnalysisErrorCodes.LatitudeOutOfRange, AnalysisErrorCodes.LongitudeOutOfRange);

    [Fact]
    public void Response_Matches_Api_Contract()
    {
        var parcelId = ParcelIdVo.Create("040101_1.0001.123/4").Value;
        var geom = new MultiPolygon([new Polygon(new LinearRing(
            [new(18.007, 53.123), new(18.009, 53.123), new(18.009, 53.125), new(18.007, 53.123)]))]) { SRID = Parcel.Srid };
        var parcel = Parcel.Create(parcelId.Value, "kujawsko-pomorskie", 14.52m, geom, DateTimeOffset.UnixEpoch).Value!;
        var crop = Crop.Create("winter_wheat", "Pszenica ozima", 0.40m, 1.15m, 0.30m, [5, 6], 120).Value!;
        var profile = ParcelStaticProfile.Create(parcelId, new ReliefData(4.2m, 7.8m, 38m),
            SoilAwc.From(new SoilSample(74m, 5m, 21m, 11.2m)), new WaterData(85m, HydroFeatureType.Ditch), DateTimeOffset.UnixEpoch).Value!;
        var observation = DynamicObservation.Create(parcelId, new DateOnly(2026, 7, 15),
            new MeteoData(40m, 98.4m, 182m, 340m, 24, [new WeatherMonth(0, 6, 98.4m, 340m)]),
            new SatelliteData(SatelliteStatus.NoData), DateTimeOffset.UnixEpoch).Value!;

        var text = TestTexts.Use("pl");
        var response = AnalysisResponse.From(Guid.Empty, parcel, crop, text.CropName(crop), new DateOnly(2026, 7, 15),
            AnalysisEngine.Assess(profile, observation, crop, text));
        var json = JsonDocument.Parse(JsonSerializer.Serialize(response,
            new JsonSerializerOptions(JsonSerializerDefaults.Web).AddApiConverters())).RootElement;

        json.GetProperty("parcelInfo").GetProperty("targetDate").GetString().Should().Be("2026-07-15");
        json.GetProperty("parcelInfo").GetProperty("polygonGeoJson").GetProperty("type").GetString().Should().Be("MultiPolygon");
        json.GetProperty("step1_diagnosis").GetProperty("riskLevel").GetString().Should().Be("CRITICAL");
        // no past years in this window → no norm, but the field is part of the contract
        json.GetProperty("step1_diagnosis").GetProperty("metrics").GetProperty("waterBalance10yrMedianMm").ValueKind
            .Should().Be(JsonValueKind.Null);
        json.GetProperty("step1_diagnosis").GetProperty("metrics").GetProperty("precip90dMm").GetDecimal().Should().Be(98.4m);
        json.GetProperty("step2_causesAndRetention").GetProperty("retentionRecommendationsPl")[0]
            .GetProperty("type").GetString().Should().Be("LANDSCAPE");
        // July is past wheat's critical months and there is no NDWI without a scene
        json.GetProperty("step3_irrigation").GetProperty("isRecommended").GetBoolean().Should().BeFalse();
        json.GetProperty("step3_irrigation").GetProperty("advicePl").GetString().Should().NotBeEmpty();
        json.GetProperty("step4_sourcesAndLimitations").GetProperty("satelliteStatus").GetString().Should().Be("NO_DATA");
    }
}
