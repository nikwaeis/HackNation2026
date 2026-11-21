using WodoPlon.Api.Common.Interface;

namespace WodoPlon.Api.Common.Services;

public sealed class PythonServiceClient(HttpClient httpClient, ILogger<PythonServiceClient> logger)
    : IPythonServiceClient
{
    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await httpClient.GetAsync("/health", cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Python service health check failed");
            return false;
        }
    }
}
