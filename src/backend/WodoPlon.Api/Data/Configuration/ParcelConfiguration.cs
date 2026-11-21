using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Data.Configuration;

public class ParcelConfiguration : IEntityTypeConfiguration<Parcel>
{
    public void Configure(EntityTypeBuilder<Parcel> builder)
    {
        builder.ToTable("parcels");

        builder.HasKey(p => p.Id);

        builder.Property(p => p.Id)
            .HasColumnName("dzialka_id")
            .HasConversion(
                id => id.Value,
                value => ParcelIdVo.Create(value).Value)
            .HasMaxLength(ParcelIdVo.MaxLength);

        builder.Property(p => p.Voivodeship)
            .HasColumnName("voivodeship")
            .HasMaxLength(Parcel.VoivodeshipMaxLength)
            .IsRequired(false);

        builder.Property(p => p.AreaHa)
            .HasColumnName("area_ha")
            .HasPrecision(10, 4)
            .IsRequired();

        builder.Property(p => p.Centroid)
            .HasColumnName("centroid")
            .HasColumnType($"geometry(Point,{Parcel.Srid})")
            .IsRequired();

        builder.Property(p => p.Geom)
            .HasColumnName("geom")
            .HasColumnType($"geometry(MultiPolygon,{Parcel.Srid})")
            .IsRequired();

        builder.Property(p => p.FetchedAt)
            .HasColumnName("fetched_at")
            .HasColumnType("timestamptz")
            .IsRequired();

        builder.HasIndex(p => p.Geom)
            .HasMethod("gist")
            .HasDatabaseName("ix_parcels_geom");
    }
}
