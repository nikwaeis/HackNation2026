using NetTopologySuite.Geometries;
using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Common.Interface;

/// <summary> Cadastral parcel lookup in ULDK GUGiK </summary>
public interface IUldkClient
{
    Task<Result<UldkParcel>> GetByIdAsync(ParcelIdVo parcelId, CancellationToken cancellationToken = default);
    Task<Result<UldkParcel>> GetByPointAsync(double lat, double lon, CancellationToken cancellationToken = default);
}

public sealed record UldkParcel(ParcelIdVo ParcelId, string? Voivodeship, MultiPolygon Geom);
