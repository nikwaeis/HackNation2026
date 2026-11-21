using WodoPlon.Api.Common.Interface;

namespace WodoPlon.Api.Features.Crops.Query.GetCrops;

public static class GetCropsEndpoint
{
    public static RouteHandlerBuilder MapGetCrops(this IEndpointRouteBuilder app) =>
        app.MapGet("", HandleAsync)
            .Produces<CropResponse[]>();

    private static async Task<IResult> HandleAsync(
        CancellationToken cancellationToken,
        IQueryHandler<GetCropsQuery, CropResponse[]> handler)
    {
        var result = await handler.HandleAsync(new GetCropsQuery(), cancellationToken);
        return TypedResults.Ok(result.Value);
    }
}
