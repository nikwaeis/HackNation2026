using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Services;

public sealed class OpenMeteoClient(HttpClient httpClient, ILogger<OpenMeteoClient> logger) : IOpenMeteoClient
{
    public async Task<Result<DailyWeather[]>> GetDailyAsync(double lat, double lon, DateOnly from, DateOnly to,
        CancellationToken cancellationToken = default)
    {
        string query = string.Create(CultureInfo.InvariantCulture,
            $"v1/archive?latitude={lat}&longitude={lon}&start_date={from:yyyy-MM-dd}&end_date={to:yyyy-MM-dd}&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max&timezone=Europe%2FWarsaw");

        try
        {
            using var response = await httpClient.GetAsync(query, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                // 429 = free-tier daily limit, 400 = date range outside archive
                logger.LogWarning("Open-Meteo returned {StatusCode}: {Body}", (int)response.StatusCode,
                    await response.Content.ReadAsStringAsync(cancellationToken));
                return ResultError.Failure(ExternalApiErrorCodes.WeatherUnavailable);
            }

            var body = await response.Content.ReadFromJsonAsync<ArchiveResponse>(cancellationToken);
            if (body?.Daily is not { } daily)
                return ResultError.Failure(ExternalApiErrorCodes.WeatherUnavailable);

            // the archive lags a few days behind today, those days come back as nulls
            return daily.Time
                .Select((date, i) => (date, precip: daily.Precipitation[i], et0: daily.Et0[i], tmax: daily.TempMax[i]))
                .Where(d => d.precip is not null && d.et0 is not null)
                .Select(d => new DailyWeather(d.date, d.precip!.Value, d.et0!.Value, d.tmax))
                .ToArray();
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException
                                  && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "Open-Meteo request failed");
            return ResultError.Failure(ExternalApiErrorCodes.WeatherUnavailable);
        }
    }

    private sealed record ArchiveResponse
    (
        [property: JsonPropertyName("daily")] DailyBlock? Daily
    );

    private sealed record DailyBlock
    (
        [property: JsonPropertyName("time")] DateOnly[] Time,
        [property: JsonPropertyName("precipitation_sum")] decimal?[] Precipitation,
        [property: JsonPropertyName("et0_fao_evapotranspiration")] decimal?[] Et0,
        [property: JsonPropertyName("temperature_2m_max")] decimal?[] TempMax
    );
}
