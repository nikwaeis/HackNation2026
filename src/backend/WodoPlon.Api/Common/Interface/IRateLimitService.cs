namespace WodoPlon.Api.Common.Interface;

public readonly record struct RateLimitDecision(bool Allowed, TimeSpan RetryAfter);

public sealed record RateLimitTarget(string Key, int Limit, TimeSpan Window);

public enum RateLimitMode
{
    /// <summary>Check all targets; record a hit on all of them only if every one passes.</summary>
    Acquire,
    /// <summary>Check only, record nothing.</summary>
    Peek,
    /// <summary>Record a hit on all targets without checking.</summary>
    Record
}

public interface IRateLimitService
{
    Task<RateLimitDecision> CheckAsync(IReadOnlyList<RateLimitTarget> targets, RateLimitMode mode);
}
