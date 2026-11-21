using FluentValidation;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

public class AnalyzeParcelDtoValidator : AbstractValidator<AnalyzeParcelDto>
{
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
                var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
                return date <= today && date >= today.AddYears(-DynamicObservation.HistoryYears);
            })
            .WithErrorCode(AnalysisErrorCodes.TargetDateOutOfRange);
    }
}
