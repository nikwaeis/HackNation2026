using FluentValidation;

namespace WodoPlon.Api.Common.Options;

public sealed class RateLimitSettings
{
    public const string SectionName = "RateLimit";

    public string CachePrefix { get; set; } = "rate:";
}

public sealed class RateLimitSettingsValidation : AbstractValidator<RateLimitSettings>
{
    public RateLimitSettingsValidation()
    {
        RuleFor(x => x.CachePrefix).NotEmpty().WithMessage("Cache prefix is required.");
    }
}
