namespace WodoPlon.Api.Common.Models;

public sealed record RateLimitRule(int Limit, TimeSpan Window);

/// <summary>
/// Sliding window: at most <see cref="Limit"/> hits per <see cref="Window"/> per client.
/// <see cref="PerIdentity"/> adds a fixed limit per key extracted from the request body.
/// </summary>
public sealed record RateLimitPolicy(
    string Name,
    int Limit,
    TimeSpan Window,
    bool CountFailuresOnly = false,
    RateLimitRule? PerIdentity = null);

public static class RateLimitPolicies
{
    // endpoints without their own policy; the filter gives each endpoint its own window
    public static readonly RateLimitPolicy Default = new("default", 60, TimeSpan.FromMinutes(1));
}
