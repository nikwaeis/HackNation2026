using System.Text.RegularExpressions;
using WodoPlon.Domain.Results;

namespace WodoPlon.Domain.ValueObjects;

/// <summary> System crop code in snake_case, e.g. winter_wheat </summary>
public readonly record struct CropIdVo
{
    public const int MaxLength = 50;

    public static readonly Regex CodeRegex = new(
        @"^[a-z][a-z_]*$",
        RegexOptions.Compiled,
        TimeSpan.FromMilliseconds(100)
    );

    public string Value { get; init; }

    private CropIdVo(string value)
    {
        Value = value;
    }

    public static Result<CropIdVo> Create(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return ResultError.Validation(DomainErrorCodes.ValueObjects.CropId.Empty);
        value = value.Trim();
        if (value.Length > MaxLength)
            return ResultError.Validation(DomainErrorCodes.ValueObjects.CropId.MaxLength, MaxLength);
        if (!CodeRegex.IsMatch(value))
            return ResultError.Validation(DomainErrorCodes.ValueObjects.CropId.InvalidFormat);

        return new CropIdVo(value);
    }
}
