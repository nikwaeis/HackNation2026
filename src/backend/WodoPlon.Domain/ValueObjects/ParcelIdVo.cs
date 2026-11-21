using System.Text.RegularExpressions;
using WodoPlon.Domain.Results;

namespace WodoPlon.Domain.ValueObjects;

/// <summary> Official TERYT parcel id (działka ewidencyjna), e.g. 040101_1.0001.123/4 </summary>
public readonly record struct ParcelIdVo
{
    public const int MaxLength = 64;

    public static readonly Regex TerytRegex = new(
        @"^\d{6}_\d\.\d{4}\.[0-9A-Za-z/.\-]+$",
        RegexOptions.Compiled,
        TimeSpan.FromMilliseconds(100)
    );

    public string Value { get; init; }

    private ParcelIdVo(string value)
    {
        Value = value;
    }

    public static Result<ParcelIdVo> Create(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return ResultError.Validation(DomainErrorCodes.ValueObjects.ParcelId.Empty);
        value = value.Trim();
        if (value.Length > MaxLength)
            return ResultError.Validation(DomainErrorCodes.ValueObjects.ParcelId.MaxLength, MaxLength);
        if (!TerytRegex.IsMatch(value))
            return ResultError.Validation(DomainErrorCodes.ValueObjects.ParcelId.InvalidFormat);

        return new ParcelIdVo(value);
    }
}
