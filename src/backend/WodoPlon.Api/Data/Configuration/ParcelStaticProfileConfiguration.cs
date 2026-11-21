using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Data.Configuration;

public class ParcelStaticProfileConfiguration : IEntityTypeConfiguration<ParcelStaticProfile>
{
    public void Configure(EntityTypeBuilder<ParcelStaticProfile> builder)
    {
        builder.ToTable("parcel_static_profiles");

        builder.HasKey(p => p.ParcelId);

        builder.Property(p => p.ParcelId)
            .HasColumnName("dzialka_id")
            .HasConversion(
                id => id.Value,
                value => ParcelIdVo.Create(value).Value)
            .HasMaxLength(ParcelIdVo.MaxLength);

        builder.Property(p => p.MeanSlopeDeg).HasColumnName("mean_slope_deg").HasPrecision(5, 2);
        builder.Property(p => p.MaxSlopeDeg).HasColumnName("max_slope_deg").HasPrecision(5, 2);
        builder.Property(p => p.SteepAreaPct).HasColumnName("steep_area_pct").HasPercentConversion();

        builder.Property(p => p.SandPct).HasColumnName("sand_pct").HasPercentConversion();
        builder.Property(p => p.ClayPct).HasColumnName("clay_pct").HasPercentConversion();
        builder.Property(p => p.SiltPct).HasColumnName("silt_pct").HasPercentConversion();
        builder.Property(p => p.OrganicCarbonGKg).HasColumnName("organic_carbon_g_kg").HasPrecision(6, 2);
        builder.Property(p => p.AwcMmPerM).HasColumnName("awc_mm_per_m").HasPrecision(6, 2);

        builder.Property(p => p.SoilDroughtVulnerability)
            .HasColumnName("soil_drought_vulnerability")
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(p => p.NearestWaterDistM).HasColumnName("nearest_water_dist_m").HasPrecision(10, 2);

        builder.Property(p => p.NearestWaterType)
            .HasColumnName("nearest_water_type")
            .HasConversion<string>()
            .HasMaxLength(30);

        builder.Property(p => p.FetchedAt)
            .HasColumnName("fetched_at")
            .HasColumnType("timestamptz")
            .IsRequired();

        builder.HasOne(p => p.Parcel)
            .WithOne(p => p.StaticProfile)
            .HasForeignKey<ParcelStaticProfile>(p => p.ParcelId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal static class PercentPropertyExtensions
{
    /// <summary> PercentVo? ↔ NUMERIC(5,2) </summary>
    public static PropertyBuilder<PercentVo?> HasPercentConversion(this PropertyBuilder<PercentVo?> property) =>
        property
            .HasConversion<decimal?>(
                v => v.HasValue ? v.Value.Value : null,
                value => value.HasValue ? PercentVo.Create(value.Value).Value : null)
            .HasPrecision(5, 2);
}
