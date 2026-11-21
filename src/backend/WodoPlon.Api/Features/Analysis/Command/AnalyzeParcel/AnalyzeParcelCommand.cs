namespace WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;

public record AnalyzeParcelCommand
(
    string? DzialkaId,
    double? Lat,
    double? Lon,
    string CropId,
    DateOnly TargetDate
);
