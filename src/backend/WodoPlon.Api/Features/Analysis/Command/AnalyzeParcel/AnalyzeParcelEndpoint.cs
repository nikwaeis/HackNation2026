using Microsoft.Extensions.Localization;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Extensions;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Api.Resources;

namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

public static class AnalyzeParcelEndpoint
{
    // first analysis of a parcel costs ~4 external calls and a 10-year Open-Meteo request
    public const int LimitPerMinute = 10;

    public static RouteHandlerBuilder MapAnalyzeParcel(this IEndpointRouteBuilder app) =>
        app.MapPost("/analyze", HandleAsync)
            .RateLimit("analyze", LimitPerMinute, TimeSpan.FromMinutes(1))
            .Produces<AnalysisResponse>()
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status500InternalServerError);

    private static async Task<IResult> HandleAsync(
        AnalyzeParcelDto requestDto,
        CancellationToken cancellationToken,
        IStringLocalizer<SharedResources> localizer,
        ICommandHandler<AnalyzeParcelCommand, AnalysisResponse> handler)
    {
        var command = new AnalyzeParcelCommand
        (
            requestDto.DzialkaId,
            requestDto.Lat,
            requestDto.Lon,
            requestDto.CropId!,
            requestDto.TargetDate!.Value
        );

        var result = await handler.HandleAsync(command, cancellationToken);

        if (result.IsFailure)
            return result.ToProblemDetails(localizer);

        return TypedResults.Ok(result.Value);
    }
}
