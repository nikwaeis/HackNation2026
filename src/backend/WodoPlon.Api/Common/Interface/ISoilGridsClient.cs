namespace WodoPlon.Api.Common.Interface;

/// <summary> Topsoil (0–30 cm) texture and organic carbon from ISRIC SoilGrids v2.0 </summary>
public interface ISoilGridsClient
{
    /// <summary> Null when the service is down or has no data for the point (water, cities) </summary>
    Task<SoilSample?> GetTopsoilAsync(double lat, double lon, CancellationToken cancellationToken = default);
}

public sealed record SoilSample(decimal? SandPct, decimal? ClayPct, decimal? SiltPct, decimal? SocGKg);
