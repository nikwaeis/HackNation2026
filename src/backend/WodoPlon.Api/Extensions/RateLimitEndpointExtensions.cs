using WodoPlon.Api.Common.Models;

namespace WodoPlon.Api.Extensions;

public static class RateLimitEndpointExtensions
{
    public static TBuilder RateLimit<TBuilder>(this TBuilder builder, RateLimitPolicy policy)
        where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(policy);

    // per-endpoint limit; name is part of the Redis key, keep it unique per endpoint
    public static TBuilder RateLimit<TBuilder>(this TBuilder builder, string name, int limit, TimeSpan window)
        where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(new RateLimitPolicy(name, limit, window));
}
