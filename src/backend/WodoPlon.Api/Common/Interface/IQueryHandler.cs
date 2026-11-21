using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common.Interface;

public interface IQueryHandler<in TRequest, TResult>
{
    Task<Result<TResult>> HandleAsync(TRequest query, CancellationToken cancellationToken = default);
}
