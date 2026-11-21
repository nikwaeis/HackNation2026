using Microsoft.EntityFrameworkCore;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Features.Crops.Query.GetCrops;

public sealed class GetCropsHandler(AppDbContext db) : IQueryHandler<GetCropsQuery, CropResponse[]>
{
    private readonly AppDbContext _db = db;

    public async Task<Result<CropResponse[]>> HandleAsync(GetCropsQuery query, CancellationToken cancellationToken = default)
    {
        var crops = await _db.Crops
            .AsNoTracking()
            .OrderBy(c => c.NamePl)
            .ToListAsync(cancellationToken);

        return crops
            .Select(c => new CropResponse(c.Id.Value, c.NamePl, c.KcMid, c.CriticalMonths, c.RootDepthCm))
            .ToArray();
    }
}
