using Microsoft.Extensions.Localization;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Extensions;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Api.Resources;

namespace WodoPlon.Api.Features.Analysis.Query.GetReport;

public static class GetReportEndpoint
{
    public static RouteHandlerBuilder MapGetReport(this IEndpointRouteBuilder app) =>
        app.MapGet("/reports/{reportUuid:guid}", HandleAsync)
            .Produces<AnalysisResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

    private static async Task<IResult> HandleAsync(
        Guid reportUuid,
        CancellationToken cancellationToken,
        IStringLocalizer<SharedResources> localizer,
        IQueryHandler<GetReportQuery, string> handler)
    {
        var result = await handler.HandleAsync(new GetReportQuery(reportUuid), cancellationToken);

        if (result.IsFailure)
            return result.ToProblemDetails(localizer);

        return TypedResults.Text(result.Value!, "application/json");
    }
}
