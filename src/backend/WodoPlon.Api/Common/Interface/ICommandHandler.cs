using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Interface;

public interface ICommandHandler<in TRequest>
{
    Task<Result> HandleAsync(TRequest command, CancellationToken cancellationToken = default);
}

public interface ICommandHandler<in TRequest, TResult>
{
    Task<Result<TResult>> HandleAsync(TRequest command, CancellationToken cancellationToken = default);
}
