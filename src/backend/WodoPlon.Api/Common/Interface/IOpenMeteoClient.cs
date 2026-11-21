using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Interface;

/// <summary> Daily weather history from Open-Meteo Archive API </summary>
public interface IOpenMeteoClient
{
    Task<Result<DailyWeather[]>> GetDailyAsync(double lat, double lon, DateOnly from, DateOnly to,
        CancellationToken cancellationToken = default);
}

public sealed record DailyWeather(DateOnly Date, decimal PrecipMm, decimal Et0Mm, decimal? TempMaxC);
