using Microsoft.EntityFrameworkCore;
using WodoPlon.Api.Common.Interface;
using WodoPlon.Api.Data;
using WodoPlon.Api.Features.Analysis.Shared;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Features.Analysis.Query.GetReport;

/// <summary> Returns the stored JSON payload as is; it is already in the POST /api/analyze format </summary>
public sealed class GetReportHandler(AppDbContext db) : IQueryHandler<GetReportQuery, string>
{
    private readonly AppDbContext _db = db;

    public async Task<Result<string>> HandleAsync(GetReportQuery query, CancellationToken cancellationToken = default)
    {
        var payload = await _db.SavedReports
            .Where(r => r.Id == query.ReportUuid)
            .Select(r => r.Payload)
            .FirstOrDefaultAsync(cancellationToken);

        return payload is null ? ResultError.NotFound(AnalysisErrorCodes.ReportNotFound) : payload;
    }
}
