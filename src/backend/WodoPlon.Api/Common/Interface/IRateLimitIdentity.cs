namespace WodoPlon.Api.Common.Interface;

/// <summary>Request body values limited independently of the client fingerprint.</summary>
public interface IRateLimitIdentity
{
    IEnumerable<string?> RateLimitIdentities { get; }
}
