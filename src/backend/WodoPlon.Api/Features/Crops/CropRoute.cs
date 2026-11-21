using WodoPlon.Api.Features.Crops.Query.GetCrops;

namespace WodoPlon.Api.Features.Crops;

public static class CropRoute
{
    /// <summary> Crop dictionary for the select box </summary>
    public static IEndpointRouteBuilder MapCrops(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/crops").WithTags("Crop");
        group.MapGetCrops();
        return app;
    }
}
