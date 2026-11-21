using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;

namespace WodoPlon.Api.Data.Configuration;

public class HydroFeatureConfiguration : IEntityTypeConfiguration<HydroFeature>
{
    public void Configure(EntityTypeBuilder<HydroFeature> builder)
    {
        builder.ToTable("hydro_features");

        builder.HasKey(h => h.Id);

        builder.Property(h => h.Id)
            .HasColumnName("id")
            .UseIdentityByDefaultColumn();

        builder.Property(h => h.Type)
            .HasColumnName("feature_type")
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(h => h.Name)
            .HasColumnName("name")
            .HasMaxLength(HydroFeature.NameMaxLength)
            .IsRequired(false);

        builder.Property(h => h.Geom)
            .HasColumnName("geom")
            .HasColumnType($"geometry(Geometry,{Parcel.Srid})")
            .IsRequired();

        // GIST: nearest-water ST_Distance / ST_DWithin lookups
        builder.HasIndex(h => h.Geom)
            .HasMethod("gist")
            .HasDatabaseName("ix_hydro_features_geom");
    }
}
