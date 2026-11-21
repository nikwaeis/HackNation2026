using WodoPlon.Api.Common.Options;

namespace WodoPlon.Api.Extensions;

public static class RegisterOptionsExtension
{
    public static IServiceCollection AddAppOptions(this IServiceCollection services)
    {
        services.AddOptions<RateLimitSettings>()
            .BindConfiguration(RateLimitSettings.SectionName)
            .ValidateFluently()
            .ValidateOnStart();

        services.AddOptions<CorsSettings>()
            .BindConfiguration(CorsSettings.SectionName)
            .ValidateFluently()
            .ValidateOnStart();

        services.AddOptions<PythonServiceSettings>()
            .BindConfiguration(PythonServiceSettings.SectionName)
            .ValidateFluently()
            .ValidateOnStart();

        return services;
    }
}
