using FluentAssertions;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Enums;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.UnitTests.Analysis;

public class WeatherAggregatesTests
{
    private static readonly DateOnly Target = new(2026, 7, 15);

    private static DailyWeather[] Days(DateOnly from, DateOnly to, Func<DateOnly, decimal> precip, decimal et0 = 3m) =>
        Enumerable.Range(0, to.DayNumber - from.DayNumber + 1)
            .Select(i => from.AddDays(i))
            .Select(date => new DailyWeather(date, precip(date), et0, null))
            .ToArray();

    private static DailyWeather[] FullHistory(Func<DateOnly, decimal> precip) =>
        Days(WeatherAggregates.FetchFrom(Target), Target, precip);

    [Fact]
    public void FetchFrom_Starts_At_Window_Ten_Years_Back() =>
        WeatherAggregates.FetchFrom(Target).Should().Be(new DateOnly(2016, 4, 17));

    [Fact]
    public void Sums_Windows_And_Splits_Them_By_Month()
    {
        var meteo = WeatherAggregates.From(FullHistory(_ => 2m), Target)!;

        meteo.Precip30dMm.Should().Be(60m);
        meteo.Precip90dMm.Should().Be(180m);
        meteo.Et090dMm.Should().Be(270m);
        meteo.Precip10yrAvg90dMm.Should().Be(180m);
        meteo.DrySpellDays.Should().Be(0);

        // window 17 Apr – 15 Jul touches April..July in each of 11 years
        meteo.WindowMonths.Should().HaveCount(44);
        meteo.WindowMonths.Should().ContainEquivalentOf(new WeatherMonth(0, 4, 28m, 42m));
        meteo.WindowMonths.Where(m => m.YearsBack == 3).Sum(m => m.Et0Mm).Should().Be(270m);
    }

    [Fact]
    public void Dry_Spell_Is_The_Longest_Run_Below_1_Mm()
    {
        var drought = (new DateOnly(2026, 6, 1), new DateOnly(2026, 6, 24));
        var meteo = WeatherAggregates.From(
            FullHistory(d => d >= drought.Item1 && d <= drought.Item2 ? 0.4m : d.Day % 10 == 0 ? 0m : 5m), Target)!;

        meteo.DrySpellDays.Should().Be(24);
    }

    [Fact]
    public void Norm_Averages_Only_Years_With_Data()
    {
        // only target year and one year back were fetched
        var days = Days(Target.AddYears(-1).AddDays(-89), Target.AddYears(-1), _ => 1m)
            .Concat(Days(Target.AddDays(-89), Target, _ => 2m))
            .ToArray();

        WeatherAggregates.From(days, Target)!.Precip10yrAvg90dMm.Should().Be(90m);
    }

    [Fact]
    public void Empty_Target_Window_Returns_Null() =>
        WeatherAggregates.From(Days(Target.AddYears(-1).AddDays(-89), Target.AddYears(-1), _ => 1m), Target)
            .Should().BeNull();

    [Fact]
    public void Profile_Relief_Update_Keeps_Soil_And_Water()
    {
        var parcelId = ParcelIdVo.Create("040101_1.0001.123/4").Value;
        var profile = ParcelStaticProfile.Create(parcelId, new ReliefData(null, null, null),
            SoilAwc.From(new SoilSample(74m, 5m, 21m, 11.2m)), new WaterData(85m, HydroFeatureType.Ditch),
            DateTimeOffset.UnixEpoch).Value!;

        profile.UpdateRelief(new ReliefData(4.2m, 7.8m, 38m), DateTimeOffset.UnixEpoch).IsSuccess.Should().BeTrue();

        profile.MeanSlopeDeg.Should().Be(4.2m);
        profile.SandPct!.Value.Value.Should().Be(74m);
        profile.AwcMmPerM.Should().Be(68m);
        profile.NearestWaterDistM.Should().Be(85m);
    }
}
