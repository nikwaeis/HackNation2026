namespace WodoPlon.Api.Features.Analysis.Shared;

public static class AnalysisErrorCodes
{
    public const string LocalIdentity = "Analysis";
    public const string LocationRequired = $"{LocalIdentity}.{nameof(LocationRequired)}";
    public const string LatitudeOutOfRange = $"{LocalIdentity}.{nameof(LatitudeOutOfRange)}";
    public const string LongitudeOutOfRange = $"{LocalIdentity}.{nameof(LongitudeOutOfRange)}";
    public const string CropRequired = $"{LocalIdentity}.{nameof(CropRequired)}";
    public const string CropNotFound = $"{LocalIdentity}.{nameof(CropNotFound)}";
    public const string TargetDateOutOfRange = $"{LocalIdentity}.{nameof(TargetDateOutOfRange)}";
    public const string ReportNotFound = $"{LocalIdentity}.{nameof(ReportNotFound)}";
}
