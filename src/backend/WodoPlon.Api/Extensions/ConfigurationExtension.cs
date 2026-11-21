namespace WodoPlon.Api.Extensions;

public static class ConfigurationExtension
{
    public static string GetRequired(this IConfiguration configuration, string key) =>
        configuration[key] is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException($"Configuration '{key}' is missing (env: {key.Replace(":", "__")}).");
}
