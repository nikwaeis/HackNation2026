using Microsoft.EntityFrameworkCore;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Common.Seeds;

public record CropData(string Id, string NamePl, decimal KcInitial, decimal KcMid, decimal KcLate,
    int[] CriticalMonths, int RootDepthCm);

/// <summary> Main Polish crops with FAO-56 coefficients; inserts only missing ids </summary>
public sealed class CropSeeder(AppDbContext db) : IDataSeeder
{
    public int Order => 1;

    public static readonly IReadOnlyList<CropData> Crops =
    [
        new("winter_wheat", "Pszenica ozima", 0.40m, 1.15m, 0.30m, [5, 6], 120),
        new("maize", "Kukurydza", 0.30m, 1.20m, 0.50m, [6, 7, 8], 130),
        new("rapeseed", "Rzepak ozimy", 0.40m, 1.15m, 0.35m, [4, 5, 6], 110),
        new("sugar_beet", "Burak cukrowy", 0.35m, 1.20m, 0.70m, [6, 7, 8], 100),
        new("potato", "Ziemniak", 0.50m, 1.15m, 0.75m, [6, 7], 60)
    ];

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var existing = (await db.Crops.Select(c => c.Id).ToListAsync(cancellationToken))
            .Select(id => id.Value)
            .ToHashSet();

        foreach (var data in Crops.Where(c => !existing.Contains(c.Id)))
        {
            var result = Crop.Create(data.Id, data.NamePl, data.KcInitial, data.KcMid, data.KcLate,
                data.CriticalMonths, data.RootDepthCm);
            if (result.IsFailure)
                throw new InvalidOperationException($"Invalid crop seed '{data.Id}': {result.Errors[0].Code}");
            db.Crops.Add(result.Value!);
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
