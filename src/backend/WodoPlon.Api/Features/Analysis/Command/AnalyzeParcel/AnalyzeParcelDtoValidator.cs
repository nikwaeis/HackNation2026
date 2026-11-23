using FluentValidation;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

public class AnalyzeParcelDtoValidator : AbstractValidator<AnalyzeParcelDto>
{
    /// <summary> The farmer's "today" is the Polish calendar date, a day ahead of UTC between midnight and 01:00 / 02:00 </summary>
    private static readonly TimeZoneInfo Poland = FindPolishTimeZone();

    private static TimeZoneInfo FindPolishTimeZone()
    {
        foreach (var id in new[] { "Europe/Warsaw", "Central European Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
                // try the next id
            }
        }

        // container without a time zone database: EU rule, CET (UTC+1) and CEST (UTC+2) from the last Sunday of
        // March to the last Sunday of October
        var start = TimeZoneInfo.TransitionTime.CreateFloatingDateRule(new DateTime(1, 1, 1, 2, 0, 0), 3, 5, DayOfWeek.Sunday);
        var end = TimeZoneInfo.TransitionTime.CreateFloatingDateRule(new DateTime(1, 1, 1, 3, 0, 0), 10, 5, DayOfWeek.Sunday);
        var rule = TimeZoneInfo.AdjustmentRule.CreateAdjustmentRule(DateTime.MinValue.Date, DateTime.MaxValue.Date,
            TimeSpan.FromHours(1), start, end);
        return TimeZoneInfo.CreateCustomTimeZone("Europe/Warsaw", TimeSpan.FromHours(1), "Poland", "CET", "CEST", [rule]);
    }

    public AnalyzeParcelDtoValidator(TimeProvider timeProvider)
    {
        RuleFor(x => x)
            .Must(x => !string.IsNullOrWhiteSpace(x.DzialkaId) || x is { Lat: not null, Lon: not null })
            .WithErrorCode(AnalysisErrorCodes.LocationRequired)
            .OverridePropertyName(nameof(AnalyzeParcelDto.DzialkaId));

        RuleFor(x => x.Lat).InclusiveBetween(-90.0, 90.0).WithErrorCode(AnalysisErrorCodes.LatitudeOutOfRange);
        RuleFor(x => x.Lon).InclusiveBetween(-180.0, 180.0).WithErrorCode(AnalysisErrorCodes.LongitudeOutOfRange);
        RuleFor(x => x.CropId).NotEmpty().WithErrorCode(AnalysisErrorCodes.CropRequired);

        // history goes 10 years back and the weather archive has no future
        RuleFor(x => x.TargetDate)
            .Cascade(CascadeMode.Stop)
            .NotNull().WithErrorCode(AnalysisErrorCodes.TargetDateOutOfRange)
            .Must(date =>
            {
                var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), Poland).DateTime);
                return date <= today && date >= today.AddYears(-DynamicObservation.HistoryYears);
            })
            .WithErrorCode(AnalysisErrorCodes.TargetDateOutOfRange);
    }
}
