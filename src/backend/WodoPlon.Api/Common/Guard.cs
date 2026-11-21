using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Common;

public static class Guard
{
    public static ResultError[] Errors(params Result[] results) =>
        results.SelectMany(r => r.Errors).ToArray();

    public static ResultError[] Errors(IEnumerable<Result> results) =>
        results.SelectMany(r => r.Errors).ToArray();
}
