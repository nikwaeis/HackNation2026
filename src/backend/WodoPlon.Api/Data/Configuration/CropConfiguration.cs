using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using WodoPlon.Domain.Entities;
using WodoPlon.Domain.ValueObjects;

namespace WodoPlon.Api.Data.Configuration;

public class CropConfiguration : IEntityTypeConfiguration<Crop>
{
    public void Configure(EntityTypeBuilder<Crop> builder)
    {
        builder.ToTable("crops");

        builder.HasKey(c => c.Id);

        builder.Property(c => c.Id)
            .HasColumnName("id")
            .HasConversion(
                id => id.Value,
                value => CropIdVo.Create(value).Value)
            .HasMaxLength(CropIdVo.MaxLength);

        builder.Property(c => c.NamePl)
            .HasColumnName("name_pl")
            .HasMaxLength(Crop.NameMaxLength)
            .IsRequired();

        builder.Property(c => c.KcInitial)
            .HasColumnName("kc_initial")
            .HasPrecision(4, 2)
            .IsRequired();

        builder.Property(c => c.KcMid)
            .HasColumnName("kc_mid")
            .HasPrecision(4, 2)
            .IsRequired();

        builder.Property(c => c.KcLate)
            .HasColumnName("kc_late")
            .HasPrecision(4, 2)
            .IsRequired();

        builder.Property(c => c.CriticalMonths)
            .HasColumnName("critical_months")
            .HasColumnType("integer[]")
            .IsRequired();

        builder.Property(c => c.RootDepthCm)
            .HasColumnName("root_depth_cm")
            .IsRequired();
    }
}
