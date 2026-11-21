using Microsoft.EntityFrameworkCore;
using WodoPlon.Domain.Results;

namespace WodoPlon.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.HasPostgresExtension("pg_trgm");
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        builder.HasDbFunction(typeof(AppDbContext).GetMethod(nameof(AsText))!)
            .HasName("text")
            .IsBuiltIn();
    }

    /// <summary>
    /// SQL text(column): strips value-object converter so ILIKE/LIKE params bind as plain strings.
    /// Use with EF.Property&lt;string&gt;(entity, nameof(entity.VoProperty)).
    /// </summary>
    public static string AsText(string value) => throw new InvalidOperationException("SQL only");

    /// <summary>Runs action in a transaction; result only says whether it committed.</summary>
    public async Task<Result> ExecuteInTransactionAsync(
        Func<CancellationToken, Task<Result>> action, CancellationToken cancellationToken = default)
    {
        var strategy = Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await Database.BeginTransactionAsync(cancellationToken);
            try
            {
                ChangeTracker.Clear();
                var result = await action(cancellationToken);
                if (result.IsFailure)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return result;
                }

                await base.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return Result.Success();
            }
            catch
            {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        });
    }

    public async Task<Result<TResult>> ExecuteInTransactionAsync<TResult>(
        Func<CancellationToken, Task<Result<TResult>>> action, CancellationToken cancellationToken = default)
    {
        var strategy = Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await Database.BeginTransactionAsync(cancellationToken);
            try
            {
                ChangeTracker.Clear();
                var result = await action(cancellationToken);
                if (result.IsFailure)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    return result.Errors;
                }

                await base.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return result;
            }
            catch
            {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        });
    }
}
