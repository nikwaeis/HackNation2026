using WodoPlon.Api.Features.Map.Query.GetMapContext;

namespace WodoPlon.Api.Features.Map;

public static class MapRoute
{
    /// <summary> Map overlay of ditches and streams from the local OSM import, so the browser need not query Overpass for them </summary>
    public static IEndpointRouteBuilder MapMapContext(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/map").WithTags("Map");
        group.MapGetMapContext();
        return app;
    }
}
