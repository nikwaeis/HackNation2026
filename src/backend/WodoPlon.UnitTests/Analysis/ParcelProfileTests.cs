using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Analysis;

public class ParcelProfileTests
{
    [Theory]
    [InlineData(74, 5, 20, 80, SoilDroughtVulnerability.High)]
    [InlineData(20, 35, 20, 175, SoilDroughtVulnerability.Low)]
    [InlineData(40, 20, 20, 130, SoilDroughtVulnerability.Medium)]
    public void SoilAwc_Classifies_Texture(double sand, double clay, double soc, double awc, SoilDroughtVulnerability vulnerability)
    {
        var soil = SoilAwc.From(new SoilSample((decimal)sand, (decimal)clay, 100 - (decimal)sand - (decimal)clay, (decimal)soc));

        soil.AwcMmPerM.Should().Be((decimal)awc);
        soil.Vulnerability.Should().Be(vulnerability);
    }

    [Fact]
    public void SoilAwc_Low_Humus_Cuts_Capacity_By_15_Percent() =>
        SoilAwc.From(new SoilSample(74m, 5m, 21m, 11.2m)).AwcMmPerM.Should().Be(68m);

    [Fact]
    public void SoilAwc_Without_Sample_Assumes_Loam_And_Keeps_Fractions_Empty() =>
        SoilAwc.From(null).Should().Be(new SoilData(null, null, null, null, SoilAwc.LoamAwcMmPerM, SoilDroughtVulnerability.Medium));

    [Fact]
    public void SoilAwc_Output_Is_A_Valid_Static_Profile()
    {
        var parcelId = ParcelIdVo.Create("040101_1.0001.123/4").Value;

        var result = ParcelStaticProfile.Create(parcelId, new ReliefData(null, null, null),
            SoilAwc.From(new SoilSample(68.5m, 8.2m, 23.4m, 42.3m)), new WaterData(85m, HydroFeatureType.Ditch),
            DateTimeOffset.UnixEpoch);

        result.IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void Known_Osm_Ids_Query_Translates_To_Sql()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=fake", npgsql => npgsql.UseNetTopologySuite()).Options);
        long[] osmIds = [1, 2];

        string sql = db.HydroFeatures
            .Where(h => h.OsmId != null && osmIds.Contains(h.OsmId.Value))
            .Select(h => h.OsmId!.Value)
            .ToQueryString();

        sql.Should().Contain("osm_id").And.Contain("= ANY");
    }
}
