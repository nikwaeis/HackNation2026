namespace WodoPlon.Api.Common.Models;

public static class ExternalApiErrorCodes
{
    public const string LocalIdentity = "External";
    public const string ParcelNotFound = $"{LocalIdentity}.{nameof(ParcelNotFound)}";
    public const string UldkUnavailable = $"{LocalIdentity}.{nameof(UldkUnavailable)}";
    public const string WeatherUnavailable = $"{LocalIdentity}.{nameof(WeatherUnavailable)}";
}
