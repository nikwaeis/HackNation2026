using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Data.Configuration;

public class DynamicObservationConfiguration : IEntityTypeConfiguration<DynamicObservation>
{
    public const string ParcelDateIndexName = "ux_dynamic_observations_dzialka_id_target_date";

    public void Configure(EntityTypeBuilder<DynamicObservation> builder)
    {
        builder.ToTable("dynamic_observations");

        builder.HasKey(o => o.Id);

        builder.Property(o => o.Id)
            .HasColumnName("id")
            .UseIdentityByDefaultColumn();

        builder.Property(o => o.ParcelId)
            .HasColumnName("dzialka_id")
            .HasConversion(
                id => id.Value,
                value => ParcelIdVo.Create(value).Value)
            .HasMaxLength(ParcelIdVo.MaxLength)
            .IsRequired();

        builder.Property(o => o.TargetDate)
            .HasColumnName("target_date")
            .HasColumnType("date")
            .IsRequired();

        builder.Property(o => o.Precip30dMm).HasColumnName("precip_30d_mm").HasPrecision(7, 2);
        builder.Property(o => o.Precip90dMm).HasColumnName("precip_90d_mm").HasPrecision(7, 2);
        builder.Property(o => o.Precip10yrAvg90dMm).HasColumnName("precip_10yr_avg_90d_mm").HasPrecision(7, 2);
        builder.Property(o => o.Et090dMm).HasColumnName("et0_90d_mm").HasPrecision(7, 2);
        builder.Property(o => o.DrySpellDays).HasColumnName("dry_spell_days");

        builder.Property(o => o.WindowMonths)
            .HasColumnName("window_months")
            .HasColumnType("jsonb")
            .HasConversion(
                months => JsonSerializer.Serialize(months, JsonSerializerOptions.Default),
                json => JsonSerializer.Deserialize<WeatherMonth[]>(json, JsonSerializerOptions.Default) ?? Array.Empty<WeatherMonth>(),
                new ValueComparer<IReadOnlyList<WeatherMonth>>(
                    (a, b) => a!.SequenceEqual(b!),
                    months => months.Aggregate(0, (hash, m) => HashCode.Combine(hash, m)),
                    months => months.ToArray()))
            .IsRequired();

        builder.Property(o => o.NdviMean).HasColumnName("ndvi_mean").HasPrecision(5, 4);
        builder.Property(o => o.NdwiMean).HasColumnName("ndwi_mean").HasPrecision(5, 4);
        builder.Property(o => o.SatelliteSceneDate).HasColumnName("satellite_scene_date").HasColumnType("date");
        builder.Property(o => o.CloudCoverPct).HasColumnName("cloud_cover_pct").HasPercentConversion();

        builder.Property(o => o.SatelliteStatus)
            .HasColumnName("satellite_status")
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(o => o.FetchedAt)
            .HasColumnName("fetched_at")
            .HasColumnType("timestamptz")
            .IsRequired();

        builder.HasIndex(o => new { o.ParcelId, o.TargetDate })
            .HasDatabaseName(ParcelDateIndexName)
            .IsUnique();

        builder.HasOne(o => o.Parcel)
            .WithMany(p => p.Observations)
            .HasForeignKey(o => o.ParcelId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
