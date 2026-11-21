namespace WodoPlon.Api.Common.Interface;

public interface IPythonServiceClient
{
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default);
}
