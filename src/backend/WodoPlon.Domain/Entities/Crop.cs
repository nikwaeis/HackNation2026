using WodoPlon.Domain.Results;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Domain.Entities;

/// <summary>
/// Crop dictionary (FAO-56). Used for ETc = ET0 × Kc and drought-sensitive periods
/// </summary>
public sealed class Crop
{
    public const int NameMaxLength = 100;
    public const decimal KcMin = 0m;
    public const decimal KcMax = 2m;

    /// <summary> System crop code, e.g. winter_wheat </summary>
    public CropIdVo Id { get; private set; }

    /// <summary> Polish crop name shown to the farmer </summary>
    public string NamePl { get; private set; } = null!;

    /// <summary> Crop coefficient in the initial growth stage </summary>
    public decimal KcInitial { get; private set; }

    /// <summary> Crop coefficient in the mid-season (peak) stage </summary>
    public decimal KcMid { get; private set; }

    /// <summary> Crop coefficient in the late (maturity) stage </summary>
    public decimal KcLate { get; private set; }

    /// <summary> Months (1..12) when the crop is most vulnerable to water deficit </summary>
    public int[] CriticalMonths { get; private set; } = [];

    /// <summary> Root zone depth in centimeters </summary>
    public int RootDepthCm { get; private set; }

    #region References

    public ICollection<SavedReport> Reports { get; private set; } = new List<SavedReport>();

    #endregion

    private Crop() { }

    public static Result<Crop> Create(string id, string namePl, decimal kcInitial, decimal kcMid, decimal kcLate,
        int[] criticalMonths, int rootDepthCm)
    {
        var idResult = CropIdVo.Create(id);
        if (idResult.IsFailure)
            return idResult.Errors;

        var crop = new Crop { Id = idResult.Value };
        var updateResult = crop.Update(namePl, kcInitial, kcMid, kcLate, criticalMonths, rootDepthCm);
        if (updateResult.IsFailure)
            return updateResult.Errors;

        return crop;
    }

    public Result Update(string namePl, decimal kcInitial, decimal kcMid, decimal kcLate,
        int[] criticalMonths, int rootDepthCm)
    {
        if (string.IsNullOrWhiteSpace(namePl))
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.EmptyName);
        namePl = namePl.Trim();
        if (namePl.Length > NameMaxLength)
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.NameMaxLength, NameMaxLength);

        if (new[] { kcInitial, kcMid, kcLate }.Any(kc => kc < KcMin || kc > KcMax))
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.CoefficientOutOfRange, KcMin, KcMax);

        if (criticalMonths is null || criticalMonths.Length == 0)
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.EmptyCriticalMonths);
        if (criticalMonths.Any(m => m is < 1 or > 12))
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.InvalidMonth);

        if (rootDepthCm <= 0)
            return ResultError.Validation(DomainErrorCodes.Entities.Crop.InvalidRootDepth);

        NamePl = namePl;
        KcInitial = kcInitial;
        KcMid = kcMid;
        KcLate = kcLate;
        CriticalMonths = criticalMonths.Distinct().Order().ToArray();
        RootDepthCm = rootDepthCm;
        return Result.Success();
    }

    /// <summary> True when water deficit in this month hurts the crop most </summary>
    public bool IsCriticalMonth(int month) => CriticalMonths.Contains(month);
}
