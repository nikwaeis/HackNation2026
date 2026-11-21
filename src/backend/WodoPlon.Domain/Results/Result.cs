namespace WodoPlon.Domain.Results;

public class Result
{
    public bool IsSuccess { get; init; }
    public bool IsFailure => !IsSuccess;
    public ResultError[] Errors { get; init; }

    protected Result()
    {
        IsSuccess = true;
        Errors = Array.Empty<ResultError>();
    }

    protected Result(ResultError error)
    {
        IsSuccess = false;
        Errors = [error];
    }

    protected Result(ResultError[] errors)
    {
        IsSuccess = false;
        Errors = errors;
    }

    public static Result Success() => new();
    public static Result Failure(ResultError error) => new(error);
    public static Result Failure(ResultError[] errors) => new(errors);

    public static implicit operator Result(ResultError error) => new(error);
    public static implicit operator Result(ResultError[] errors) => new(errors);
}

public sealed class Result<TValue> : Result
{
    public TValue? Value { get; init; }

    private Result(TValue value)
    {
        Value = value;
    }

    private Result(ResultError error) : base(error)
    {
        Value = default;
    }

    private Result(ResultError[] errors) : base(errors)
    {
        Value = default;
    }

    public static Result<TValue> Success(TValue value) => new(value);
    public new static Result<TValue> Failure(ResultError error) => new(error);
    public new static Result<TValue> Failure(ResultError[] errors) => new(errors);

    public static implicit operator Result<TValue>(TValue value) => new(value);
    public static implicit operator Result<TValue>(ResultError error) => new(error);
    public static implicit operator Result<TValue>(ResultError[] errors) => new(errors);
}
