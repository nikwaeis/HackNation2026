using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace WodoPlon.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LocalWaterImport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "water_data_date",
                table: "parcel_static_profiles",
                type: "date",
                nullable: true);

            // one row per bulk dataset (scripts/import-osm-water.sh writes "osm_water"); not an EF entity
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS data_imports (
                    name        varchar(50) PRIMARY KEY,
                    imported_at timestamptz NOT NULL,
                    source_date date        NOT NULL
                );
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TABLE IF EXISTS data_imports;");

            migrationBuilder.DropColumn(
                name: "water_data_date",
                table: "parcel_static_profiles");
        }
    }
}
