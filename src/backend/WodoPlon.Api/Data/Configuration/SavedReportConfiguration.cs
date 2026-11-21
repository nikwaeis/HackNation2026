using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Data.Configuration;

public class SavedReportConfiguration : IEntityTypeConfiguration<SavedReport>
{
    public void Configure(EntityTypeBuilder<SavedReport> builder)
    {
        builder.ToTable("saved_reports");

        builder.HasKey(r => r.Id);

        builder.Property(r => r.Id)
            .HasColumnName("report_uuid")
            .HasColumnType("uuid");

        builder.Property(r => r.ParcelId)
            .HasColumnName("dzialka_id")
            .HasConversion(
                id => id.Value,
                value => ParcelIdVo.Create(value).Value)
            .HasMaxLength(ParcelIdVo.MaxLength)
            .IsRequired();

        builder.Property(r => r.CropId)
            .HasColumnName("crop_id")
            .HasConversion(
                id => id.Value,
                value => CropIdVo.Create(value).Value)
            .HasMaxLength(CropIdVo.MaxLength)
            .IsRequired();

        builder.Property(r => r.TargetDate)
            .HasColumnName("target_date")
            .HasColumnType("date")
            .IsRequired();

        builder.Property(r => r.WaterDeficitLevel)
            .HasColumnName("water_deficit_level")
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(r => r.Payload)
            .HasColumnName("report_payload")
            // json, not jsonb: keeps the text as written, so GET /api/reports/{id} returns it byte for byte
            .HasColumnType("json")
            .IsRequired();

        builder.Property(r => r.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamptz")
            .IsRequired();

        // reports are kept forever → parcel/crop removal must not wipe them silently
        builder.HasOne(r => r.Parcel)
            .WithMany(p => p.Reports)
            .HasForeignKey(r => r.ParcelId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(r => r.Crop)
            .WithMany(c => c.Reports)
            .HasForeignKey(r => r.CropId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
