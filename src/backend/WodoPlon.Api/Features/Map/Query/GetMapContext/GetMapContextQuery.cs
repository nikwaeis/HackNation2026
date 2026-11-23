using FluentValidation;

namespace WodoPlon.Api.Features.Map.Query.GetMapContext;

/// <summary> Visible map area, WGS 84 degrees (query string: ?south=&amp;west=&amp;north=&amp;east=) </summary>
public record GetMapContextQuery(double? South, double? West, double? North, double? East);

public sealed class GetMapContextQueryValidator : AbstractValidator<GetMapContextQuery>
{
    // Poland with a margin, so parcels on the border still get their neighbourhood
    public const double MinLat = 48.5;
    public const double MaxLat = 55.2;
    public const double MinLon = 13.8;
    public const double MaxLon = 24.5;

    /// <summary> The map asks from zoom 14; a wide screen at that zoom spans ~0.2°, the grid-snapped box a bit more </summary>
    public const double MaxSpanDeg = 0.5;

    public GetMapContextQueryValidator()
    {
        RuleFor(q => q)
            .Must(q => q is { South: not null, West: not null, North: not null, East: not null }
                       && q.South < q.North && q.West < q.East)
            .WithErrorCode(MapErrorCodes.BoxInvalid)
            .OverridePropertyName("bbox")
            .DependentRules(() =>
            {
                // a view on the border may reach into Germany or Belarus: the handler clamps it to Poland
                RuleFor(q => q)
                    .Must(q => q.North > MinLat && q.South < MaxLat && q.East > MinLon && q.West < MaxLon)
                    .WithErrorCode(MapErrorCodes.BoxOutsidePoland)
                    .OverridePropertyName("bbox");
                RuleFor(q => q)
                    .Must(q => q.North - q.South <= MaxSpanDeg && q.East - q.West <= MaxSpanDeg)
                    .WithErrorCode(MapErrorCodes.BoxTooLarge)
                    .OverridePropertyName("bbox");
            });
    }
}
