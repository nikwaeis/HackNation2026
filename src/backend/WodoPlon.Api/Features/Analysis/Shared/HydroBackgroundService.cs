using System.Collections.Concurrent;
using System.Threading.Channels;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Features.Analysis.Shared;

/// <summary> Parcels waiting for the nearest-water lookup; a parcel is queued at most once at a time </summary>
public sealed class HydroLookupQueue
{
    public const int Capacity = 500;

    private readonly Channel<ParcelIdVo> _channel = Channel.CreateBounded<ParcelIdVo>(Capacity);
    private readonly ConcurrentDictionary<string, byte> _pending = new();

    /// <summary> False when already queued or the queue is full; the next analysis of the parcel queues it again </summary>
    public bool Enqueue(ParcelIdVo parcelId)
    {
        if (!_pending.TryAdd(parcelId.Value, 0))
            return false;
        if (_channel.Writer.TryWrite(parcelId))
            return true;

        _pending.TryRemove(parcelId.Value, out _);
        return false;
    }

    public IAsyncEnumerable<ParcelIdVo> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);

    public void Done(ParcelIdVo parcelId) => _pending.TryRemove(parcelId.Value, out _);
}

/// <summary> Runs Overpass lookups one by one, off the request path: Overpass often needs 20–30 s </summary>
public sealed class HydroBackgroundService(
    HydroLookupQueue queue,
    IServiceScopeFactory scopes,
    ILogger<HydroBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var parcelId in queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<WaterLookupService>().FillAsync(parcelId, stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogError(e, "Nearest water lookup failed for {ParcelId}", parcelId.Value);
            }
            finally
            {
                queue.Done(parcelId);
            }
        }
    }
}
