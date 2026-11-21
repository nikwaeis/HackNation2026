namespace WodoPlon.Domain.Results;

public enum ErrorType
{
    Validation,
    NotFound,
    Unauthorized,
    Forbidden,
    Conflict,
    TooManyRequests,
    Failure
}
