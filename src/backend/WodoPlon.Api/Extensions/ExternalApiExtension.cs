using Microsoft.Extensions.Options;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Common.Options;
using WodoPlon.Api.Common.Services;

namespace WodoPlon.Api.Extensions;

public static class ExternalApiExtension
{
    // Overpass and Nominatim-style services reject requests without a User-Agent
    private const string UserAgent = "WodoPlon/1.0";

    public static IServiceCollection AddExternalApiClients(this IServiceCollection services)
    {
        services.AddExternalClient<IUldkClient, UldkClient>(s => s.UldkBaseUrl);
        services.AddExternalClient<IOpenMeteoClient, OpenMeteoClient>(s => s.OpenMeteoBaseUrl);
        services.AddExternalClient<ISoilGridsClient, SoilGridsClient>(s => s.SoilGridsBaseUrl);
        services.AddExternalClient<IOverpassClient, OverpassClient>(s => s.OverpassBaseUrl, s => s.OverpassTimeoutSeconds);

        services.AddHttpClient<IPythonServiceClient, PythonServiceClient>((sp, client) =>
        {
            var settings = sp.GetRequiredService<IOptions<PythonServiceSettings>>().Value;
            client.BaseAddress = new Uri(settings.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds);
        });

        return services;
    }

    private static void AddExternalClient<TClient, TImplementation>(this IServiceCollection services,
        Func<ExternalApisSettings, string> baseUrl, Func<ExternalApisSettings, int>? timeoutSeconds = null)
        where TClient : class
        where TImplementation : class, TClient =>
        services.AddHttpClient<TClient, TImplementation>((sp, client) =>
        {
            var settings = sp.GetRequiredService<IOptions<ExternalApisSettings>>().Value;
            client.BaseAddress = new Uri(baseUrl(settings));
            client.Timeout = TimeSpan.FromSeconds(timeoutSeconds?.Invoke(settings) ?? settings.TimeoutSeconds);
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        });
}
