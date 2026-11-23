using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Extensions;

namespace WodoPlon.Api.Features.Map.Query.GetMapContext;

public static class GetMapContextEndpoint
{
    /// <summary> Panning sends one request per new grid area; the frontend caches what it has seen </summary>
    public const int LimitPerMinute = 120;

    public static RouteHandlerBuilder MapGetMapContext(this IEndpointRouteBuilder app) =>
        app.MapGet("/context", HandleAsync)
            .Produces<MapContextResponse>()
            .ProducesValidationProblem()
            .RateLimit("map-context", LimitPerMinute, TimeSpan.FromMinutes(1));

    private static async Task<IResult> HandleAsync(
        [AsParameters] GetMapContextQuery query,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        IQueryHandler<GetMapContextQuery, MapContextResponse> handler)
    {
        var result = await handler.HandleAsync(query, cancellationToken);
        var response = result.Value!;

        // the import changes monthly: let the browser keep the lines; without it, ask again once it has run
        httpContext.Response.Headers.CacheControl = response.WaterSource is null ? "no-store" : "public, max-age=3600";
        return TypedResults.Ok(response);
    }
}
