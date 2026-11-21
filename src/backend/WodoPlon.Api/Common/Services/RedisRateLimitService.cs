using Microsoft.Extensions.Options;
using StackExchange.Redis;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Options;

namespace WodoPlon.Api.Common.Services;

/// <summary>Sliding-window log: one sorted-set entry per hit, scored by Redis time in ms.</summary>
public sealed class RedisRateLimitService(IConnectionMultiplexer redis, IOptions<RateLimitSettings> settings)
    : IRateLimitService
{
    private readonly IDatabase _db = redis.GetDatabase();
    private readonly string _prefix = settings.Value.CachePrefix;

    private const string SlidingWindowScript = """
        local t = redis.call('TIME')
        local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
        local mode = ARGV[1]
        local member = now .. ':' .. ARGV[2]
        local retry = 0
        for i, key in ipairs(KEYS) do
            local limit = tonumber(ARGV[1 + i * 2])
            local window = tonumber(ARGV[2 + i * 2])
            redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
            if mode ~= 'record' and redis.call('ZCARD', key) >= limit then
                local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
                retry = math.max(retry, tonumber(oldest[2]) + window - now)
            end
        end
        if retry > 0 then return {0, retry} end
        if mode ~= 'peek' then
            for i, key in ipairs(KEYS) do
                redis.call('ZADD', key, now, member)
                redis.call('PEXPIRE', key, tonumber(ARGV[2 + i * 2]))
            end
        end
        return {1, 0}
        """;

    public async Task<RateLimitDecision> CheckAsync(IReadOnlyList<RateLimitTarget> targets, RateLimitMode mode)
    {
        var keys = targets.Select(t => (RedisKey)(_prefix + t.Key)).ToArray();
        var args = new List<RedisValue> { mode.ToString().ToLowerInvariant(), Guid.NewGuid().ToString("N") };
        foreach (var t in targets)
        {
            args.Add(t.Limit);
            args.Add((long)t.Window.TotalMilliseconds);
        }

        var result = (RedisResult[])(await _db.ScriptEvaluateAsync(SlidingWindowScript, keys, args.ToArray()))!;
        return new RateLimitDecision((long)result[0] == 1, TimeSpan.FromMilliseconds(Math.Max(0, (long)result[1])));
    }
}
