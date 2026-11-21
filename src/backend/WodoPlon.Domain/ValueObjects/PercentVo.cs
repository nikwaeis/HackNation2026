using WodoPlon.Domain.Results;

namespace WodoPlon.Domain.ValueObjects;

/// <summary> Percentage in range 0..100 </summary>
public readonly record struct PercentVo
{
    public const decimal Min = 0m;
    public const decimal Max = 100m;

    public decimal Value { get; init; }

    private PercentVo(decimal value)
    {
        Value = value;
    }

    public static Result<PercentVo> Create(decimal value)
    {
        if (value < Min || value > Max)
            return ResultError.Validation(DomainErrorCodes.ValueObjects.Percent.OutOfRange, Min, Max);

        return new PercentVo(value);
    }

    /// <summary> Null-friendly factory for optional fields </summary>
    public static Result<PercentVo?> CreateOptional(decimal? value)
    {
        if (value is null)
            return Result<PercentVo?>.Success(null);
        var result = Create(value.Value);
        if (result.IsFailure)
            return result.Errors;
        return Result<PercentVo?>.Success(result.Value);
    }
}
