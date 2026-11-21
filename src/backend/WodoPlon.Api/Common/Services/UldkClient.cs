using System.Globalization;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Models;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Common.Services;

public sealed class UldkClient(HttpClient httpClient, ILogger<UldkClient> logger) : IUldkClient
{
    private const string ResultFields = "id,voivodeship,geom_wkt";

    public Task<Result<UldkParcel>> GetByIdAsync(ParcelIdVo parcelId, CancellationToken cancellationToken = default) =>
        QueryAsync($"?request=GetParcelById&id={Uri.EscapeDataString(parcelId.Value)}&result={ResultFields}&srid={Parcel.Srid}",
            cancellationToken);

    public Task<Result<UldkParcel>> GetByPointAsync(double lat, double lon, CancellationToken cancellationToken = default) =>
        QueryAsync(string.Create(CultureInfo.InvariantCulture,
                $"?request=GetParcelByXY&xy={lon},{lat},{Parcel.Srid}&result={ResultFields}&srid={Parcel.Srid}"),
            cancellationToken);

    private async Task<Result<UldkParcel>> QueryAsync(string query, CancellationToken cancellationToken)
    {
        string body;
        try
        {
            using var response = await httpClient.GetAsync(query, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("ULDK returned {StatusCode} for {Query}", (int)response.StatusCode, query);
                return ResultError.Failure(ExternalApiErrorCodes.UldkUnavailable);
            }

            body = await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(e, "ULDK request failed for {Query}", query);
            return ResultError.Failure(ExternalApiErrorCodes.UldkUnavailable);
        }

        return Parse(body);
    }

    // body: first line is status ("0" ok, "-1 brak wyników" not found), second is "id|voivodeship|SRID=4326;POLYGON((lon lat, ...))"
    private Result<UldkParcel> Parse(string body)
    {
        var lines = body.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length == 0 || lines[0].StartsWith("-1"))
            return ResultError.NotFound(ExternalApiErrorCodes.ParcelNotFound);

        var fields = lines.Length > 1 ? lines[1].Split('|') : [];
        if (lines[0] != "0" || fields.Length < 3)
        {
            logger.LogWarning("ULDK returned unexpected body: {Body}", body.Length > 200 ? body[..200] : body);
            return ResultError.Failure(ExternalApiErrorCodes.UldkUnavailable);
        }

        var parcelIdResult = ParcelIdVo.Create(fields[0]);
        if (parcelIdResult.IsFailure)
            return parcelIdResult.Errors;

        string wkt = fields[2][(fields[2].IndexOf(';') + 1)..];
        var geom = new WKTReader().Read(wkt) switch
        {
            MultiPolygon multi => multi,
            Polygon polygon => new MultiPolygon([polygon]),
            _ => null
        };
        if (geom is null)
            return ResultError.Failure(ExternalApiErrorCodes.UldkUnavailable);

        geom.SRID = Parcel.Srid;
        string? voivodeship = string.IsNullOrWhiteSpace(fields[1]) ? null : fields[1];

        return new UldkParcel(parcelIdResult.Value, voivodeship, geom);
    }
}
