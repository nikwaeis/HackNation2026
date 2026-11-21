using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Localization;
using StackExchange.Redis;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Api.Extensions;
using WodoPlon.Api.Resources;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Filters;

public sealed class RateLimitFilter(
    IRateLimitService rateLimiter,
    IUserAgentService userAgentService,
    IStringLocalizer<SharedResources> localizer,
    ILogger<RateLimitFilter> logger) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var endpoint = http.GetEndpoint();
        var policy = endpoint?.Metadata.GetMetadata<RateLimitPolicy>();
        var name = policy?.Name ?? DefaultName(http, endpoint);
        policy ??= RateLimitPolicies.Default;

        var targets = Targets(context, policy, name);

        RateLimitDecision decision;
        try
        {
            decision = await rateLimiter.CheckAsync(targets,
                policy.CountFailuresOnly ? RateLimitMode.Peek : RateLimitMode.Acquire);
        }
        catch (RedisException e)
        {
            // fail-open: the API keeps working without limits while Redis is down
            logger.LogWarning(e, "Rate limiter unavailable, policy {Policy} skipped", name);
            return await next(context);
        }

        if (!decision.Allowed)
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(decision.RetryAfter.TotalSeconds));
            http.Response.Headers.RetryAfter = seconds.ToString();
            return ResultError.TooManyRequests(RateLimitErrorCodes.TooManyRequests, seconds).ToProblemDetails(localizer);
        }

        var result = await next(context);

        if (policy.CountFailuresOnly && result is IStatusCodeHttpResult { StatusCode: >= 400 })
        {
            try
            {
                await rateLimiter.CheckAsync(targets, RateLimitMode.Record);
            }
            catch (RedisException e)
            {
                logger.LogWarning(e, "Rate limiter unavailable, failure not recorded for {Policy}", name);
            }
        }

        return result;
    }

    /// <summary> IP window allows this many fingerprint windows: neighbours behind one NAT rarely block each other </summary>
    public const int IpLimitFactor = 3;

    private List<RateLimitTarget> Targets(EndpointFilterInvocationContext context, RateLimitPolicy policy, string name)
    {
        var http = context.HttpContext;
        var targets = new List<RateLimitTarget>
        {
            new($"{name}:a:{Fingerprint(http, userAgentService)}", Math.Max(1, policy.Limit), policy.Window),
            // the fingerprint has client-set headers; this window caps header rotation, with room for a shared NAT
            new($"{name}:ip:{Hash(http.Connection.RemoteIpAddress?.ToString() ?? "no-address")}",
                Math.Max(1, policy.Limit) * IpLimitFactor, policy.Window)
        };

        if (policy.PerIdentity is { } rule)
        {
            var identities = context.Arguments.OfType<IRateLimitIdentity>().FirstOrDefault()?.RateLimitIdentities ?? [];
            targets.AddRange(identities
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => Hash(v!.Trim().ToLowerInvariant()))
                .Distinct()
                .Select(h => new RateLimitTarget($"{name}:id:{h}", rule.Limit, rule.Window)));
        }

        return targets;
    }

    // each endpoint without a policy gets its own window
    private static string DefaultName(HttpContext http, Endpoint? endpoint) =>
        $"{RateLimitPolicies.Default.Name}:{http.Request.Method}:{(endpoint as RouteEndpoint)?.RoutePattern.RawText ?? http.Request.Path.Value}";

    public static string Fingerprint(HttpContext http, IUserAgentService userAgentService)
    {
        var headers = http.Request.Headers;
        var agent = userAgentService.ParseFromRaw(headers.UserAgent.ToString()).Value!;
        return Hash(string.Join('|',
            http.Connection.RemoteIpAddress?.ToString() ?? "no-address",
            agent.Os,
            agent.Browser,
            headers.AcceptLanguage.ToString(),
            headers["Sec-CH-UA-Platform"].ToString()));
    }

    private static string Hash(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
}
