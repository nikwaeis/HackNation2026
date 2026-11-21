using WodoPlon.Api.Features.Analysis.Command.AnalyzeParcel;
using WodoPlon.Api.Features.Analysis.Query.GetReport;

namespace WodoPlon.Api.Features.Analysis;

public static class AnalysisRoute
{
    /// <summary> Parcel analysis and shared reports, public without registration </summary>
    public static IEndpointRouteBuilder MapAnalysis(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("").WithTags("Analysis");
        group.MapAnalyzeParcel();
        group.MapGetReport();
        return app;
    }
}
