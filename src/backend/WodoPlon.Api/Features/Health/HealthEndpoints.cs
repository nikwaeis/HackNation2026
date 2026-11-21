using WodoPlon.Api.Common.Models;

namespace WodoPlon.Api.Features.Health;

public static class HealthEndpoints
{
    public static void MapHealth(this RouteGroupBuilder group)
    {
        group.MapGet("/health", () => TypedResults.Ok(new { status = "ok" }))
            .RequireCors(CorsPolicies.PublicRead)
            .WithTags("Health");
    }
}
