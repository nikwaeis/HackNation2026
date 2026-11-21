namespace WodoPlon.Domain.Results;

/// <summary>
/// Error with short code (localization key) and optional args for placeholders.
/// </summary>
public record ResultError(string Code, ErrorType Type, params object[] Args)
{
    public static ResultError Validation(string code, params object[] args) => new(code, ErrorType.Validation, args);
    public static ResultError NotFound(string code, params object[] args) => new(code, ErrorType.NotFound, args);
    public static ResultError Unauthorized(string code, params object[] args) => new(code, ErrorType.Unauthorized, args);
    public static ResultError Forbidden(string code, params object[] args) => new(code, ErrorType.Forbidden, args);
    public static ResultError Conflict(string code, params object[] args) => new(code, ErrorType.Conflict, args);
    public static ResultError TooManyRequests(string code, params object[] args) => new(code, ErrorType.TooManyRequests, args);
    public static ResultError Failure(string code, params object[] args) => new(code, ErrorType.Failure, args);
}
