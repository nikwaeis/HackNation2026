using System.Globalization;
using Microsoft.Extensions.Caching.Hybrid;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary>
/// One live fetch per key at a time: concurrent first requests for the same parcel (or parcel + date) wait for the
/// first one instead of hitting ULDK / SoilGrids / Open-Meteo / geo-worker again. HybridCache holds only the outcome,
/// the data itself is read from the DB afterwards
/// </summary>
public sealed class FetchCoalescer(HybridCache cache, IServiceScopeFactory scopes)
{
    /// <summary> Success marker lives this long; the DB is the real cache, this only bridges concurrent requests </summary>
    public static readonly TimeSpan OutcomeTtl = TimeSpan.FromMinutes(1);

    private static readonly HybridCacheEntryOptions Options = new()
    {
        Expiration = OutcomeTtl,
        LocalCacheExpiration = OutcomeTtl
    };

    private readonly HybridCache _cache = cache;
    private readonly IServiceScopeFactory _scopes = scopes;

    /// <param name="work"> Runs in its own DI scope, so the first caller disconnecting does not dispose the DbContext others wait on </param>
    public async Task<Result> RunAsync(string key, Func<IServiceProvider, CancellationToken, Task<Result>> work,
        CancellationToken cancellationToken = default)
    {
        var result = await RunForValueAsync(key, async (services, token) =>
        {
            var done = await work(services, token);
            return done.IsFailure ? done.Errors : Result<string>.Success("");
        }, cancellationToken);

        return result.IsFailure ? result.Errors : Result.Success();
    }

    /// <summary> Same, and every waiter gets the small string the work produced (e.g. a parcel id) </summary>
    public async Task<Result<string>> RunForValueAsync(string key,
        Func<IServiceProvider, CancellationToken, Task<Result<string>>> work, CancellationToken cancellationToken = default)
    {
        var outcome = await _cache.GetOrCreateAsync(key, async token =>
        {
            await using var scope = _scopes.CreateAsyncScope();
            return FetchOutcome.From(await work(scope.ServiceProvider, token));
        }, Options, cancellationToken: cancellationToken);

        if (outcome.Code is null)
            return outcome.Value ?? "";

        // failures are not cached: the next request tries again
        await _cache.RemoveAsync(key, CancellationToken.None);
        return new ResultError(outcome.Code, outcome.Type, outcome.Args.Cast<object>().ToArray());
    }

    public sealed record FetchOutcome(string? Code, ErrorType Type, string[] Args, string? Value)
    {
        public static FetchOutcome From(Result<string> result) =>
            result.IsFailure
                ? new(result.Errors[0].Code, result.Errors[0].Type,
                    result.Errors[0].Args.Select(a => Convert.ToString(a, CultureInfo.InvariantCulture) ?? "").ToArray(), null)
                : new(null, ErrorType.Failure, [], result.Value);
    }
}
