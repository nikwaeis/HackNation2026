using WodoPlon.Api.Common.Interface;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Crop-independent weather aggregates for the 90-day window before the target date and the same window in past years </summary>
public static class WeatherAggregates
{
    public const int WindowDays = 90;
    public const int ShortWindowDays = 30;
    /// <summary> Days with less rain than this count as dry </summary>
    public const decimal DryDayPrecipMm = 1m;

    /// <summary> First day needed: start of the window 10 years back </summary>
    public static DateOnly FetchFrom(DateOnly targetDate) =>
        targetDate.AddYears(-DynamicObservation.HistoryYears).AddDays(1 - WindowDays);

    /// <summary> Null when the target window has no days at all </summary>
    public static MeteoData? From(IReadOnlyList<DailyWeather> days, DateOnly targetDate)
    {
        var current = Window(days, targetDate, WindowDays);
        if (current.Length == 0)
            return null;

        var pastPrecip = Enumerable.Range(1, DynamicObservation.HistoryYears)
            .Select(yearsBack => Window(days, targetDate.AddYears(-yearsBack), WindowDays))
            .Where(window => window.Length > 0)
            .Select(window => window.Sum(d => d.PrecipMm))
            .ToArray();

        var months = Enumerable.Range(0, DynamicObservation.HistoryYears + 1)
            .SelectMany(yearsBack => Window(days, targetDate.AddYears(-yearsBack), WindowDays)
                // 90 days never hold the same calendar month twice, so month alone is a safe key
                .GroupBy(d => d.Date.Month)
                .Select(g => new WeatherMonth(yearsBack, g.Key, g.Sum(d => d.PrecipMm), g.Sum(d => d.Et0Mm))))
            .ToArray();

        return new MeteoData(
            Window(days, targetDate, ShortWindowDays).Sum(d => d.PrecipMm),
            current.Sum(d => d.PrecipMm),
            pastPrecip.Length > 0 ? Math.Round(pastPrecip.Average(), 2) : null,
            current.Sum(d => d.Et0Mm),
            LongestDrySpell(current),
            months);
    }

    private static DailyWeather[] Window(IReadOnlyList<DailyWeather> days, DateOnly end, int length)
    {
        var start = end.AddDays(1 - length);
        return days.Where(d => d.Date >= start && d.Date <= end).OrderBy(d => d.Date).ToArray();
    }

    private static int LongestDrySpell(DailyWeather[] window)
    {
        int longest = 0, run = 0;
        foreach (var day in window)
        {
            run = day.PrecipMm < DryDayPrecipMm ? run + 1 : 0;
            longest = Math.Max(longest, run);
        }

        return longest;
    }
}
